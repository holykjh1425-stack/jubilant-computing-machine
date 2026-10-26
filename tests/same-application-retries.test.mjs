import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111';
// PGlite queues statements on one connection; this is NOT a multi-session lock test.
test('same application queued retries preserve one plan/job and reject legacy browser registration',async()=>{
 const db=new PGlite();
 try{
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


 await db.exec(await readFile(new URL('../ops/admin-integration-candidate/link-guard.sql',import.meta.url),'utf8'));
 const app=(await db.query("insert into applications(service_type,description,status) values('consulting','SYNTHETIC SAME APPLICATION','received') returning id")).rows[0].id;
 await Promise.all(Array.from({length:16},()=>db.query('select nexus_production_private.free_cycle()')));
 const counts=(await db.query('select (select count(*)::int from ai_work_plans) plans,(select count(*)::int from orchestrator_jobs) jobs,(select count(*)::int from orchestrator_tasks) tasks')).rows[0];
 assert.deepEqual(counts,{plans:1,jobs:1,tasks:6});
 const pair=(await db.query('select p.id,p.application_id,j.idempotency_key,j.free_plan_id,j.status from ai_work_plans p join orchestrator_jobs j on j.free_plan_id=p.id')).rows[0];
 assert.equal(pair.application_id,app);assert.equal(pair.idempotency_key,app);assert.equal(pair.free_plan_id,pair.id);assert.equal(pair.status,'awaiting_approval');
 await assert.rejects(db.query("insert into orchestrator_jobs(idempotency_key,instruction,agent,status) values($1,'SYNTHETIC LEGACY BROWSER','internal','queued')",[pair.id]),/server worker/);
 await assert.rejects(db.query("insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,instruction,agent,status) values(gen_random_uuid(),$1,$2,'SYNTHETIC BAD KEY','internal','awaiting_approval')",[app,pair.id]),/link mismatch/);
 await assert.rejects(db.query("insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,instruction,agent,status) values($1,$1,$2,'SYNTHETIC DUPLICATE','internal','awaiting_approval')",[app,pair.id]),/unique/);
 assert.equal((await db.query('select count(*)::int n from orchestrator_jobs')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,0);
 }finally{await db.close();}
});
