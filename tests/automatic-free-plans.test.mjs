import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111';
test('automatic plans isolate customers, retry atomically, and cannot authorize production',async()=>{
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
 const insert=async(type,text)=>(await db.query("insert into applications(service_type,description,status) values($1,$2,'received') returning id",[type,text])).rows[0].id;
 const a=await insert('ai_automation','A고객만의 식당 주문 문의를 메뉴별로 분류하고 이메일 알림 연동을 검토해 주세요.');
 const b=await insert('website','B고객만의 미용실 소개와 모바일 예약 입력 양식 및 로그인 페이지가 필요합니다.');
 const before=(await db.query('select * from applications order by id')).rows;
 assert.equal((await db.query('select nexus_production_private.tick() n')).rows[0].n,2);
 const plans=(await db.query('select * from ai_work_plans order by application_id')).rows;
 assert.equal(plans.length,2);
 for(const row of plans){
  const original=before.find(x=>x.id===row.application_id);assert.equal(row.created_by,null);
  assert.equal(row.plan.requirements,original.description);assert.equal(row.plan.details.length,6);
  assert.equal(row.plan.application_id,row.application_id);assert.equal(row.plan.model_used,false);assert.equal(row.plan.paid_calls,0);
 }
 assert.notDeepEqual(plans[0].plan.details,plans[1].plan.details);
 assert.equal((await db.query("select count(*)::int n from orchestrator_jobs where status='awaiting_approval' and created_by is null")).rows[0].n,2);
 await db.query('select nexus_production_private.tick()');await db.query('select nexus_production_private.free_cycle()');
 assert.equal((await db.query('select count(*)::int n from ai_work_plans')).rows[0].n,2);
 await assert.rejects(db.query('insert into ai_work_plans(application_id,plan) values($1,$2)',[a,'{}']),/unique/);
 // Existing manual plan is retained and never re-enrolled.
 const legacy=await insert('consulting','기타문의');await db.query('insert into ai_work_plans(application_id,created_by,plan) values($1,$2,$3)',[legacy,admin,'{"legacy":true}']);
 await db.query('select nexus_production_private.tick()');
 assert.equal((await db.query('select status from solq_free_plan_runs where application_id=$1',[legacy])).rows[0].status,'existing_plan');
 // Fail storage after planning. Whole per-customer unit rolls back and records a retry.
 await db.exec(`create function public.solq_test_failure() returns trigger language plpgsql as $$begin if (select description from applications where id=new.application_id) like 'RETRY%' then raise exception 'synthetic storage failure';end if;return new;end$$;
 create trigger solq_test_failure before insert on ai_work_plans for each row execute function public.solq_test_failure();`);
 const retry=await insert('consulting','RETRY 고객의 분석 실패 복구를 검증하는 가상 신청입니다.');
 for(let i=0;i<3;i++){await db.query('update solq_free_plan_runs set next_attempt_at=now() where application_id=$1',[retry]);await db.query('select nexus_production_private.free_cycle()');}
 const failed=(await db.query('select * from solq_free_plan_runs where application_id=$1',[retry])).rows[0];
 assert.equal(failed.status,'failed');assert.equal(failed.attempts,3);assert.equal(failed.error_history.length,3);
 assert.equal((await db.query('select count(*)::int n from ai_work_plans where application_id=$1',[retry])).rows[0].n,0);
 await db.query('select nexus_production_private.free_cycle()');assert.equal((await db.query('select attempts from solq_free_plan_runs where application_id=$1',[retry])).rows[0].attempts,3);
 // A transient failure recovers, retains failure history and cannot duplicate a job.
 const recover=await insert('consulting','RETRY 일시적 오류에서 복구할 별도 가상 고객 신청입니다.');await db.query('select nexus_production_private.free_cycle()');
 await db.exec('drop trigger solq_test_failure on ai_work_plans;drop function public.solq_test_failure();');
 await db.query('update solq_free_plan_runs set next_attempt_at=now() where application_id=$1',[recover]);await db.query('select nexus_production_private.free_cycle()');
 const recovered=(await db.query('select * from solq_free_plan_runs where application_id=$1',[recover])).rows[0];assert.equal(recovered.status,'awaiting_approval');assert.equal(recovered.attempts,2);assert.equal(recovered.error_history.length,1);
 // No paid claim or direct state transition without consent, payment and approval.
 await assert.rejects(db.query("update production_jobs set status='queued' where application_id=$1",[a]),/required/);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:admin})]);
 await db.query("update applications set status='deposit_confirmed' where id=$1",[b]);
 await assert.rejects(db.query('select nexus_production_private.approve($1)',[b]),/quotation acceptance required/);
 assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,0);
 await db.exec('set role anon');await assert.rejects(db.query('select * from solq_free_plan_runs'),/permission denied/);await assert.rejects(db.query('select nexus_production_private.free_cycle()'),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(db.query('insert into solq_quote_acceptances default values'),/permission denied/);
 assert.ok((await db.query('select * from solq_free_plan_runs')).rows.length>0);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:'22222222-2222-4222-8222-222222222222'})]);
 assert.equal((await db.query('select * from solq_free_plan_runs')).rows.length,0);await db.exec('reset role');
 // Only a synthetic local consent record is used for the positive gate test.
 const quote=(await db.query("insert into solq_quote_acceptances(application_id,quote_reference,quote_version,amount_krw,accepted_at,evidence_reference,verified_by) values($1,'LOCAL-TEST','v1',100000,now(),'LOCAL-TEST-EVIDENCE',$2) returning id",[b,admin])).rows[0].id;
 await assert.rejects(db.query("update production_jobs set quote_acceptance_id=$1,status='queued' where application_id=$2",[quote,a]),/required/);
 await db.query('update production_jobs set quote_acceptance_id=$1 where application_id=$2',[quote,b]);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:admin})]);
 assert.equal((await db.query('select nexus_production_private.approve($1) value',[b])).rows[0].value.status,'queued');
 assert.deepEqual((await db.query('select * from applications where id=$1',[a])).rows[0],before.find(x=>x.id===a));
 await db.exec(await readFile(new URL('../ops/free-plan-automation/quote-evidence.sql',import.meta.url),'utf8'));
 const evidence={application_id:a,quote_reference:'SYNTHETIC-LOCAL',quote_version:'v1',amount_krw:100000,accepted:true,accepted_at:new Date(Date.now()-60000).toISOString(),evidence_reference:'LOCAL-ONLY-SYNTHETIC-ARCHIVE',evidence_verified:true};
 const record=x=>db.query('select public.solq_record_quote_evidence($1::jsonb) q',[JSON.stringify(x)]);
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:'22222222-2222-4222-8222-222222222222'})]);
 await assert.rejects(record(evidence),/admin required/);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:admin})]);
 await assert.rejects(record({...evidence,verified_by:admin}),/verified evidence/);
 await assert.rejects(record({...evidence,evidence_verified:false}),/verified evidence/);
 await assert.rejects(record({...evidence,accepted_at:'2099-01-01T00:00:00Z'}),/check constraint/);
 const recorded=(await record(evidence)).rows[0].q;
 assert.equal(recorded.verified_by,admin);assert.equal(recorded.accepted,true);
 await assert.rejects(record(evidence),/already locked/);
 await assert.rejects(db.query('update solq_quote_acceptances set amount_krw=1'),/permission denied/);
 await db.exec('reset role');
 await assert.rejects(db.query('update solq_quote_acceptances set amount_krw=1 where id=$1',[recorded.id]),/append-only/);
 await assert.rejects(db.query('delete from solq_quote_acceptances where id=$1',[recorded.id]),/append-only/);
 assert.equal((await db.query('select status from production_jobs where application_id=$1',[a])).rows[0].status,'awaiting_deposit');
 await assert.rejects(db.query('select nexus_production_private.approve($1)',[a]),/payment confirmation/);
 assert.equal((await db.query('select count(*)::int n from production_attempts')).rows[0].n,0);

 }finally{await db.close();}
});
