-- Additive worker metadata only. No customer/auth/Vault existing rows changed.
create table nexus_orchestrator_private.worker_state (
 singleton boolean primary key default true check(singleton),
 cycles bigint not null default 0, processed bigint not null default 0,
 last_started_at timestamptz,last_finished_at timestamptz,last_error text,
 test_requested boolean not null default false,test_dispatched boolean not null default false,
 dispatch_id bigint,dispatched_at timestamptz
);
alter table nexus_orchestrator_private.worker_state enable row level security;
revoke all on nexus_orchestrator_private.worker_state from public,anon,authenticated,service_role;
insert into nexus_orchestrator_private.worker_state(singleton) values(true);
-- A worker-only credential, created in the database and never returned to an operator/model.
do $$ begin
 if not exists(select 1 from vault.secrets where name='nexus_orchestrator_worker_token') then
  perform vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'nexus_orchestrator_worker_token');
 end if;
end $$;
create function nexus_orchestrator_private.worker_command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server required' using errcode='42501'; end if;
 if p_action='authorize' then
  return to_jsonb(length(coalesce(p_data->>'token',''))=64 and exists(select 1 from vault.decrypted_secrets where name='nexus_orchestrator_worker_token' and decrypted_secret=p_data->>'token'));
 elsif p_action='claim_test' then
  if not exists(select 1 from nexus_orchestrator_private.worker_state where singleton and test_requested and test_dispatched) then return 'false'::jsonb; end if;
  select user_id into strict a from public.admin_users order by created_at limit 1;
  return to_jsonb(public.nexus_ai_claim_test(a));
 elsif p_action='state' then
  return jsonb_build_object('worker',(select to_jsonb(s)-'singleton' from nexus_orchestrator_private.worker_state s where singleton),
   'claude_test',(select to_jsonb(r)-'requested_by' from public.ai_connection_runs r where run_key='claude-connection-v1'),
   'paid_production_enabled',false);
 else raise exception 'unsupported worker command'; end if;
end $$;
revoke all on function nexus_orchestrator_private.worker_command(text,jsonb) from public,anon,authenticated;
grant execute on function nexus_orchestrator_private.worker_command(text,jsonb) to service_role;
create function public.nexus_worker_command(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select nexus_orchestrator_private.worker_command(p_action,p_data);$$;
revoke all on function public.nexus_worker_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.nexus_worker_command(text,jsonb) to service_role;

-- Pure bounded free planning cycle; executed by trusted Postgres cron only.
create function nexus_orchestrator_private.run_cycle() returns integer
language plpgsql security definer set search_path='' as $$
declare t jsonb; r jsonb; outcome text; reason text; i integer; n integer:=0; prior text; request_id bigint;
begin
 if not pg_try_advisory_xact_lock(68170221) then return 0; end if;
 prior:=current_setting('request.jwt.claims',true);
 update nexus_orchestrator_private.worker_state set last_started_at=clock_timestamp(),cycles=cycles+1 where singleton;
 begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  for i in 1..8 loop
   t:=nexus_orchestrator_private.command('claim','{}'); exit when t='null'::jsonb;
   r:=null;reason:=null;outcome:='completed';
   if t->>'agent'<>'internal' then
    outcome:='blocked';reason:=case t->>'agent' when 'claude' then 'production_adapter_not_enabled' when 'openai' then 'zero_credit_paid_calls_forbidden' when 'codex' then 'runner_and_auth_not_configured' else 'no_verified_remote_control_interface' end;
   elsif t->>'kind'='requirements' then
    r:=jsonb_build_object('kind','requirements','instruction',t->>'instruction','requirements',jsonb_build_array('입력 요구사항 확인','완료 기준 검토'),'mode','rules_only','paid_calls',0);
   elsif t->>'kind'='scope' then
    r:=jsonb_build_object('kind','scope','instruction',t->>'instruction','deliverable','요청에 대한 작업 범위 초안','steps',jsonb_build_array('요구사항 확인','구현 범위 검토','검증 기준 확인','관리자 검토'),'execution_started',false,'paid_calls',0);
   elsif t->>'kind'='validation' then
    if jsonb_array_length(t->'previous')<>2 or exists(select 1 from jsonb_array_elements(t->'previous') p where p->>'paid_calls' is distinct from '0') then
     outcome:='failed';reason:='invalid_upstream_result';
    else r:=jsonb_build_object('kind','validation','passed',true,'scope','workflow_metadata_only','checks',jsonb_build_array('선행 단계 결과 존재','유료 호출 0회','실행 미시작'),'paid_calls',0);end if;
   elsif t->>'kind'='human_review' then
    outcome:='awaiting_approval';r:=jsonb_build_object('kind','human_review','next_action','관리자가 범위 초안을 검토해야 합니다. 실제 제작·배포는 아직 시작되지 않았습니다.','paid_calls',0);
   else outcome:='failed';reason:='unsupported_task';end if;
   perform nexus_orchestrator_private.command('finish',jsonb_build_object('task_id',t->>'id','lease',t->>'lease_token','status',outcome,'code',reason,'verified',outcome='completed','result',r));n:=n+1;
  end loop;
  -- Diagnostic only: fixed synthetic prompt, one global attempt, never customer content.
  if exists(select 1 from nexus_orchestrator_private.worker_state where singleton and test_requested and not test_dispatched)
   and not exists(select 1 from public.ai_connection_runs where run_key='claude-connection-v1') then
   update nexus_orchestrator_private.worker_state set test_dispatched=true,dispatched_at=clock_timestamp() where singleton;
   select net.http_post(url:='https://elfacqmvygnwjlklqhiz.supabase.co/functions/v1/nexus-agent-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='nexus_orchestrator_worker_token')),
    body:='{"action":"connection_test"}'::jsonb,timeout_milliseconds:=30000) into request_id;
   update nexus_orchestrator_private.worker_state set dispatch_id=request_id where singleton;
  end if;
  update nexus_orchestrator_private.worker_state set last_finished_at=clock_timestamp(),processed=processed+n,last_error=null where singleton;
 exception when others then
  -- Roll back this cycle's queue/dispatch changes, record only a non-sensitive SQLSTATE.
  update nexus_orchestrator_private.worker_state set last_finished_at=clock_timestamp(),last_error='cycle_failed_'||sqlstate where singleton;n:=0;
 end;
 perform set_config('request.jwt.claims',coalesce(prior,''),true);return n;
end $$;
revoke all on function nexus_orchestrator_private.run_cycle() from public,anon,authenticated,service_role;
-- No connection test is requested by this migration. It is separately armed only after deployment.
