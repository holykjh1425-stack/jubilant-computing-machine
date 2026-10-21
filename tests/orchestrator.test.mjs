import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {executeFree,tick,CAPABILITIES} from '../supabase/functions/nexus-orchestrator/engine.mjs';
import {createHandler} from '../supabase/functions/nexus-orchestrator/handler.mjs';
const admin='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const newKey=()=>crypto.randomUUID();
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; grant usage on schema auth to public;
 create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 create table admin_users(user_id uuid primary key); insert into admin_users values('${admin}');
 alter table admin_users enable row level security;grant select on admin_users to authenticated;
 create policy own_admin on admin_users for select to authenticated using(user_id=auth.uid());
 create table applications(id int,status text);insert into applications values(1,'received'),(2,'received'),(3,'reviewing');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261021124631_central_orchestrator.sql',import.meta.url),'utf8'));
 async function role(name,sub=admin){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:name,sub})]);await db.exec(`set role ${name}`);}
 async function rpc(p_action,p_data){return (await db.query('select public.nexus_orchestrator_command($1,$2::jsonb) value',[p_action,JSON.stringify(p_data)])).rows[0].value;}
 return {db,role,rpc};
}
test('durable orchestration: PostgreSQL transactions, dependencies, retries, RLS and customer preservation',async t=>{
 const {db,role,rpc}=await setup();
 const before=(await db.query('select * from applications order by id')).rows;
 try{
  await role('service_role');
 for(const table of ['orchestrator_jobs','orchestrator_tasks','orchestrator_events'])assert.equal((await db.query('select * from '+table)).rows.length,0);
 const key=newKey();
  const payload={actor:admin,key,instruction:'웹 제작 요청 범위 검토',agent:'internal'};
  const job=await rpc('submit',payload);
  await t.test('idempotent registration and conflicting payload rejection',async()=>{
   assert.equal((await rpc('submit',payload)).id,job.id);
   await assert.rejects(rpc('submit',{...payload,instruction:'changed'}),/idempotency conflict/);
   await assert.rejects(rpc('submit',{...payload,key:newKey(),actor:other}),/admin required/);
   await assert.rejects(rpc('submit',{...payload,key:newKey(),instruction:'password=secret'}),/credential input forbidden/);
  });
  await t.test('claim lease, no parallel duplicate and no successor before verification',async()=>{
   const task=await rpc('claim',{});assert.equal(task.ordinal,1);
   assert.equal(await rpc('claim',{}),null);
   await assert.rejects(rpc('finish',{task_id:task.id,lease:newKey(),status:'completed',verified:true}),/stale lease/);
   await assert.rejects(rpc('finish',{task_id:task.id,lease:task.lease_token,status:'completed',verified:false}),/verification required/);
   await rpc('finish',{task_id:task.id,lease:task.lease_token,...executeFree(task)});
   await assert.rejects(rpc('finish',{task_id:task.id,lease:task.lease_token,status:'completed',verified:true}),/stale lease/);
  });
  await t.test('collect results, validate and stop at human review',async()=>{
   assert.equal((await tick(rpc)).processed,3);
   await db.exec('reset role');
   const tasks=(await db.query('select * from orchestrator_tasks where job_id=$1 order by ordinal',[job.id])).rows;
   assert.deepEqual(tasks.map(x=>x.status),['completed','completed','completed','awaiting_approval']);
   assert.equal(tasks[2].result.passed,true);
   assert.equal((await db.query('select status from orchestrator_jobs where id=$1',[job.id])).rows[0].status,'awaiting_approval');
  });
  await t.test('external providers block instead of making calls or advancing dependencies',async()=>{
   for(const agent of ['openai','claude','codex','work']){
    await role('service_role');const j=await rpc('submit',{actor:admin,key:newKey(),instruction:'작업 검토',agent});
    assert.equal((await tick(rpc)).processed,2);
    await db.exec('reset role');const rows=(await db.query('select * from orchestrator_tasks where job_id=$1 order by ordinal',[j.id])).rows;
    assert.equal(rows[1].status,'blocked');assert.equal(rows[1].error_code,CAPABILITIES[agent].reason);
    assert.equal(rows[2].status,'queued');
   }
  });
  await t.test('bounded retry with backoff and stop after third safe attempt',async()=>{
   await role('service_role');const j=await rpc('submit',{...payload,key:newKey()});
   for(let attempt=1;attempt<=3;attempt++){
    const task=await rpc('claim',{});assert.equal(task.job_id,j.id);assert.equal(task.attempts,attempt);
    const saved=await rpc('finish',{task_id:task.id,lease:task.lease_token,status:'retry_wait',code:'transient_internal_error'});
    assert.equal(saved.status,attempt===3?'blocked':'retry_wait');
    if(attempt<3){assert.equal(await rpc('claim',{}),null);await db.exec('reset role');await db.query("update orchestrator_tasks set next_attempt_at=now()-interval '1 second' where id=$1",[task.id]);await role('service_role');}
   }
  });
  await t.test('expired lease cannot finish and is recovered with backoff',async()=>{
   await role('service_role');await rpc('submit',{...payload,key:newKey()});const task=await rpc('claim',{});
   await db.exec('reset role');await db.query("update orchestrator_tasks set lease_until=now()-interval '1 second' where id=$1",[task.id]);await role('service_role');
   await assert.rejects(rpc('finish',{task_id:task.id,lease:task.lease_token,...executeFree(task)}),/stale lease/);
   assert.equal(await rpc('claim',{}),null);
   await db.exec('reset role');const row=(await db.query('select * from orchestrator_tasks where id=$1',[task.id])).rows[0];
   assert.equal(row.status,'retry_wait');assert.equal(row.lease_token,null);
  });
  await t.test('anon and non-admin are denied; admin read-only; no secret RPC access',async()=>{
   await role('anon');await assert.rejects(db.query('select * from orchestrator_jobs'),/permission denied/);
   await assert.rejects(rpc('claim',{}),/permission denied/);
   await role('authenticated',other);assert.equal((await db.query('select * from orchestrator_jobs')).rows.length,0);
   await role('authenticated',admin);assert.ok((await db.query('select * from orchestrator_jobs')).rows.length>0);
   await assert.rejects(db.query('delete from orchestrator_jobs'),/permission denied/);
   await assert.rejects(db.query("insert into orchestrator_events(job_id,event) values('"+job.id+"','forged')"),/permission denied/);
   await assert.rejects(rpc('claim',{}),/permission denied/);
  });
  await t.test('customers and intake triggers unchanged',async()=>{
   await db.exec('reset role');assert.deepEqual((await db.query('select * from applications order by id')).rows,before);
   assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='applications'::regclass and not tgisinternal")).rows[0].n,0);
  });
 }finally{await db.close();}
});
const req=(body,token='user-token',extra={})=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,...extra},body:typeof body==='string'?body:JSON.stringify(body)});
const response=data=>new Response(JSON.stringify(data),{status:200});
test('HTTP boundary rejects unauthorized users, workers submitting, credentials, oversized payloads and hostile origins',async()=>{
 let calls=[];const handler=createHandler({url:'https://db.invalid',serviceKey:'private-service',fetchFn:async(url,options)=>{
  calls.push(url);assert.ok(url.startsWith('https://db.invalid/'));
  if(url.endsWith('/auth/v1/user'))return response({id:options.headers.Authorization==='Bearer outsider'?other:admin});
  if(url.includes('admin_users')){assert.notEqual(options.headers.Authorization,'Bearer private-service');return response(url.includes(other)?[]:[{user_id:admin}]);}
  if(url.includes('rpc/'))return response(null);throw Error('unexpected_path');
 }});
 assert.equal((await handler(new Request('https://example.invalid',{method:'POST',body:'{}'}))).status,401);
 assert.equal((await handler(req({action:'snapshot'},'outsider'))).status,403);
 assert.equal((await handler(req({action:'submit'},'private-service'))).status,403);
 assert.equal((await handler(req({action:'submit',key:newKey(),agent:'internal',instruction:'sk-ant-secret'}))).status,400);
 assert.equal((await handler(req('x'.repeat(10001)))).status,413);
 assert.equal((await handler(req('{}','user-token',{Origin:'https://evil.invalid'}))).status,403);
 assert.equal((await handler(req('null'))).status,400);
 const data=await (await handler(req({action:'tick'},'private-service'))).json();assert.deepEqual(data,{processed:0,paid_calls:0});
 assert.ok(calls.every(url=>!url.includes('openai.com')&&!url.includes('anthropic.com')));
});
test('verification cannot treat missing upstream results as success',()=>{
 assert.equal(executeFree({agent:'internal',kind:'validation',instruction:'test',previous:[]}).status,'failed');
});
