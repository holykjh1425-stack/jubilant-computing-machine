-- New worker-only table explicitly denies direct access; private owner functions remain the sole path.
create policy "worker state private only" on nexus_orchestrator_private.worker_state for all to public using(false) with check(false);
-- pg_net was just enabled by this rollout, before any test dispatch. Recreate only if its
-- newly-created queues are empty. No CASCADE and no existing project extension is removed.
do $$ begin
 if exists(select 1 from net.http_request_queue) or exists(select 1 from net._http_response) then
  raise exception 'network extension already used; migration must be reviewed';
 end if;
 if exists(select 1 from nexus_orchestrator_private.worker_state where test_requested or test_dispatched) then
  raise exception 'test already armed; migration must be reviewed';
 end if;
end $$;
drop extension pg_net;
create extension pg_net with schema extensions;
revoke all on net.http_request_queue from public,anon,authenticated;
