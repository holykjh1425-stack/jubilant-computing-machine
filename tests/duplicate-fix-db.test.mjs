import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111';
// Embedded PostgreSQL queues SQL on one connection; not a native multi-session test.
test('100 overlapping worker requests, atomic unique registration, legacy preservation and customer separation',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to public;
 create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 create table public.admin_users(user_id uuid primary key);insert into public.admin_users values('${admin}');grant select on public.admin_users to authenticated;
 create table public.applications(id uuid primary key default gen_random_uuid(),receipt_number text unique default 'NX-TEST-'||gen_random_uuid()::text,created_at timestamptz default now(),customer_name text,contact text,service_type text,description text,privacy_consent boolean,status text,internal_note text);
 create table public.ai_work_plans(id uuid primary key default gen_random_uuid(),application_id uuid not null,created_by uuid not null,plan jsonb not null,created_at timestamptz default now());
 create table public.orchestrator_jobs(id uuid primary key default gen_random_uuid(),created_by uuid not null,idempotency_key uuid unique,instruction text,agent text,status text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.orchestrator_tasks(id uuid primary key default gen_random_uuid(),job_id uuid,ordinal integer,kind text,agent text,status text,attempts integer,result jsonb,verified boolean);
 create table public.orchestrator_events(id bigint generated always as identity,job_id uuid,event text,code text,created_at timestamptz default now());
 create schema nexus_orchestrator_private;create table nexus_orchestrator_private.worker_state(singleton boolean,test_requested boolean);
 create schema cron;create table cron.job(jobid integer,schedule text,command text,active boolean);create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261021213341_production_core.sql',import.meta.url),'utf8'));
 await db.exec(`create table nexus_production_private.security_backups(backup_key text primary key,payload jsonb);
 alter table public.production_jobs add column production_approved_by uuid,add column production_approved_at timestamptz;`);
 const baseline=await readFile(new URL('../ops/free-plan-automation/baseline-functions.sql',import.meta.url),'utf8');
 // Only production function bodies used by this isolated harness.
 const matches=baseline.match(/CREATE OR REPLACE FUNCTION nexus_production_private\.[\s\S]*?\$function\$\s*;/g);
 for(const fn of matches)await db.exec(fn);
 await db.exec(`create trigger approval_guard before insert or update on public.production_jobs for each row execute function nexus_production_private.guard_job();
 create trigger application_guard before update of status on public.applications for each row execute function nexus_production_private.guard_application();`);
 await db.exec(await readFile(new URL('../ops/free-plan-automation/automation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../ops/free-plan-automation/production-gates.sql',import.meta.url),'utf8'));
 const guard=await readFile(new URL('../ops/admin-integration-candidate/link-guard.sql',import.meta.url),'utf8');
 const createApp=async(description='SYNTHETIC customer request with classification')=>(await db.query("insert into applications(service_type,description,status) values('ai_automation',$1,'received') returning id",[description])).rows[0].id;
 const legacyApp=await createApp();
 const legacyPlan=(await db.query("insert into ai_work_plans(application_id,plan) values($1,'{}') returning id",[legacyApp])).rows[0].id;
 // Four unlinked rows plus one linked row form the synthetic historical duplicate pair.
 await db.query("insert into orchestrator_jobs(idempotency_key,status) values($1,'awaiting_approval'),(gen_random_uuid(),'awaiting_approval'),(gen_random_uuid(),'awaiting_approval'),(gen_random_uuid(),'awaiting_approval')",[legacyPlan]);
 await db.query("insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,status) values($1,$1,$2,'awaiting_approval')",[legacyApp,legacyPlan]);
 const before=(await db.query('select jsonb_agg(to_jsonb(j) order by id) rows from orchestrator_jobs j')).rows[0].rows;
 await db.exec(guard);await db.exec(guard); // repeatable installation
 const app=await createApp();
 await Promise.all(Array.from({length:100},()=>db.query('select nexus_production_private.free_cycle()')));
 assert.equal((await db.query('select count(*)::int n from orchestrator_jobs where application_id=$1',[app])).rows[0].n,1);
 const plan=(await db.query('select * from ai_work_plans where application_id=$1',[app])).rows[0];
 assert.equal(plan.plan.details.length,6);
 const tasks=(await db.query('select t.* from orchestrator_tasks t join orchestrator_jobs j on j.id=t.job_id where j.application_id=$1 order by ordinal',[app])).rows;
 assert.equal(tasks.length,6);assert.equal(tasks[5].status,'awaiting_approval');
 const second=await createApp('SYNTHETIC second customer website request');
 const secondPlan=(await db.query("insert into ai_work_plans(application_id,plan) values($1,'{}') returning id",[second])).rows[0].id;
 const responses=await Promise.all(Array.from({length:100},()=>db.query("insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,status) values($1,$1,$2,'awaiting_approval') on conflict(application_id) where free_plan_id is not null do nothing returning id",[second,secondPlan])));
 assert.equal(responses.reduce((n,r)=>n+r.rows.length,0),1);
 for(const key of [plan.id,app])await assert.rejects(db.query("insert into orchestrator_jobs(idempotency_key,status) values($1,'queued')",[key]),/server worker/);
 await assert.rejects(db.query("insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,status) values(gen_random_uuid(),$1,$2,'awaiting_approval')",[second,plan.id]),/link mismatch/);
 await assert.rejects(db.query("update orchestrator_jobs set application_id=$1 where application_id=$2",[second,app]),/reassignment/);
 await assert.rejects(db.query("update orchestrator_jobs set status='running' where idempotency_key=$1",[legacyPlan]),/unlinked execution/);
 const after=(await db.query('select jsonb_agg(to_jsonb(j) order by id) rows from orchestrator_jobs j where application_id=$1 or application_id is null',[legacyApp])).rows[0].rows;
 assert.deepEqual(after,before);
 assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,0);
 console.log('100 worker requests: one plan/job, six tasks; 100 atomic registrations: one insert; legacy 5 rows unchanged; production attempts 0');
 }finally{await db.close();}
});
