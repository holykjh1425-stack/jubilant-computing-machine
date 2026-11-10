import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
test('new intake integrates with reconstructed existing quote, deposit and separate approval gates',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const admin='10000000-0000-4000-8000-000000000001',ordinary='10000000-0000-4000-8000-000000000002';
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const as=async(role,sub,sql,args=[])=>{await db.exec('set role '+role);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub})]);try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
 const notify=async(action,data={})=>(await as('service_role',null,'select public.solq_notification_command($1,$2::jsonb)',[action,JSON.stringify(data)])).rows[0].solq_notification_command;
 const rpc=async(name,args)=>(await as('authenticated',admin,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0][name];
 try{
  const base='candidates/command-recovery-20261105/';
  await db.exec(await read(base+'platform-test-adapters.sql'));await db.exec(await read(base+'00-initial-schema.sql'));
  for(const f of (await readdir(new URL(base+'history/',root))).sort()){
   if(f.startsWith('20261026'))await db.exec(await read(base+'10-untracked-approval-prerequisites.sql'));
   await db.exec((await read(base+'history/'+f)).replace(/^(?:create extension(?: if not exists)? pg_(?:cron|net)[^;]*;|drop extension pg_net;)/gmi,'-- isolated platform adapter'));
  }
  await db.exec(await read('ops/free-plan-automation/quote-evidence.sql'));await db.exec(await read('ops/admin-integration-candidate/quote-deposit-guard.sql'));
  await db.exec(await read('candidates/customer-notifications-20261110/schema.sql'));
  await db.query('insert into auth.users(id) values($1),($2)',[admin,ordinary]);await db.query('insert into admin_users(user_id) values($1)',[admin]);
  await db.exec("update solq_notification_private.settings set capture_from=now()-interval '1 minute',admin_email_enabled=true,customer_email_enabled=true");
  const token='c'.repeat(64),payload={id:crypto.randomUUID(),receipt_number:'NX-20261110-AABBCCDD',token,customer_name:'Synthetic integration',contact:'integration@example.invalid',description:'Synthetic free plan request',service_type:'website',privacy_consent:true,transfer_consent:true};
  const receipt=await notify('submit',payload);assert.equal(receipt.receipt_number,payload.receipt_number);
  await db.exec('select nexus_production_private.free_cycle();select nexus_production_private.tick();');
  assert.equal(await scalar('select count(*)::int from ai_work_plans'),1);
  assert.equal(await scalar('select count(*)::int from production_jobs'),1);
  const app=payload.id;
  await notify('account_event',{token,receipt_number:receipt.receipt_number,kind:'account_copied'});
  assert.equal(await scalar('select status from applications where id=$1',[app]),'received');
  await assert.rejects(rpc('solq_approve_production',[app]));
  const quote=await rpc('solq_quote_ledger',['issue_quote',{application_id:app,quote_reference:'SYNTHETIC-Q',amount_krw:100000,expires_at:new Date(Date.now()+3600000).toISOString()}]);
  await rpc('solq_record_quote_evidence',[{application_id:app,quote_reference:quote.quote_reference,quote_version:String(quote.version),amount_krw:100000,accepted:true,evidence_verified:true,accepted_at:await scalar('select clock_timestamp()::text'),evidence_reference:'synthetic/consent'}]);
  const deposit=await rpc('solq_quote_ledger',['record_deposit',{application_id:app,quote_id:quote.id,amount_krw:30000,paid_at:await scalar('select clock_timestamp()::text'),transaction_reference:'SYNTHETIC',evidence_reference:'synthetic/bank'}]);
  await assert.rejects(rpc('solq_approve_production',[app]));
  await rpc('solq_quote_ledger',['confirm_deposit',{application_id:app,quote_id:quote.id,deposit_id:deposit.id,bank_verified:true}]);
  await as('authenticated',admin,"update applications set status='deposit_confirmed' where id=$1",[app]);
  assert.equal(await scalar('select count(*)::int from production_attempts'),0);
  assert.equal(await scalar("select count(*)::int from solq_customer_events where kind='deposit_confirmed'"),1);
  await notify('reconcile');assert.equal(await scalar('select count(*)::int from solq_notification_outbox'),5);
  assert.equal((await notify('claim')).disabled,true);
  await assert.rejects(as('authenticated',ordinary,'select public.solq_approve_production($1)',[app]));
  const approved=await rpc('solq_approve_production',[app]);assert.equal(approved.approved,true);
  assert.equal((await rpc('solq_approve_production',[app])).duplicate,true);
  // Durable, separately authorized production approval can recover a missing deposit
  // event even after the application has moved beyond deposit_confirmed.
  await db.exec("delete from solq_notification_attempts;delete from solq_notification_outbox;delete from solq_customer_events where kind='deposit_confirmed'");
  await as('authenticated',admin,"update applications set status='in_progress' where id=$1",[app]);
  await notify('reconcile');assert.equal(await scalar("select count(*)::int from solq_customer_events where kind='deposit_confirmed'"),1);
  assert.equal(await scalar('select count(*)::int from production_attempts'),0);
  assert.equal(await scalar('select count(*)::int from net.http_request_queue'),0);
 }finally{await db.close();}
});
