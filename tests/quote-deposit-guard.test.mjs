import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111';
test('latest quotes, deposit proof and manual approval fail closed in isolated PostgreSQL',async()=>{const db=new PGlite();try{
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

await db.exec(await readFile(new URL('../ops/free-plan-automation/quote-evidence.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../ops/admin-integration-candidate/quote-deposit-guard.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../ops/admin-integration-candidate/link-guard.sql',import.meta.url),'utf8'));
// Preserve four synthetic legacy jobs and deny every transition to an executable state.
for(let i=0;i<4;i++)await db.query("insert into orchestrator_jobs(idempotency_key,instruction,agent,status) values(gen_random_uuid(),'SYNTHETIC LEGACY','internal','awaiting_approval')");
for(const status of ['queued','running','completed'])await assert.rejects(db.query('update orchestrator_jobs set status=$1 where application_id is null',[status]),/unlinked/);
assert.equal((await db.query('select count(*)::int n from orchestrator_jobs where application_id is null')).rows[0].n,4);
const app=async()=>(await db.query("insert into applications(service_type,description,status) values('ai_automation','SYNTHETIC ONLY','received') returning id")).rows[0].id;
const a=await app(),b=await app();for(const id of [a,b])await db.query('select nexus_production_private.enroll($1)',[id]);
const identity=async(id=admin,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:id})]);await db.exec('set role '+role);};
const ledger=async(action,data)=>(await db.query('select public.solq_quote_ledger($1,$2::jsonb) r',[action,JSON.stringify(data)])).rows[0].r;
const issue=app=>ledger('issue_quote',{application_id:app,quote_reference:'SYNTHETIC',amount_krw:100000,expires_at:new Date(Date.now()+3600000).toISOString()});
const accept=q=>db.query('select public.solq_record_quote_evidence($1::jsonb) r',[JSON.stringify({application_id:q.application_id,quote_reference:q.quote_reference,quote_version:String(q.version),amount_krw:q.amount_krw,accepted_at:new Date().toISOString(),accepted:true,evidence_verified:true,evidence_reference:'SYNTHETIC-EVIDENCE'})]);
await identity('22222222-2222-4222-8222-222222222222');await assert.rejects(issue(a),/admin required/);
await identity();const q1=await issue(a);const q2=await issue(a);await assert.rejects(accept(q1),/latest valid/);
await assert.rejects(accept({...q2,amount_krw:1}),/latest valid/);
await assert.rejects(accept({...q2,application_id:b}),/latest valid/);
await accept(q2);await assert.rejects(db.query('select nexus_production_private.approve($1)',[a]),/manual payment/);
await db.exec('reset role');await db.query("update applications set status='deposit_confirmed' where id=$1",[a]);await identity();
await assert.rejects(db.query('select nexus_production_private.approve($1)',[a]),/manual deposit/);
const deposit={application_id:a,quote_id:q2.id,amount_krw:30000,paid_at:new Date(Date.now()-1000).toISOString(),transaction_reference:'SYNTHETIC-BANK-001',evidence_reference:'SYNTHETIC-BANK-ARCHIVE'};
await assert.rejects(ledger('record_deposit',{...deposit,amount_krw:29999}),/check constraint/);
await assert.rejects(ledger('record_deposit',{...deposit,application_id:b}),/latest valid/);
await assert.rejects(ledger('record_deposit',{...deposit,paid_at:'2099-01-01'}),/check constraint/);
const d=await ledger('record_deposit',deposit);await assert.rejects(ledger('record_deposit',deposit),/unique constraint/);
await assert.rejects(db.query('select nexus_production_private.approve($1)',[a]),/manual deposit/);
const confirm={application_id:a,quote_id:q2.id,deposit_id:d.id,bank_verified:true};
await assert.rejects(ledger('confirm_deposit',{...confirm,bank_verified:false}),/manual bank/);
await assert.rejects(ledger('confirm_deposit',{...confirm,confirmed_by:admin}),/server identity/);
await ledger('confirm_deposit',confirm);
// Confirmation records alone never queue work.
assert.equal((await db.query('select status from production_jobs where application_id=$1',[a])).rows[0].status,'awaiting_deposit');
assert.equal((await db.query('select nexus_production_private.approve($1) r',[a])).rows[0].r.status,'queued');
await assert.rejects(issue(a),/production locked/);
// New quote expires after consent: final queue/claim trigger must deny running.
await db.exec('reset role');await db.exec('alter table solq_issued_quotes disable trigger immutable_ledger');
await db.query("update solq_issued_quotes set issued_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[q2.id]);
await db.exec('alter table solq_issued_quotes enable trigger immutable_ledger');
await assert.rejects(db.query("update production_jobs set status='running' where application_id=$1",[a]),/latest valid/);
// Old evidence remains append-only; a replacement quote can be accepted before approval.
await identity();const qb=await issue(b);await accept(qb);const qb2=await issue(b);await accept(qb2);
assert.equal((await db.query('select count(*)::int n from solq_quote_acceptances where application_id=$1',[b])).rows[0].n,2);
for(const t of ['solq_issued_quotes','solq_deposit_evidence','solq_deposit_confirmations']){
 await assert.rejects(db.query('insert into '+t+' default values'),/permission denied/);
 await db.exec('reset role');await assert.rejects(db.query('delete from '+t),/append-only/);await identity();
}
await identity('22222222-2222-4222-8222-222222222222');
for(const t of ['solq_issued_quotes','solq_deposit_evidence','solq_deposit_confirmations'])assert.equal((await db.query('select count(*)::int n from '+t)).rows[0].n,0);
await identity(admin,'anon');await assert.rejects(issue(b),/permission denied/);
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,0);
}finally{await db.close();}});
