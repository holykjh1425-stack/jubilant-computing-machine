-- Candidate only: apply inside ONE transaction after production approval.
-- Retains every historical row, including unlinked jobs and logical duplicates.
-- Existing per-application unique index is a required worker invariant.
do $$begin
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='solq_one_free_job_per_application') then
  raise exception 'required per-application unique index missing';
 end if;
end$$;
-- Historical unlinked rows have NULL free_plan_id and are intentionally excluded.
-- If linked duplicates exist, index creation fails; never repair them automatically.
create unique index if not exists solq_one_free_job_per_plan
 on public.orchestrator_jobs(free_plan_id) where free_plan_id is not null;

create or replace function nexus_orchestrator_private.guard_customer_link() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.application_id is distinct from old.application_id or new.free_plan_id is distinct from old.free_plan_id or new.idempotency_key is distinct from old.idempotency_key) then
  raise exception 'customer link mismatch: reassignment forbidden';
 end if;
 if new.application_id is null or new.free_plan_id is null then
  if new.application_id is not null or new.free_plan_id is not null then raise exception 'customer link mismatch';end if;
  if exists(select 1 from public.ai_work_plans where id=new.idempotency_key)
    or exists(select 1 from public.applications where id=new.idempotency_key) then
   if tg_op='INSERT' then raise exception 'customer plans are assigned by the server worker only';end if;
   if new.status in ('queued','running','completed') then raise exception 'unlinked execution blocked';end if;
  end if;
 else
  if not exists(select 1 from public.ai_work_plans where id=new.free_plan_id and application_id=new.application_id)
    or new.idempotency_key is distinct from new.application_id then raise exception 'customer link mismatch';end if;
  -- Refuse to add a linked job when a historical unlinked registration already exists.
  -- No heuristic reassignment and no additional third job for the known duplicate pair.
  if tg_op='INSERT' and exists(select 1 from public.orchestrator_jobs j
    where j.application_id is null and j.free_plan_id is null
      and j.idempotency_key in (new.application_id,new.free_plan_id)) then
   raise exception 'legacy customer registration requires review';
  end if;
 end if;
 return new;
end$$;
revoke all on function nexus_orchestrator_private.guard_customer_link() from public,anon,authenticated,service_role;
do $$begin
 if not exists(select 1 from pg_trigger where tgrelid='public.orchestrator_jobs'::regclass and tgname='solq_customer_link_guard') then
  create trigger solq_customer_link_guard before insert or update on public.orchestrator_jobs
   for each row execute function nexus_orchestrator_private.guard_customer_link();
 end if;
end$$;
