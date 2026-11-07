import {createRequire} from 'node:module';
const require=createRequire(process.env.SOLQ_TEST_DEPS ? process.env.SOLQ_TEST_DEPS+'/package.json' : import.meta.url);
const {PGlite}=require('@electric-sql/pglite');
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();const results=[];
const file=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const scalar=async q=>(await db.query(q)).rows[0];
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const admin='aaaaaaaa-0000-4000-8000-000000000001',other='aaaaaaaa-0000-4000-8000-000000000002';
const who=async x=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[x]);
const rpc=async(action,n,h=null)=>(await db.query('select public.solq_free_generation($1,$2,$3) as v',[action,id(n),h])).rows[0].v;
async function test(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);}
async function denied(fn,pattern){await assert.rejects(fn,pattern);}
try{
 await db.exec(file('fixture.sql'));await db.exec(file('baseline-free-plan.sql'));
 const original=await scalar("select md5(jsonb_agg(to_jsonb(j) order by id)::text) h from public.orchestrator_jobs j");
 await db.exec(file('../../ops/admin-integration-candidate/link-guard.sql'));
 await db.exec(file('../../ops/free-generation-approval/approval-gate.sql'));
 await test('migration preserves all 9/6/7 synthetic historic rows including duplicate',async()=>{
  assert.equal((await scalar('select count(*)::int n from public.applications')).n,9);
  assert.equal((await scalar('select count(*)::int n from public.ai_work_plans')).n,6);
  assert.equal((await scalar('select count(*)::int n from public.orchestrator_jobs')).n,7);
  assert.equal((await scalar('select md5(jsonb_agg(to_jsonb(j) order by id)::text) h from public.orchestrator_jobs j')).h,original.h);
 });
 await test('legacy scheduled free_cycle is a no-op',async()=>{assert.equal((await scalar('select nexus_production_private.free_cycle() n')).n,0);assert.equal((await scalar('select count(*)::int n from public.ai_work_plans')).n,6);});
 await test('unauthenticated and non-admin approve/generate are rejected',async()=>{
  for(const actor of ['',other]){await who(actor);await denied(()=>rpc('inspect',7),/admin_required/);await denied(()=>rpc('approve',7,'a'.repeat(32)),/admin_required/);await denied(()=>rpc('generate',7,'a'.repeat(32)),/admin_required/);}
 });
 await who(admin);
 const view=await rpc('inspect',7);
 await test('inspect is read-only and generation without approval fails',async()=>{assert.equal(view.approved,false);await denied(()=>rpc('generate',7,view.request_hash),/approval_required/);assert.equal((await scalar('select count(*)::int n from public.ai_work_plans')).n,6);});
 await test('approval does not itself generate any plan/job; repeat approval is idempotent',async()=>{
  const a=await rpc('approve',7,view.request_hash),b=await rpc('approve',7,view.request_hash);assert.equal(a.approval_id,b.approval_id);
  assert.equal((await scalar('select count(*)::int n from public.ai_work_plans')).n,6);
  assert.equal((await scalar('select count(*)::int n from public.orchestrator_jobs')).n,7);
 });
 let generated;
 await test('approved generation stores one plan/job and 6 stages with approval waiting',async()=>{
  generated=await rpc('generate',7,view.request_hash);assert.equal(generated.reused,false);assert.equal(generated.status,'awaiting_approval');
  assert.equal(generated.paid_calls,0);assert.equal(generated.execution_started,false);
  const stages=(await db.query('select ordinal,status,verified,result from public.orchestrator_tasks where job_id=$1 order by ordinal',[generated.job_id])).rows;
  assert.equal(stages.length,6);assert.ok(stages.slice(0,5).every(x=>x.status==='completed'&&x.verified));
  assert.equal(stages[5].status,'awaiting_approval');assert.equal(stages[5].verified,false);
  assert.ok(stages.every(x=>x.result.paid_calls===0&&x.result.execution_started===false));
 });
 await test('20 simultaneous calls on PGlite reuse one pair (single-engine scheduling)',async()=>{
  const rs=await Promise.all(Array.from({length:20},()=>rpc('generate',7,view.request_hash)));
  assert.ok(rs.every(x=>x.reused&&x.job_id===generated.job_id));
  assert.equal((await db.query('select count(*)::int n from public.orchestrator_jobs where application_id=$1',[id(7)])).rows[0].n,1);
 });
 await test('historical valid pair is reused without retroactive approval or writes',async()=>{
  const v=await rpc('inspect',2);assert.equal(v.approved,false);const r=await rpc('generate',2,v.request_hash);assert.equal(r.reused,true);
  assert.equal((await db.query('select count(*)::int n from nexus_ai_private.free_generation_approvals where application_id=$1',[id(2)])).rows[0].n,0);
 });
 await test('known legacy duplicate is reported and never repaired/generated',async()=>{
  const v=await rpc('inspect',1);assert.equal(v.related_job_count,2);assert.equal(v.review_required,true);
  await denied(()=>rpc('approve',1,v.request_hash),/existing_jobs_require_review/);await denied(()=>rpc('generate',1,v.request_hash),/existing_jobs_require_review/);
 });
 await test('approval is bound to current request and membership, not caller assertions',async()=>{
  const v=await rpc('inspect',8);await rpc('approve',8,v.request_hash);
  await db.query('update public.applications set description=$1 where id=$2',['변경된 합성 요구사항',id(8)]);
  await denied(()=>rpc('generate',8,v.request_hash),/request_changed/);
  const fresh=await rpc('inspect',8);assert.equal(fresh.approved,false);await denied(()=>rpc('generate',8,fresh.request_hash),/approval_required/);
  await who(other);await denied(()=>rpc('generate',8,fresh.request_hash),/admin_required/);await who(admin);
 });
 await test('cancelled application cannot be approved',async()=>{const v=await rpc('inspect',9);await denied(()=>rpc('approve',9,v.request_hash),/cancelled_application/);});
 await test('direct unapproved inserts and legacy customer-key registration are blocked',async()=>{
  await denied(()=>db.query('insert into public.ai_work_plans(application_id,plan) values($1,$2)',[id(8),{}]),/approval_required/);
  await denied(()=>db.query("insert into public.orchestrator_jobs(idempotency_key,instruction,agent,status) values($1,'qa','internal','queued')",[generated.plan_id]),/server worker only/);
 });
 await test('approval table is private; anonymous RPC has no execute grant',async()=>{
  assert.equal((await scalar("select has_function_privilege('anon','public.solq_free_generation(text,uuid,text)','execute') ok")).ok,false);
  assert.equal((await scalar("select has_table_privilege('authenticated','nexus_ai_private.free_generation_approvals','select') ok")).ok,false);
 });
 await test('unauthorized generation cannot change already generated work',async()=>{await who(other);await denied(()=>rpc('generate',7,view.request_hash),/admin_required/);await who(admin);assert.equal((await rpc('generate',7,view.request_hash)).job_id,generated.job_id);});
 await test('failed stage insert rolls back generated plan/job/tasks atomically',async()=>{
  const v=await rpc('inspect',8);await rpc('approve',8,v.request_hash);
  await db.exec("create function public.qa_failure() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_STAGE_FAILURE';end$$;create trigger qa_failure before insert on public.orchestrator_tasks for each row execute function public.qa_failure();");
  await denied(()=>rpc('generate',8,v.request_hash),/SYNTHETIC_STAGE_FAILURE/);
  assert.equal((await db.query('select count(*)::int n from public.ai_work_plans where application_id=$1',[id(8)])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.orchestrator_jobs where application_id=$1',[id(8)])).rows[0].n,0);
  await db.exec('drop trigger qa_failure on public.orchestrator_tasks;drop function public.qa_failure()');
  assert.equal((await rpc('generate',8,v.request_hash)).reused,false);
 });
 await test('authenticated role can inspect but removed approval author cannot generate',async()=>{
  await db.exec('set role authenticated');assert.equal((await rpc('inspect',7)).application_id,id(7));await db.exec('reset role');
  await db.query('delete from public.admin_users where user_id=$1',[admin]);
  await denied(()=>rpc('generate',7,view.request_hash),/admin_required/);
  await db.query('insert into public.admin_users(user_id) values($1)',[admin]);
 });
 writeFileSync(new URL('results.json',import.meta.url),JSON.stringify({engine:'PGlite 0.5.11',actual_sql:true,real_auth_server:false,native_independent_connections:false,tests:results},null,2));
}finally{await db.close();}
