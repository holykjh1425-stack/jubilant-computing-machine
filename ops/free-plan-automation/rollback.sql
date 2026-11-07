-- Pause automatic free planning only. Retain all generated data and safety gates.
-- Run through a DDL migration. Restores just the pre-change minute tick.
do $rollback$
declare saved_definition text;
begin
 select f->>'definition' into strict saved_definition
 from nexus_production_private.security_backups b,
 jsonb_array_elements(b.payload->'functions') f
 where b.backup_key='solq_free_plan_automation_v1'
 and f->>'schema'='nexus_production_private' and f->>'name'='tick';
 if saved_definition is null then raise exception 'Recovery definition missing';end if;
 execute saved_definition;
end $rollback$;
-- The quotation trigger still blocks unconsented queueing even with the old tick.
-- Do not drop quotation guards, tables, plans, jobs, or unique indexes.
