import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to public;create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 create table admin_users(user_id uuid primary key);insert into admin_users values('${admin}');grant select on admin_users to authenticated;alter table admin_users enable row level security;create policy own_admin on admin_users for select to authenticated using(user_id=auth.uid());
 create table applications(id uuid primary key default gen_random_uuid(),receipt_number text unique default 'NX-TEST-'||gen_random_uuid()::text,created_at timestamptz default now(),customer_name text,contact text,service_type text,description text,privacy_consent boolean,status text,internal_note text);
 insert into applications(customer_name,status,created_at) values('fictional A','received',now()-interval '1 day'),('fictional B','received',now()-interval '1 day'),('fictional C','received',now()-interval '1 day');
 create schema nexus_orchestrator_private;create table nexus_orchestrator_private.worker_state(singleton boolean,test_requested boolean);insert into nexus_orchestrator_private.worker_state values(true,true);
 create schema cron;create table cron.jobs(name text,schedule text,command text);create function cron.schedule(name text,schedule text,command text) returns bigint language plpgsql as $$begin insert into cron.jobs values(name,schedule,command);return 1;end$$;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261021213341_production_core.sql',import.meta.url),'utf8'));
 await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
 const rpc=async(action,data={})=>(await db.query('select public.nexus_production_command($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value;
 return {db,rpc};}
const order=k=>({token:k,customer_name:'TEST fictional customer',contact:'test@example.invalid',service_type:'website',description:'TEST 소개 페이지 및 로그인 미리보기',privacy_consent:true,transfer_consent:true});
test('customer pipeline: immutable legacy data, payment/budget gates, durable execution and capability delivery',async t=>{
 const {db,rpc}=await setup();try{
 const legacy=(await db.query("select * from applications where customer_name like 'fictional %' order by customer_name")).rows;
 await t.test('initial capture excludes existing three customers and disarms Claude',async()=>{
  assert.equal((await db.query('select nexus_production_private.tick() n')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from production_jobs')).rows[0].n,0);
  assert.equal((await db.query('select test_requested from nexus_orchestrator_private.worker_state')).rows[0].test_requested,false);
 });
 const k=token(),payload=order(k),receipt=await rpc('submit',payload);
 const j=(await db.query('select * from production_jobs')).rows[0];
 await t.test('receipt creation is idempotent and capability only stores its hash',async()=>{
  assert.equal((await rpc('submit',payload)).receipt_number,receipt.receipt_number);
  await assert.rejects(rpc('submit',{...payload,description:'changed'}),/idempotency conflict/);
  assert.equal((await db.query('select count(*)::int n from applications')).rows[0].n,4);
  assert.notEqual((await db.query('select token_hash from nexus_production_private.access_keys')).rows[0].token_hash,k);
  const missing=order(token());delete missing.transfer_consent;await assert.rejects(rpc('submit',missing),/invalid order/);
 });
 await t.test('preview works, wrong capability cannot reveal status or result',async()=>{
  assert.equal(j.provider,'codex');assert.equal(j.plan.classification_method,'rules');assert.equal(j.plan.features.login,true);
  assert.equal(await rpc('portal',{receipt_number:receipt.receipt_number,token:token()}),null);
  const p=await rpc('portal',{receipt_number:receipt.receipt_number,token:k});assert.equal(p.status,'awaiting_deposit');assert.equal(p.result,null);assert.ok(!('requirements' in p.preview));
 });
 await t.test('enabled worker cannot claim unpaid work; disabled credit gate reserves nothing',async()=>{
  const blocked=await rpc('claim',{provider:'codex'});assert.ok(blocked.blocked);assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,0);
  await db.exec("update nexus_production_private.providers set enabled=true,verified_at=now(),model='configured-test-model',approved_calls=1 where provider='codex'");
  assert.equal(await rpc('claim',{provider:'codex'}),null);
 });
 await db.query("update applications set status='deposit_confirmed' where id=$1",[j.application_id]);await db.query('select nexus_production_private.tick()');
 const claimed=await rpc('claim',{provider:'codex'});
 await t.test('admin deposit confirmation leads to one leased attempt and no concurrent duplicate',async()=>{
  assert.equal(claimed.id,j.id);assert.equal(claimed.execution_authorized,true);assert.ok((await rpc('claim',{provider:'codex'})).blocked);
  assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,1);
  await assert.rejects(rpc('finish',{job_id:j.id,lease:crypto.randomUUID(),success:false}),/stale execution lease/);
 });
 const artifact={summary:'TEST reviewed deliverable',files:[{path:'index.html',content:'<!doctype html><title>TEST</title><h1>TEST</h1>'}]};
 await rpc('finish',{job_id:j.id,lease:claimed.lease,success:true,result:artifact,validation:{passed:true},usage:{input_tokens:1,output_tokens:1}});
 const ready=(await db.query('select * from production_jobs where id=$1',[j.id])).rows[0];
 await t.test('result stays private until exact-hash admin review and release',async()=>{
  assert.equal(ready.status,'awaiting_review');assert.equal((await rpc('portal',{receipt_number:receipt.receipt_number,token:k})).result,null);
  await assert.rejects(rpc('release',{actor:other,job_id:j.id,expected_hash:ready.result_hash}),/admin required/);
  await assert.rejects(rpc('release',{actor:admin,job_id:j.id,expected_hash:'stale'}),/review stale/);
  await rpc('release',{actor:admin,job_id:j.id,expected_hash:ready.result_hash});
  assert.deepEqual((await rpc('portal',{receipt_number:receipt.receipt_number,token:k})).result,artifact);
  await assert.rejects(rpc('release',{actor:admin,job_id:j.id,expected_hash:ready.result_hash}),/review stale/);
 });
 await t.test('reissued link invalidates the previous capability without customer changes',async()=>{
  const link=await rpc('issue_link',{actor:admin,job_id:j.id});assert.equal(await rpc('portal',{receipt_number:receipt.receipt_number,token:k}),null);
  assert.equal((await rpc('portal',link)).status,'released');
 });
 await t.test('OpenAI cannot run without verified credits and an approved atomic budget',async()=>{
  const a=await rpc('submit',{...order(token()),service_type:'ai_automation'});
  await db.query("update applications set status='deposit_confirmed' where receipt_number=$1",[a.receipt_number]);
  assert.ok((await rpc('claim',{provider:'openai'})).blocked);
  await db.exec("update nexus_production_private.providers set enabled=true,verified_at=now(),model='test',approved_calls=1,input_micro_per_token=1,output_micro_per_token=2,approved_micro_usd=1 where provider='openai'");
  assert.equal((await rpc('claim',{provider:'openai'})).blocked,'approved_budget_exhausted');
  assert.equal((await db.query("select reserved_calls from nexus_production_private.providers where provider='openai'")).rows[0].reserved_calls,0);
 });
 await t.test('legacy intake is captured additively and classified without modifying its row',async()=>{
  const x=(await db.query("insert into applications(customer_name,service_type,description,status) values('TEST legacy path','consulting','TEST 요구사항','received') returning *")).rows[0];
  assert.equal((await db.query('select nexus_production_private.tick() n')).rows[0].n,1);
  assert.deepEqual((await db.query('select * from applications where id=$1',[x.id])).rows[0],x);
 });
 await t.test('no anonymous table/RPC access, no client writes, no legacy data mutation',async()=>{
  await db.exec('set role anon');await assert.rejects(db.query('select * from production_jobs'),/permission denied/);await assert.rejects(rpc('snapshot',{actor:admin}),/permission denied/);
  await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:other})]);assert.equal((await db.query('select * from production_jobs')).rows.length,0);
  await assert.rejects(db.query('delete from production_jobs'),/permission denied/);await db.exec('reset role');assert.deepEqual((await db.query("select * from applications where customer_name like 'fictional %' order by customer_name")).rows,legacy);
 });
 }finally{await db.close();}
});
