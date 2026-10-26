import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111';
test('100 simultaneous requests preserve links and deduplicate retries',async()=>{
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

 const requests=Array.from({length:100},(_,i)=>db.query("insert into applications(service_type,description,status) values('ai_automation',$1,'received') returning id",['SYNTHETIC CUSTOMER '+i+' 분류 요청']));
 const apps=(await Promise.all(requests)).map(r=>r.rows[0].id);
 await Promise.all(Array.from({length:8},()=>db.query('select nexus_production_private.free_cycle()')));
 const counts=(await db.query(`select (select count(*)::int from ai_work_plans) plans,(select count(*)::int from orchestrator_jobs) jobs,(select count(*)::int from orchestrator_tasks) tasks`)).rows[0];
 assert.deepEqual(counts,{plans:100,jobs:100,tasks:600});
 assert.equal((await db.query(`select count(*)::int n from orchestrator_jobs j join ai_work_plans p on p.id=j.free_plan_id where j.application_id<>p.application_id or j.idempotency_key<>j.application_id`)).rows[0].n,0);
 for(const id of apps){const r=(await db.query('select p.plan,p.application_id,j.free_plan_id,p.id from ai_work_plans p join orchestrator_jobs j on j.free_plan_id=p.id where p.application_id=$1',[id])).rows;assert.equal(r.length,1);assert.equal(r[0].plan.application_id,id);assert.equal(r[0].free_plan_id,r[0].id);}
 await db.exec(await readFile(new URL('../ops/admin-integration-candidate/link-guard.sql',import.meta.url),'utf8'));
 const pair=(await db.query('select application_id,id from ai_work_plans limit 2')).rows;
 await assert.rejects(db.query("insert into orchestrator_jobs(idempotency_key,instruction,agent,status) values($1,'legacy browser','internal','queued')",[pair[0].id]),/server worker/);
 await assert.rejects(db.query('update orchestrator_jobs set application_id=$1 where free_plan_id=$2',[pair[1].application_id,pair[0].id]),/link mismatch/);
 await db.query("insert into orchestrator_jobs(idempotency_key,instruction,agent,status) values(gen_random_uuid(),'unlinked','internal','awaiting_approval')");
 await assert.rejects(db.query("update orchestrator_jobs set status='running' where application_id is null"),/unlinked/);
 // Mirror the inspected live admin-only SELECT boundary in the isolated DB.
 for(const table of ['applications','ai_work_plans','orchestrator_jobs','orchestrator_tasks','solq_quote_acceptances']){
   await db.exec(`alter table public.${table} enable row level security;grant select on public.${table} to authenticated,anon;`);
   if(table!=='solq_quote_acceptances')await db.exec(`create policy isolated_admin_read on public.${table} for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())))`);
 }
 for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role};set request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","role":"${role}"}';`);
 for(const table of ['applications','ai_work_plans','orchestrator_jobs','orchestrator_tasks','solq_quote_acceptances'])assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,0,role+' cannot read '+table);
 await db.exec('reset role');
 }
 assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,0);
 }finally{await db.close();}
});
