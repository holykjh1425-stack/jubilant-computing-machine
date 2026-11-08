-- Synthetic schema only. Never run against a remote database.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema nexus_ai_private;
create schema nexus_production_private; create schema nexus_orchestrator_private;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create table auth.users(id uuid primary key);
insert into auth.users values('aaaaaaaa-0000-4000-8000-000000000001'),('aaaaaaaa-0000-4000-8000-000000000002');
create table public.admin_users(user_id uuid primary key references auth.users);
insert into public.admin_users values('aaaaaaaa-0000-4000-8000-000000000001');
create table public.applications(id uuid primary key,receipt_number text unique not null,
 customer_name text,contact text,service_type text not null,description text not null,
 status text not null default 'received',created_at timestamptz default now());
create table public.ai_work_plans(id uuid primary key default gen_random_uuid(),
 application_id uuid unique not null references public.applications,created_by uuid,
 plan jsonb not null,created_at timestamptz default now());
create table public.orchestrator_jobs(id uuid primary key default gen_random_uuid(),
 created_by uuid,idempotency_key uuid unique not null,instruction text not null,agent text not null,
 status text not null,created_at timestamptz default now(),updated_at timestamptz default now(),
 application_id uuid references public.applications,free_plan_id uuid references public.ai_work_plans);
create unique index solq_one_free_job_per_application on public.orchestrator_jobs(application_id)
 where free_plan_id is not null;
create table public.orchestrator_tasks(id uuid primary key default gen_random_uuid(),job_id uuid references public.orchestrator_jobs,
 ordinal integer,kind text,agent text,status text,attempts integer,result jsonb,verified boolean);
create table public.orchestrator_events(id bigint generated always as identity,job_id uuid,event text,code text,created_at timestamptz default now());
insert into public.applications(id,receipt_number,service_type,description,status)
 select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'QA-'||i,'website',
 '합성 테스트: 문의 양식과 결과 화면을 검토합니다.',case when i=9 then 'cancelled' else 'received' end
 from generate_series(1,9)i;
insert into public.ai_work_plans(id,application_id,plan)
 select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 jsonb_build_object('requirements','합성 테스트: 문의 양식과 결과 화면을 검토합니다.','historic',true)
 from generate_series(1,6)i;
insert into public.orchestrator_jobs(id,application_id,free_plan_id,idempotency_key,instruction,agent,status)
 select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'QA historic','internal','awaiting_approval'
 from generate_series(1,6)i;
insert into public.orchestrator_jobs(id,idempotency_key,instruction,agent,status)
 values('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','QA historic orphan','internal','awaiting_approval');
alter table public.applications enable row level security;
alter table public.admin_users enable row level security;
create policy admin_own on public.admin_users for select to authenticated using(user_id=auth.uid());
create policy admin_reads on public.applications for select to authenticated
 using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
grant usage on schema public,auth to anon,authenticated;
grant select on public.admin_users,public.applications to authenticated;
