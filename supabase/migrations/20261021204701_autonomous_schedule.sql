-- Existing project resources only; free metadata planning, one-minute bounded schedule.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
-- Queued requests contain a scoped worker credential: never grant client visibility.
revoke all on net.http_request_queue from public,anon,authenticated;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('nexus-free-orchestrator','* * * * *','select nexus_orchestrator_private.run_cycle();');
