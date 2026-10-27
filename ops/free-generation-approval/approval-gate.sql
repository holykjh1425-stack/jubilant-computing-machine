-- CANDIDATE ONLY. Apply after link-guard.sql in one reviewed transaction.
-- No existing customer/plan/job row is updated, deleted or backfilled.
do $$begin
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='solq_one_free_job_per_application')
 or not exists(select 1 from pg_indexes where schemaname='public' and indexname='solq_one_free_job_per_plan')
 or not exists(select 1 from pg_trigger where tgrelid='public.orchestrator_jobs'::regclass and tgname='solq_customer_link_guard' and tgenabled='O') then
  raise exception 'link-guard prerequisites missing';
 end if;
end$$;
create table nexus_ai_private.free_generation_approvals (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.applications(id),
 request_hash text not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 unique(application_id,request_hash)
);
alter table nexus_ai_private.free_generation_approvals enable row level security;
revoke all on nexus_ai_private.free_generation_approvals from public,anon,authenticated,service_role;

create function nexus_ai_private.generation_request_hash(p_application uuid) returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_object('service_type',a.service_type,'description',a.description)::text)
 from public.applications a where a.id=p_application;
$$;
revoke all on function nexus_ai_private.generation_request_hash(uuid) from public,anon,authenticated,service_role;

-- Retain the cron entry and other worker functions; automatic free generation is retired.
create or replace function nexus_production_private.free_cycle() returns integer
language plpgsql security definer set search_path='' as $$
begin return 0; end $$;

create function nexus_ai_private.guard_approved_generation() returns trigger
language plpgsql security definer set search_path='' as $$
declare aid uuid; approval nexus_ai_private.free_generation_approvals; expected jsonb;
begin
 aid:=new.application_id;
 if aid is null then return new; end if; -- link-guard separately rejects customer-key orphans.
 select q.* into approval from nexus_ai_private.free_generation_approvals q
 where q.application_id=aid and q.request_hash=nexus_ai_private.generation_request_hash(aid)
 and exists(select 1 from public.admin_users au where au.user_id=q.approved_by);
 if not found then raise exception 'free_generation_approval_required' using errcode='42501';end if;
 if exists(select 1 from public.applications a where a.id=aid and a.status='cancelled') then
  raise exception 'cancelled_application' using errcode='42501';end if;
 if tg_table_name='ai_work_plans' then
  expected:=nexus_production_private.free_plan(aid)||jsonb_build_object(
   'generation_approval_id',approval.id,'generation_request_hash',approval.request_hash);
  if new.plan is distinct from expected then raise exception 'invalid_approved_plan' using errcode='42501';end if;
 else
  if new.agent<>'internal' or new.status<>'awaiting_approval' or new.idempotency_key<>aid
   or not exists(select 1 from public.ai_work_plans p where p.id=new.free_plan_id and p.application_id=aid)
  then raise exception 'invalid_approved_job' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function nexus_ai_private.guard_approved_generation() from public,anon,authenticated,service_role;
create trigger solq_plan_requires_generation_approval before insert on public.ai_work_plans
 for each row execute function nexus_ai_private.guard_approved_generation();
create trigger solq_job_requires_generation_approval before insert on public.orchestrator_jobs
 for each row execute function nexus_ai_private.guard_approved_generation();

create function public.solq_free_generation(p_action text,p_application uuid,p_expected_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; a public.applications; h text; approval nexus_ai_private.free_generation_approvals;
 p public.ai_work_plans; j public.orchestrator_jobs; related integer; stage jsonb; doc jsonb;
begin
 actor:=auth.uid();
 if actor is null or not exists(select 1 from public.admin_users where user_id=actor) then
  raise exception 'admin_required' using errcode='42501';end if;
 if p_action not in ('inspect','approve','generate') or p_action is null then
  raise exception 'unsupported_action' using errcode='22023';end if;
 if p_action='inspect' then
  select * into a from public.applications where id=p_application;
 else
  -- All generation paths serialize on the application, before plan/job locks.
  select * into a from public.applications where id=p_application for update;
 end if;
 if not found then raise exception 'application_not_found' using errcode='22023';end if;
 h:=nexus_ai_private.generation_request_hash(a.id);
 select * into p from public.ai_work_plans where application_id=a.id;
 select count(*) into related from public.orchestrator_jobs x where x.application_id=a.id
  or x.free_plan_id=p.id or x.idempotency_key in (a.id,p.id);
 select * into j from public.orchestrator_jobs x where x.application_id=a.id and x.free_plan_id=p.id;
 select q.* into approval from nexus_ai_private.free_generation_approvals q
 where q.application_id=a.id and q.request_hash=h
 and exists(select 1 from public.admin_users au where au.user_id=q.approved_by);
 if p_action='inspect' then
  return jsonb_build_object('application_id',a.id,'request_hash',h,'approved',approval.id is not null,
   'plan_id',p.id,'job_id',j.id,'related_job_count',related,
   'review_required',related>1 or (related=1 and j.id is null),'cancelled',a.status='cancelled');
 end if;
 if p_expected_hash is distinct from h then raise exception 'request_changed_refresh_required' using errcode='40001';end if;
 -- Never repair or overwrite legacy jobs, including the known two-job case.
 if related>1 or (related=1 and j.id is null) then
  raise exception 'existing_jobs_require_review' using errcode='23514';end if;
 if p.id is not null and j.id is not null then
  return jsonb_build_object('application_id',a.id,'plan_id',p.id,'job_id',j.id,
   'reused',true,'paid_calls',0,'execution_started',false,'status',j.status);
 end if;
 if a.status='cancelled' then raise exception 'cancelled_application' using errcode='42501';end if;
 if p_action='approve' then
  insert into nexus_ai_private.free_generation_approvals(application_id,request_hash,approved_by)
  values(a.id,h,actor) on conflict(application_id,request_hash) do nothing;
  select q.* into approval from nexus_ai_private.free_generation_approvals q
   where q.application_id=a.id and q.request_hash=h;
  -- An approval whose author is no longer an admin is not silently reauthorized.
  if not exists(select 1 from public.admin_users where user_id=approval.approved_by) then
   raise exception 'approval_author_revoked' using errcode='42501';end if;
  return jsonb_build_object('application_id',a.id,'approval_id',approval.id,'request_hash',h,
   'approved',true,'generated',false,'paid_calls',0,'execution_started',false);
 end if;
 if approval.id is null then raise exception 'free_generation_approval_required' using errcode='42501';end if;
 if p.id is null then
  doc:=nexus_production_private.free_plan(a.id)||jsonb_build_object(
   'generation_approval_id',approval.id,'generation_request_hash',h);
  if doc->>'paid_calls' is distinct from '0' or doc->>'execution_started' is distinct from 'false'
   or doc->>'external_execution' is distinct from 'requires_separate_approval'
   or jsonb_array_length(doc->'steps')<>6 then raise exception 'invalid_free_plan';end if;
  insert into public.ai_work_plans(application_id,created_by,plan) values(a.id,actor,doc) returning * into p;
 elsif p.plan->>'requirements' is distinct from a.description then
  raise exception 'existing_plan_requires_review' using errcode='23514';
 end if;
 -- Apply the same safety/shape checks to a historical plan with no linked job.
 if p.plan->>'paid_calls' is distinct from '0'
  or p.plan->>'execution_started' is distinct from 'false'
  or p.plan->>'external_execution' is distinct from 'requires_separate_approval'
  or jsonb_typeof(p.plan->'steps') is distinct from 'array'
  or jsonb_typeof(p.plan->'details') is distinct from 'array'
  or jsonb_array_length(p.plan->'steps') is distinct from 6
  or jsonb_array_length(p.plan->'details') is distinct from 6
  or (select array_agg((v->>'ordinal')::integer order by (v->>'ordinal')::integer)
      from jsonb_array_elements(p.plan->'details') v) is distinct from array[1,2,3,4,5,6]
 then raise exception 'existing_plan_requires_review' using errcode='23514';end if;
 insert into public.orchestrator_jobs(created_by,idempotency_key,instruction,agent,status,application_id,free_plan_id)
 values(actor,a.id,'관리자 승인 무료 계획 검토: '||a.receipt_number,'internal','awaiting_approval',a.id,p.id)
 returning * into j;
 for stage in select value from jsonb_array_elements(p.plan->'details') loop
  insert into public.orchestrator_tasks(job_id,ordinal,kind,agent,status,attempts,result,verified)
  values(j.id,(stage->>'ordinal')::integer,(p.plan->'steps')->>((stage->>'ordinal')::integer-1),
   'internal',case when (stage->>'ordinal')::integer=6 then 'awaiting_approval' else 'completed' end,1,
   jsonb_build_object('application_id',a.id,'plan_id',p.id,'stage',stage,'paid_calls',0,'execution_started',false),
   (stage->>'ordinal')::integer<6);
 end loop;
 insert into public.orchestrator_events(job_id,event,code)
 values(j.id,'free_plan_generated_after_admin_approval','rules_only'),(j.id,'awaiting_approval','no_paid_execution');
 return jsonb_build_object('application_id',a.id,'plan_id',p.id,'job_id',j.id,'reused',false,
  'status','awaiting_approval','paid_calls',0,'execution_started',false);
end $$;
revoke all on function public.solq_free_generation(text,uuid,text) from public,anon,service_role;
grant execute on function public.solq_free_generation(text,uuid,text) to authenticated;
