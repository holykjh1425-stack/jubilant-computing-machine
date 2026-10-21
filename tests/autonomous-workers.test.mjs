import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {executeFree} from '../supabase/functions/nexus-orchestrator/engine.mjs';
const admin='11111111-1111-4111-8111-111111111111';
test('autonomous cycle: actual SQL free workflow parity, worker scope, one-shot dispatch and customer preservation',async t=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to public;
 create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 create table admin_users(user_id uuid primary key,created_at timestamptz default now());insert into admin_users(user_id)values('${admin}');
 alter table admin_users enable row level security;grant select on admin_users to authenticated;create policy own_admin on admin_users for select to authenticated using(user_id=auth.uid());
 create table applications(id int,status text);insert into applications values(1,'received'),(2,'received'),(3,'reviewing');
 create schema vault;create table vault.decrypted_secrets(name text unique,decrypted_secret text);
 create view vault.secrets as select name from vault.decrypted_secrets;
 create function vault.create_secret(value text,name text) returns uuid language plpgsql as $$begin insert into vault.decrypted_secrets values(name,value);return gen_random_uuid();end$$;
 insert into vault.decrypted_secrets values('nexus_labs_claude_api_key','sk-ant-disposable');
 create schema net;create table net.requests(url text,headers jsonb,body jsonb);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$begin insert into net.requests values(url,headers,body);return 1;end$$;`);
 for(const name of ['20261021121716_nexus_ai_server.sql','20261021124631_central_orchestrator.sql','20261021204404_autonomous_workers.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const before=(await db.query('select * from applications order by id')).rows;
 const rpc=async(action,data={})=>(await db.query('select nexus_orchestrator_private.command($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value;
 await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
 const job=await rpc('submit',{actor:admin,key:crypto.randomUUID(),instruction:'TEST 신규 무료 자동 실행 확인',agent:'internal'});
 await t.test('cycle processes 4 verified dependency stages with engine-compatible results',async()=>{
  assert.equal((await db.query('select nexus_orchestrator_private.run_cycle() n')).rows[0].n,4);
  const rows=(await db.query('select * from orchestrator_tasks where job_id=$1 order by ordinal',[job.id])).rows;
  assert.deepEqual(rows.map(x=>x.status),['completed','completed','completed','awaiting_approval']);
  for(const task of rows){const previous=rows.filter(x=>x.ordinal<task.ordinal).map(x=>x.result);const expected=executeFree({...task,instruction:job.instruction,previous});assert.deepEqual(task.result,expected.result);}
  assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,0);
 });
 await t.test('idle cycles update heartbeat but never call a model',async()=>{
  assert.equal((await db.query('select nexus_orchestrator_private.run_cycle() n')).rows[0].n,0);
  const s=(await db.query('select * from nexus_orchestrator_private.worker_state')).rows[0];assert.equal(s.cycles,2);assert.equal(s.processed,4);assert.equal(s.last_error,null);
 });
 await t.test('one-shot machine dispatch uses encrypted credential reference and fixed synthetic action',async()=>{
  await db.exec('update nexus_orchestrator_private.worker_state set test_requested=true');
  await db.query('select nexus_orchestrator_private.run_cycle()');await db.query('select nexus_orchestrator_private.run_cycle()');
  const rows=(await db.query('select * from net.requests')).rows;assert.equal(rows.length,1);assert.deepEqual(rows[0].body,{action:'connection_test'});assert.equal(rows[0].url,'https://elfacqmvygnwjlklqhiz.supabase.co/functions/v1/nexus-agent-worker');
  assert.equal((await db.query("select nexus_orchestrator_private.worker_command('claim_test','{}') v")).rows[0].v,true);
  assert.equal((await db.query("select nexus_orchestrator_private.worker_command('claim_test','{}') v")).rows[0].v,false);
 });
 await t.test('worker identity cannot read secrets/state or execute cron as a client',async()=>{
  await db.exec('set role anon');await assert.rejects(db.query("select nexus_worker_command('state','{}')"),/permission denied/);await assert.rejects(db.query('select nexus_orchestrator_private.run_cycle()'),/permission denied/);
  await db.exec('reset role;set role authenticated');await assert.rejects(db.query("select nexus_worker_command('state','{}')"),/permission denied/);
  await db.exec('reset role;set role service_role');await assert.rejects(db.query('select nexus_orchestrator_private.run_cycle()'),/permission denied/);
  const state=(await db.query("select nexus_worker_command('state','{}') v")).rows[0].v;assert.equal(state.paid_production_enabled,false);assert.ok(!JSON.stringify(state).includes('sk-ant-'));
 });
 await t.test('existing three customers unchanged',async()=>{await db.exec('reset role');assert.deepEqual((await db.query('select * from applications order by id')).rows,before);});
 }finally{await db.close();}
});
