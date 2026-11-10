import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/solq-notifications/handler.mjs';
import {runOnce,emailFor,createGmailProvider} from '../ops/notifications/worker.mjs';
const admin='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const order=()=>({token:token(),customer_name:'Synthetic fixture',contact:'fixture@example.invalid',service_type:'website',description:'Synthetic requirements',privacy_consent:true,transfer_consent:true});
test('notification database: intake, capability, outbox, fencing and RLS',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;grant usage on schema auth to public;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.admin_users(user_id uuid primary key);insert into public.admin_users values('${admin}');
   alter table public.admin_users enable row level security;grant select on public.admin_users to authenticated;
   create policy self_admin on public.admin_users for select to authenticated using(user_id=auth.uid());
   create table public.applications(id uuid primary key default gen_random_uuid(),receipt_number text unique default 'NX-20261110-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),created_at timestamptz not null default now(),customer_name text,contact text,service_type text,description text,privacy_consent boolean,status text,internal_note text);
   create table public.production_jobs(application_id uuid,production_approved_at timestamptz,production_approved_by uuid);grant select on public.production_jobs to service_role;
   insert into public.applications(customer_name,contact,description,status,created_at) values('Historical synthetic','history@example.invalid','Preserve unchanged','received',now()-interval '1 day');`);
  await db.exec(await readFile(new URL('../candidates/customer-notifications-20261110/schema.sql',import.meta.url),'utf8'));
  const rpc=async(action,data={})=>{await db.exec('set role service_role');try{return (await db.query('select public.solq_notification_command($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value;}finally{await db.exec('reset role');}};
  const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
  const historic=await db.query('select * from applications order by id');let input=order(),receipt,job;
  await t.test('delivery and capture disabled by default; no historic sends',async()=>{
   assert.equal((await rpc('claim')).disabled,true);assert.equal((await rpc('reconcile')).disabled,true);
   assert.equal(await scalar('select count(*)::int from solq_notification_outbox'),0);
  });
  await t.test('idempotent intake binds immutable payload and only hashes capability',async()=>{
   receipt=(await rpc('submit',input)).receipt_number;
   assert.equal((await rpc('submit',input)).receipt_number,receipt);
   await assert.rejects(rpc('submit',{...input,description:'Changed'}),/idempotency conflict/);
   assert.equal(await scalar('select count(*)::int from applications'),2);
   assert.notEqual(await scalar('select token_hash from solq_notification_private.intake_tokens'),input.token);
   await assert.rejects(rpc('submit',{...order(),transfer_consent:false}),/invalid intake/);
  });
  await t.test('notification queue outage cannot cancel a new saved application',async()=>{
   await db.exec('alter table solq_notification_outbox rename to fixture_offline_outbox');
   const result=await rpc('submit',order());assert.match(result.receipt_number,/^NX-/);
   await db.exec('alter table fixture_offline_outbox rename to solq_notification_outbox');
   assert.equal(await scalar('select count(*)::int from applications'),3);
  });
  await t.test('capability and receipt both required; account click cannot confirm deposit',async()=>{
   await assert.rejects(rpc('account_event',{token:token(),receipt_number:receipt,kind:'account_viewed'}),/invalid capability/);
   await assert.rejects(rpc('account_event',{token:input.token,receipt_number:'NX-20261110-00000000',kind:'account_viewed'}),/invalid capability/);
   await assert.rejects(rpc('account_event',{token:input.token,receipt_number:receipt,kind:'deposit_confirmed'}),/invalid event/);
   for(let i=0;i<3;i++)await rpc('account_event',{token:input.token,receipt_number:receipt,kind:'account_copy_requested'});
   assert.equal(await scalar("select count(*)::int from solq_customer_events where kind='account_copy_requested'"),1);
   assert.equal(await scalar(`select status from applications where receipt_number='${receipt}'`),'received');
  });
  await t.test('reconciliation recovers requests once, excludes history and addresses',async()=>{
   await db.exec("update solq_notification_private.settings set capture_from=now()-interval '1 hour',admin_email_enabled=true,customer_email_enabled=true");
   assert.equal((await rpc('reconcile')).enqueued,5);assert.equal((await rpc('reconcile')).enqueued,0);
   const tables=JSON.stringify((await db.query('select * from solq_customer_events')).rows)+JSON.stringify((await db.query('select * from solq_notification_outbox')).rows);
   assert.ok(!tables.includes('fixture@example.invalid')&&!tables.includes(input.token));
   assert.equal((await rpc('claim')).disabled,true);
  });
  await t.test('lease claim excludes duplicate; stale token rejected; acceptance recorded once',async()=>{
   await db.exec('update solq_notification_private.settings set delivery_enabled=true,daily_attempt_limit=1');
   job=await rpc('claim');assert.equal((await rpc('claim')).reason,'daily_limit');
   await db.exec('update solq_notification_private.settings set daily_attempt_limit=50');
   const second=await rpc('claim');assert.notEqual(second.id,job.id);
   await assert.rejects(rpc('finish',{id:job.id,lease_token:crypto.randomUUID(),outcome:'accepted'}),/stale lease/);
   await rpc('finish',{id:job.id,lease_token:job.lease_token,outcome:'accepted',provider_id:'synthetic-provider-id'});
   await assert.rejects(rpc('finish',{id:job.id,lease_token:job.lease_token,outcome:'accepted'}),/stale lease/);
  });
  await t.test('expired in-flight work becomes uncertain and is never reclaimed',async()=>{
   await db.exec("update solq_notification_outbox set lease_until=now()-interval '1 minute' where status='sending'");
   await rpc('claim');assert.equal(await scalar("select count(*)::int from solq_notification_outbox where status='uncertain' and error_code='lease_expired'"),1);
   assert.equal(await scalar("select count(*)::int from solq_notification_attempts where outcome='uncertain'"),1);
  });
  await t.test('bounded backoff stops after three explicit rejected attempts',async()=>{
   await db.exec("update solq_notification_outbox set status='skipped',lease_token=null,lease_until=null where status<>'accepted'");
   const target=await scalar("select id from solq_notification_outbox where status='skipped' limit 1");
   await db.query("update solq_notification_outbox set status='requested',attempts=0,next_attempt_at=now() where id=$1",[target]);
   for(let n=1;n<=3;n++){
    const j=await rpc('claim');assert.equal(j.id,target);
    const result=await rpc('finish',{id:j.id,lease_token:j.lease_token,outcome:'retry_wait',error_code:'rate_limited'});
    assert.equal(result.status,n===3?'failed':'retry_wait');
    if(n<3){assert.equal(await rpc('claim'),null);await db.query('update solq_notification_outbox set next_attempt_at=now() where id=$1',[target]);}
   }
   assert.equal(await rpc('claim'),null);
  });
  await t.test('anonymous and ordinary authenticated users cannot read or mutate notifications',async()=>{
   await db.exec('set role anon');await assert.rejects(db.query('select * from solq_customer_events'),/permission denied/);await assert.rejects(db.query("select solq_notification_command('claim','{}')"),/permission denied/);await db.exec('reset role;set role authenticated');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.equal((await db.query('select * from solq_notification_outbox')).rows.length,0);
   await assert.rejects(db.query('delete from solq_notification_outbox'),/permission denied/);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);assert.equal((await db.query('select * from solq_notification_outbox')).rows.length,5);
   await db.exec('reset role');
   assert.deepEqual((await db.query('select * from applications where id=$1',[historic.rows[0].id])).rows,historic.rows);
  });
  await t.test('deposit event observes actual status transition, independent of send failure',async()=>{
   await db.query("update applications set status='deposit_confirmed' where receipt_number=$1",[receipt]);
   assert.equal(await scalar("select count(*)::int from solq_customer_events where kind='deposit_confirmed'"),1);
   await db.exec('alter table solq_customer_events rename to fixture_offline_events');
   await db.query("update applications set status='deposit_confirmed' where receipt_number<>$1 and created_at>now()-interval '1 hour'",[receipt]);
   await db.exec('alter table fixture_offline_events rename to solq_customer_events');
   assert.equal((await rpc('reconcile')).enqueued,4);
  });
 }finally{await db.close();}
});

const job={id:'11111111-1111-4111-8111-111111111111',lease_token:'synthetic',receipt_number:'NX-20261110-AABBCCDD',kind:'application_received',audience:'admin'};
const config={liveSend:'approved',approvalId:'SYNTHETIC-ONLY',sender:'sender@example.invalid',adminEmail:'admin@example.invalid'};
test('worker default denial makes zero calls',async()=>{
 let calls=0;const result=await runOnce({command:()=>calls++,provider:{send:()=>calls++}});assert.equal(result.blocked,'not_approved');assert.equal(calls,0);
});
test('Gmail adapter classifies accepted, rejected, rate-limit and ambiguous outcomes',async()=>{
 const cases=[[200,{id:'synthetic'},'accepted'],[429,{},'retry_wait'],[500,{},'uncertain'],[401,{},'failed'],[200,{},'uncertain']];
 for(const [code,body,outcome] of cases){const p=createGmailProvider({getAccessToken:async()=> 'synthetic-not-real',fetchFn:async(url,options)=>{assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.ok(!JSON.stringify(options).includes('refresh_token'));return new Response(JSON.stringify(body),{status:code});}});assert.equal((await p.send(emailFor(job,config))).outcome,outcome);}
 const p=createGmailProvider({getAccessToken:async()=> 'synthetic',fetchFn:async()=>{throw Error('timeout');}});assert.equal((await p.send(emailFor(job,config))).outcome,'uncertain');
});
test('worker rejects header injection and does not send to phone contacts',async()=>{
 assert.throws(()=>emailFor({...job,audience:'customer',contact:'x@example.invalid\r\nBcc: someone@example.invalid'},config),/invalid_recipient/);
 let sent=0,finished;await runOnce({config,provider:{send:()=>sent++},command:async(action,data)=>{if(action==='claim')return {...job,audience:'customer',contact:'000-test-phone'};if(action==='finish')finished=data;return {};}});
 assert.equal(sent,0);assert.equal(finished.outcome,'skipped');assert.equal(finished.error_code,'invalid_recipient');
});
test('gateway rejects untrusted origins, oversized bodies, worker and admin impersonation',async()=>{
 let calls=0;const handler=createHandler({url:'https://project.supabase.co',serviceKey:'synthetic',workerKey:'x'.repeat(32),enabled:true,origins:['https://solqtech.com'],fetchFn:async(url)=>{calls++;if(url.endsWith('/auth/v1/user'))return Response.json({id:other});if(url.includes('/admin_users?'))return Response.json([]);throw Error('unexpected network');}});
 const req=(body,headers={})=>new Request('https://edge.invalid',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await handler(req({action:'submit'},{Origin:'https://evil.invalid'}))).status,403);assert.equal(calls,0);
 assert.equal((await handler(req({action:'claim'},{Authorization:'Bearer wrong'}))).status,403);
 assert.equal((await handler(req({action:'snapshot',actor:admin},{Authorization:'Bearer synthetic'}))).status,403);
 assert.equal((await handler(req({action:'submit',description:'x'.repeat(17000)}))).status,413);
 const off=createHandler({enabled:false,fetchFn:()=>{throw Error('network forbidden');}});assert.equal((await off(req({action:'submit'}))).status,503);
});
test('client retries use same capability, retain no plaintext PII and never call legacy on failure',async()=>{
 const storage=new Map();let fail=true;const sent=[];
 const context={window:{NEXUS_CONFIG:{SOLQ_NOTIFICATIONS_ENABLED:true,SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'synthetic'}},document:{getElementById:()=>null},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,TextEncoder,URL,AbortSignal,Uint8Array,fetch:async(url,options)=>{sent.push(JSON.parse(options.body));if(fail)throw Error('synthetic disconnect');return Response.json({receipt_number:'NX-20261110-AABBCCDD'});}};
 vm.runInNewContext(await readFile(new URL('../candidates/customer-notifications-20261110/client.js',import.meta.url),'utf8'),context);
 const input=order();delete input.token;await assert.rejects(context.window.SOLQ_NOTIFICATIONS.submit(input));fail=false;
 assert.equal(await context.window.SOLQ_NOTIFICATIONS.submit(input),'NX-20261110-AABBCCDD');assert.equal(sent[0].token,sent[1].token);
 assert.ok(![...storage.values()].join('').includes(input.contact));assert.ok(![...storage.values()].join('').includes(input.description));
});
