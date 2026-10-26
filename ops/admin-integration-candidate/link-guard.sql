-- Candidate only. Apply in one transaction after explicit production approval.
-- No existing rows are repaired, deleted, or reassigned.
create function nexus_orchestrator_private.guard_customer_link() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.application_id is distinct from old.application_id or new.free_plan_id is distinct from old.free_plan_id or new.idempotency_key is distinct from old.idempotency_key) then raise exception 'customer link mismatch: reassignment forbidden';end if;
 if new.application_id is null or new.free_plan_id is null then
  if new.application_id is not null or new.free_plan_id is not null then
   raise exception 'customer link mismatch';
  end if;
  if exists(select 1 from public.ai_work_plans where id=new.idempotency_key) then
   raise exception 'customer plans are assigned by the server worker only';
  end if;
  if new.status in ('queued','running','completed') then raise exception 'unlinked execution blocked';end if;
 else
  if not exists(select 1 from public.ai_work_plans where id=new.free_plan_id and application_id=new.application_id)
   or new.idempotency_key is distinct from new.application_id then raise exception 'customer link mismatch';end if;
 end if;
 return new;
end$$;
revoke all on function nexus_orchestrator_private.guard_customer_link() from public,anon,authenticated,service_role;
create trigger solq_customer_link_guard before insert or update on public.orchestrator_jobs
for each row execute function nexus_orchestrator_private.guard_customer_link();
