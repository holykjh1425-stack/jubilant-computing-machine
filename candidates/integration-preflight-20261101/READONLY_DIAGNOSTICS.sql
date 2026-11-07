-- SOLQ candidate-only inspection. SELECT statements only; returns aggregate counts, no IDs/PII.
-- Run with a read-only database role where possible. Do not use as migration.
WITH j AS (
 SELECT j.id,j.application_id,j.free_plan_id,j.idempotency_key,
        p.application_id AS plan_application_id,
        kp.application_id AS legacy_key_plan_application_id
 FROM public.orchestrator_jobs j
 LEFT JOIN public.ai_work_plans p ON p.id=j.free_plan_id
 LEFT JOIN public.ai_work_plans kp ON kp.id=j.idempotency_key
)
SELECT (SELECT count(*) FROM public.applications) AS applications,
       (SELECT count(*) FROM public.ai_work_plans) AS plans,
       (SELECT count(*) FROM public.orchestrator_jobs) AS jobs,
       count(*) FILTER (WHERE application_id IS NULL AND free_plan_id IS NULL) AS both_link_null,
       count(*) FILTER (WHERE application_id IS NULL AND free_plan_id IS NULL AND legacy_key_plan_application_id IS NOT NULL) AS legacy_key_resolves,
       count(*) FILTER (WHERE application_id IS NULL AND free_plan_id IS NULL AND legacy_key_plan_application_id IS NULL) AS unresolved_null_pair,
       count(*) FILTER (WHERE application_id IS NOT NULL AND plan_application_id IS NOT NULL AND application_id <> plan_application_id) AS direct_plan_conflicts
FROM j;

WITH resolved AS (
 SELECT COALESCE(j.application_id,p.application_id,kp.application_id) AS app_id
 FROM public.orchestrator_jobs j
 LEFT JOIN public.ai_work_plans p ON p.id=j.free_plan_id
 LEFT JOIN public.ai_work_plans kp ON kp.id=j.idempotency_key
), groups AS (
 SELECT app_id,count(*) AS jobs FROM resolved WHERE app_id IS NOT NULL GROUP BY app_id
)
SELECT count(*) FILTER(WHERE jobs>1) AS groups_with_multiple_jobs,
       COALESCE(sum(jobs-1) FILTER(WHERE jobs>1),0) AS excess_jobs,
       count(*) AS groups_with_resolved_application
FROM groups;

SELECT table_name,column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('applications','ai_work_plans','orchestrator_jobs','admin_users')
ORDER BY table_name,ordinal_position;

SELECT n.nspname AS schema,p.proname AS routine,p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('nexus_orchestrator_command','nexus_worker_command','nexus_production_command','run_cycle','tick')
ORDER BY schema,routine;
