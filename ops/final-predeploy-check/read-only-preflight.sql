-- Operator inspection only. No schema/data changes or worker invocation.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '10s';
select jsonb_build_object(
 'applications',(select count(*) from public.applications),
 'plans',(select count(*) from public.ai_work_plans),
 'jobs',(select count(*) from public.orchestrator_jobs),
 'unlinked',(select count(*) from public.orchestrator_jobs where application_id is null or free_plan_id is null),
 'partial_links',(select count(*) from public.orchestrator_jobs where (application_id is null)<>(free_plan_id is null)),
 'duplicate_linked_plans',(select count(*) from (select free_plan_id from public.orchestrator_jobs where free_plan_id is not null group by 1 having count(*)>1) q),
 'duplicate_linked_applications',(select count(*) from (select application_id from public.orchestrator_jobs where free_plan_id is not null group by 1 having count(*)>1) q),
 'duplicate_plans_per_application',(select count(*) from (select application_id from public.ai_work_plans group by 1 having count(*)>1) q),
 'invalid_links',(select count(*) from public.orchestrator_jobs j where j.application_id is not null and j.free_plan_id is not null and (j.idempotency_key is distinct from j.application_id or not exists(select 1 from public.ai_work_plans p where p.id=j.free_plan_id and p.application_id=j.application_id))),
 'production_attempts',(select count(*) from public.production_attempts)
) as counts;
-- Check actual definitions/validity, not just an index name.
select i.relname,ix.indisvalid,ix.indisready,ix.indisunique,pg_get_indexdef(i.oid) definition
from pg_index ix join pg_class i on i.oid=ix.indexrelid
where ix.indrelid in ('public.ai_work_plans'::regclass,'public.orchestrator_jobs'::regclass);
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('applications','admin_users','ai_work_plans','orchestrator_jobs');
select tgname,tgenabled,pg_get_triggerdef(oid) definition from pg_trigger
where tgrelid='public.orchestrator_jobs'::regclass and not tgisinternal;
rollback;
