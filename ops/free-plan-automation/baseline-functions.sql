CREATE OR REPLACE FUNCTION nexus_production_private.plan(p_type text, p_description text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('classification_method','rules','service_type',p_type,'requirements',p_description,
  'assigned_agent',case when p_type in ('website','custom_system') then 'codex' else 'openai' end,
  'stages',jsonb_build_array('classification','preview','deposit_confirmation','generation','validation','admin_review','delivery'),
  'features',jsonb_build_object('login',p_description ~* '로그인|login','payment',p_description ~* '결제|payment','integration',p_description ~* '연동|integration'),
  'preview_only',true,'paid_calls',0,'claude_required',false);
$function$;

CREATE OR REPLACE FUNCTION nexus_production_private.enroll(p_application uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.applications;j uuid;
begin
 select * into strict a from public.applications where id=p_application;
 insert into public.production_jobs(application_id,receipt_number,service_type,provider,plan,status,error_code)
 values(a.id,a.receipt_number,a.service_type,case when a.service_type in ('website','custom_system') then 'codex' else 'openai' end,
 nexus_production_private.plan(a.service_type,a.description),case when a.description ~* '(sk-|sb_secret_|-----BEGIN|password\s*[:=]|비밀번호\s*[:=])' then 'blocked' else 'awaiting_deposit' end,
 case when a.description ~* '(sk-|sb_secret_|-----BEGIN|password\s*[:=]|비밀번호\s*[:=])' then 'possible_credentials_require_redaction' else null end)
 on conflict(application_id) do nothing returning id into j;
 if j is null then select id into j from public.production_jobs where application_id=a.id;
 else insert into public.production_events(job_id,event) values(j,'classified_and_preview_ready');end if;
 return j;
end $function$;

CREATE OR REPLACE FUNCTION public.submit_application(p_customer_name text, p_contact text, p_service_type text, p_description text, p_privacy_consent boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_receipt text;
begin
 if auth.role() not in ('anon','authenticated') then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_privacy_consent is distinct from true
 or char_length(btrim(coalesce(p_customer_name,''))) not between 1 and 100
 or char_length(btrim(coalesce(p_contact,''))) not between 3 and 200
 or p_service_type not in ('website','ai_automation','custom_system','consulting')
 or char_length(btrim(coalesce(p_description,''))) not between 1 and 5000 then
   raise exception 'Invalid application' using errcode='22023';
 end if;
 insert into public.applications(customer_name,contact,service_type,description,privacy_consent,status,internal_note)
 values(btrim(p_customer_name),btrim(p_contact),p_service_type,btrim(p_description),true,'received',null)
 returning receipt_number into v_receipt;
 return v_receipt;
end; $function$;

CREATE OR REPLACE FUNCTION nexus_orchestrator_private.command(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.orchestrator_jobs; t public.orchestrator_tasks; v_id uuid; v_status text; v_code text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server required' using errcode='42501'; end if;
 if p_action='submit' then
  if not exists(select 1 from public.admin_users where user_id=(p_data->>'actor')::uuid) then raise exception 'admin required'; end if;
  if (p_data->>'instruction') ~* '(sk-|sb_secret_|-----BEGIN|password\s*[:=]|비밀번호\s*[:=])' then raise exception 'credential input forbidden'; end if;
  insert into public.orchestrator_jobs(created_by,idempotency_key,instruction,agent)
  values((p_data->>'actor')::uuid,(p_data->>'key')::uuid,p_data->>'instruction',p_data->>'agent')
  on conflict(idempotency_key) do nothing returning * into j;
  if j.id is null then
   select * into strict j from public.orchestrator_jobs where idempotency_key=(p_data->>'key')::uuid;
   if j.created_by<>(p_data->>'actor')::uuid or j.instruction<>p_data->>'instruction' or j.agent<>p_data->>'agent' then raise exception 'idempotency conflict'; end if;
   return to_jsonb(j);
  end if;
  insert into public.orchestrator_tasks(job_id,ordinal,kind,agent) values
   (j.id,1,'requirements','internal'),(j.id,2,'scope',j.agent),(j.id,3,'validation','internal'),(j.id,4,'human_review','internal');
  insert into public.orchestrator_events(job_id,event) values(j.id,'submitted');
  return to_jsonb(j);
 elsif p_action='claim' then
  -- Expired internal work is safe to retry. External outcomes must be reviewed, never replayed.
  for t in select * from public.orchestrator_tasks where status='running' and lease_until<now() for update skip locked loop
   v_status:=case when t.agent='internal' and t.attempts<3 then 'retry_wait' else 'blocked' end;
   update public.orchestrator_tasks set status=v_status,error_code='lease_expired',lease_token=null,lease_until=null,next_attempt_at=now()+interval '5 seconds' where id=t.id;
   update public.orchestrator_jobs set status=case when v_status='blocked' then 'blocked' else 'running' end,updated_at=now() where id=t.job_id;
   insert into public.orchestrator_events(job_id,task_id,event,code) values(t.job_id,t.id,v_status,'lease_expired');
  end loop;
  select x.* into t from public.orchestrator_tasks x
   join public.orchestrator_jobs y on y.id=x.job_id
   where x.status in ('queued','retry_wait') and x.next_attempt_at<=now() and y.status in ('queued','running')
   and not exists(select 1 from public.orchestrator_tasks d where d.job_id=x.job_id and d.ordinal<x.ordinal and (d.status<>'completed' or not d.verified))
   order by y.created_at,x.ordinal for update of x skip locked limit 1;
  if t.id is null then return 'null'::jsonb; end if;
  update public.orchestrator_tasks set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where id=t.id returning * into t;
  update public.orchestrator_jobs set status='running',updated_at=now() where id=t.job_id;
  insert into public.orchestrator_events(job_id,task_id,event) values(t.job_id,t.id,'claimed');
  select * into strict j from public.orchestrator_jobs where id=t.job_id;
  return to_jsonb(t)||jsonb_build_object('instruction',j.instruction,'previous',coalesce((select jsonb_agg(result order by ordinal) from public.orchestrator_tasks where job_id=t.job_id and ordinal<t.ordinal),'[]'::jsonb));
 elsif p_action='finish' then
  select * into strict t from public.orchestrator_tasks where id=(p_data->>'task_id')::uuid for update;
  if t.status<>'running' or t.lease_token<>(p_data->>'lease')::uuid or t.lease_until<now() or p_data->>'lease' is null then raise exception 'stale lease'; end if;
  v_status:=p_data->>'status'; v_code:=p_data->>'code';
  if v_status not in ('completed','blocked','failed','awaiting_approval','retry_wait') then raise exception 'invalid status'; end if;
  if v_status='completed' and coalesce((p_data->>'verified')::boolean,false) is not true then raise exception 'verification required'; end if;
  if v_status='retry_wait' and (t.agent<>'internal' or t.attempts>=3) then v_status:='blocked'; v_code:='retry_not_safe'; end if;
  update public.orchestrator_tasks set status=v_status,result=p_data->'result',error_code=v_code,
   verified=coalesce((p_data->>'verified')::boolean,false),lease_token=null,lease_until=null,
   next_attempt_at=now()+make_interval(secs=>least(60,power(2,t.attempts)::int)) where id=t.id;
  insert into public.orchestrator_events(job_id,task_id,event,code) values(t.job_id,t.id,v_status,v_code);
  update public.orchestrator_jobs set status=case
   when v_status in ('blocked','failed','awaiting_approval') then v_status
   when not exists(select 1 from public.orchestrator_tasks where job_id=t.job_id and status<>'completed') then 'completed'
   else 'running' end,updated_at=now() where id=t.job_id;
  return jsonb_build_object('saved',true,'status',v_status);
 else raise exception 'unsupported command'; end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.nexus_orchestrator_command(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select nexus_orchestrator_private.command(p_action,p_data);$function$;

CREATE OR REPLACE FUNCTION nexus_orchestrator_private.run_cycle()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t jsonb; r jsonb; outcome text; reason text; i integer; n integer:=0; prior text; request_id bigint; v_expires bigint;
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
   v_expires:=floor(extract(epoch from clock_timestamp()))::bigint+60;
   select net.http_post(url:='https://YOUR-PROJECT.supabase.co/functions/v1/nexus-agent-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select encode(extensions.hmac('nexus-agent-worker:POST:connection_test:'||v_expires::text,decrypted_secret,'sha256'),'hex')||'.'||v_expires::text from vault.decrypted_secrets where name='nexus_orchestrator_worker_token')),
    body:='{"action":"connection_test"}'::jsonb,timeout_milliseconds:=30000) into request_id;
   update nexus_orchestrator_private.worker_state set dispatch_id=request_id where singleton;
  end if;
  update nexus_orchestrator_private.worker_state set last_finished_at=clock_timestamp(),processed=processed+n,last_error=null where singleton;
 exception when others then
  -- Roll back this cycle's queue/dispatch changes, record only a non-sensitive SQLSTATE.
  update nexus_orchestrator_private.worker_state set last_finished_at=clock_timestamp(),last_error='cycle_failed_'||sqlstate where singleton;n:=0;
 end;
 perform set_config('request.jwt.claims',coalesce(prior,''),true);return n;
end $function$;

CREATE OR REPLACE FUNCTION nexus_orchestrator_private.worker_command(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid; v_expires bigint; v_expected text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server required' using errcode='42501'; end if;
 if p_action='authorize' then
  if coalesce(p_data->>'token','') !~ '^[0-9a-f]{64}\.[0-9]{10}$' then return 'false'::jsonb; end if;
  v_expires:=split_part(p_data->>'token','.',2)::bigint;
  if v_expires<floor(extract(epoch from clock_timestamp())) or v_expires>floor(extract(epoch from clock_timestamp()))+90 then return 'false'::jsonb; end if;
  select encode(extensions.hmac('nexus-agent-worker:POST:connection_test:'||v_expires::text,decrypted_secret,'sha256'),'hex')||'.'||v_expires::text into v_expected from vault.decrypted_secrets where name='nexus_orchestrator_worker_token';
  return to_jsonb(coalesce(v_expected=p_data->>'token',false));
 elsif p_action='claim_test' then
  if not exists(select 1 from nexus_orchestrator_private.worker_state where singleton and test_requested and test_dispatched) then return 'false'::jsonb; end if;
  select user_id into strict a from public.admin_users order by created_at limit 1;
  return to_jsonb(public.nexus_ai_claim_test(a));
 elsif p_action='state' then
  return jsonb_build_object('worker',(select to_jsonb(s)-'singleton' from nexus_orchestrator_private.worker_state s where singleton),
   'claude_test',(select to_jsonb(r)-'requested_by' from public.ai_connection_runs r where run_key='claude-connection-v1'),
   'paid_production_enabled',false);
 else raise exception 'unsupported worker command'; end if;
end $function$;

CREATE OR REPLACE FUNCTION nexus_production_private.guard_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.status is distinct from old.status and new.status in ('in_progress','completed') and not exists(select 1 from public.production_jobs j join public.admin_users u on u.user_id=j.production_approved_by where j.application_id=new.id and j.production_approved_at is not null and j.payment_observed_at is not null) then raise exception 'separate production approval required' using errcode='42501';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION nexus_production_private.tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a record;j record;n int:=0;
begin
 if not pg_try_advisory_xact_lock(68170222) then return 0;end if;
 for a in select x.id from public.applications x where x.created_at >= (select capture_from from nexus_production_private.settings where singleton)
 and not exists(select 1 from public.production_jobs y where y.application_id=x.id) order by x.created_at limit 50 loop
  perform nexus_production_private.enroll(a.id);n:=n+1;
 end loop;
 for j in select p.id,src_app.status from public.production_jobs p join public.applications src_app on src_app.id=p.application_id
 where p.status in ('awaiting_deposit','queued') for update of p skip locked loop
  if j.status='cancelled' then
   update public.production_jobs set status='cancelled',updated_at=now() where id=j.id;
   insert into public.production_events(job_id,event) values(j.id,'application_cancelled');
  elsif j.status in ('deposit_confirmed','in_progress') and exists (select 1 from public.production_jobs q join public.admin_users u on u.user_id=q.production_approved_by where q.id=j.id and q.production_approved_at is not null and q.payment_observed_at is not null) then
   update public.production_jobs set status='queued',payment_observed_at=coalesce(payment_observed_at,now()),updated_at=now() where id=j.id and status='awaiting_deposit';
   if found then insert into public.production_events(job_id,event) values(j.id,'admin_deposit_confirmation_observed');end if;
  else update public.production_jobs set status='awaiting_deposit' where id=j.id and status='queued';end if;
 end loop;
 for j in select id from public.production_jobs where status='running' and lease_until<now() for update skip locked loop
  update public.production_jobs set status='failed',error_code='execution_outcome_unknown_no_retry',lease_token=null,lease_until=null,updated_at=now() where id=j.id;
  update public.production_attempts set status='unknown',error_code='lease_expired_no_retry',completed_at=now() where job_id=j.id and status='reserved';
  insert into public.production_events(job_id,event) values(j.id,'execution_unknown_no_retry');
 end loop;
 return n;
end $function$;

CREATE OR REPLACE FUNCTION nexus_production_private.command(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.production_jobs;a public.applications;c nexus_production_private.providers;k text;h text;r text;v uuid;cost bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server required' using errcode='42501';end if;
 if p_action in ('snapshot','issue_link','release') and not exists(select 1 from public.admin_users where user_id=(p_data->>'actor')::uuid) then raise exception 'admin required' using errcode='42501';end if;
 if p_action='submit' then
  k:=p_data->>'token';
  if k is null or k !~ '^[a-f0-9]{64}$' or p_data->>'privacy_consent' is distinct from 'true' or p_data->>'transfer_consent' is distinct from 'true'
   or coalesce(length(btrim(p_data->>'customer_name')),0) not between 1 and 100
   or coalesce(length(btrim(p_data->>'contact')),0) not between 3 and 200
   or coalesce(length(btrim(p_data->>'description')),0) not between 1 and 5000
   or coalesce(p_data->>'service_type','') not in ('website','ai_automation','custom_system','consulting') then raise exception 'invalid order';end if;
  h:=encode(sha256(convert_to((p_data-'token')::text,'UTF8')),'hex');
  -- Serialize the same capability so retries cannot create duplicate customer records.
  perform pg_advisory_xact_lock(hashtextextended(k,0));
  select p.* into j from public.production_jobs p join nexus_production_private.access_keys x on x.job_id=p.id where x.token_hash=encode(sha256(convert_to(k,'UTF8')),'hex');
  if j.id is not null then
   if (select request_hash from nexus_production_private.access_keys where job_id=j.id) is distinct from h then raise exception 'idempotency conflict';end if;
  else
   insert into public.applications(customer_name,contact,service_type,description,privacy_consent,status,internal_note)
   values(btrim(p_data->>'customer_name'),btrim(p_data->>'contact'),p_data->>'service_type',btrim(p_data->>'description'),true,'received',null) returning * into a;
   v:=nexus_production_private.enroll(a.id);select * into strict j from public.production_jobs where id=v;
   insert into nexus_production_private.access_keys(job_id,token_hash,request_hash) values(j.id,encode(sha256(convert_to(k,'UTF8')),'hex'),h);
  end if;
  return jsonb_build_object('receipt_number',j.receipt_number,'status',j.status,'preview',j.plan-'requirements');
 elsif p_action='portal' then
  k:=p_data->>'token';if k is null or k !~ '^[a-f0-9]{64}$' then return 'null'::jsonb;end if;
  select p.* into j from public.production_jobs p join nexus_production_private.access_keys x on x.job_id=p.id
   where p.receipt_number=p_data->>'receipt_number' and x.token_hash=encode(sha256(convert_to(k,'UTF8')),'hex');
  if j.id is null then return 'null'::jsonb;end if;
  return jsonb_build_object('receipt_number',j.receipt_number,'status',j.status,'preview',j.plan-'requirements','result',case when j.status='released' then j.result else null end,'released_at',j.released_at);
 elsif p_action='snapshot' then
  return jsonb_build_object('jobs',(select coalesce(jsonb_agg(x),'[]'::jsonb) from(select * from public.production_jobs order by created_at desc limit 30)x),
   'providers',(select jsonb_agg(jsonb_build_object('provider',provider,'enabled',enabled,'verified_at',verified_at,'readiness',readiness,'heartbeat_at',heartbeat_at)) from nexus_production_private.providers),
   'attempts',(select coalesce(jsonb_agg(x),'[]'::jsonb) from(select * from public.production_attempts order by created_at desc limit 100)x),
   'events',(select coalesce(jsonb_agg(x),'[]'::jsonb) from(select * from public.production_events order by id desc limit 100)x));
 elsif p_action='issue_link' then
  select * into strict j from public.production_jobs where id=(p_data->>'job_id')::uuid for update;
  k:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into nexus_production_private.access_keys(job_id,token_hash) values(j.id,encode(sha256(convert_to(k,'UTF8')),'hex')) on conflict(job_id) do update set token_hash=excluded.token_hash,request_hash=null;
  insert into public.production_events(job_id,event) values(j.id,'customer_access_link_issued');
  return jsonb_build_object('receipt_number',j.receipt_number,'token',k);
 elsif p_action='release' then
  select * into strict j from public.production_jobs where id=(p_data->>'job_id')::uuid for update;
  if j.status<>'awaiting_review' or j.result_hash is distinct from p_data->>'expected_hash' then raise exception 'review stale or result unavailable';end if;
  if not exists(select 1 from public.applications where id=j.application_id and status in ('deposit_confirmed','in_progress','completed')) then raise exception 'payment not confirmed';end if;
  update public.production_jobs set status='released',released_by=(p_data->>'actor')::uuid,released_at=now(),updated_at=now() where id=j.id;
  insert into public.production_events(job_id,event) values(j.id,'reviewed_result_released_to_customer_portal');return '{"released":true}'::jsonb;
 elsif p_action='heartbeat' then
  update nexus_production_private.providers set heartbeat_at=now(),readiness=case when p_data->>'ready'='true' then 'ready' else 'authentication_or_runtime_missing' end where provider=p_data->>'provider';
  return '{"saved":true}'::jsonb;
 elsif p_action='claim' then
  perform nexus_production_private.tick();
  select * into c from nexus_production_private.providers where provider=p_data->>'provider' for update;
  if c.provider is null then raise exception 'unsupported provider';end if;
  if not c.enabled or c.verified_at is null or c.verified_at<now()-interval '1 hour' or c.approved_calls<=c.reserved_calls or c.model is null then return jsonb_build_object('blocked','provider_not_enabled_or_verified');end if;
  cost:=case when c.provider='openai' then (24096::bigint*c.input_micro_per_token+4096::bigint*c.output_micro_per_token) else 0 end;
  if c.provider='openai' and (c.input_micro_per_token<=0 or c.output_micro_per_token<=0 or c.reserved_micro_usd+cost>c.approved_micro_usd) then return jsonb_build_object('blocked','approved_budget_exhausted');end if;
  select p.* into j from public.production_jobs p join public.applications src_app on src_app.id=p.application_id
   where p.status='queued' and p.provider=c.provider and p.attempt_count=0 and p.payment_observed_at is not null and p.production_approved_at is not null and exists (select 1 from public.admin_users u where u.user_id=p.production_approved_by) and src_app.status in ('deposit_confirmed','in_progress')
   order by p.created_at for update of p skip locked limit 1;
  if j.id is null then return 'null'::jsonb;end if;
  update nexus_production_private.providers set reserved_calls=reserved_calls+1,reserved_micro_usd=reserved_micro_usd+cost where provider=c.provider;
  update public.production_jobs set status='running',attempt_count=1,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() where id=j.id returning * into j;
  insert into public.production_attempts(job_id,provider,reserved_micro_usd) values(j.id,c.provider,cost);
  insert into public.production_events(job_id,event) values(j.id,'agent_execution_reserved');
  return jsonb_build_object('id',j.id,'lease',j.lease_token,'provider',c.provider,'model',c.model,'plan',j.plan,'max_output_tokens',4096,'execution_authorized',true);
 elsif p_action='finish' then
  select * into strict j from public.production_jobs where id=(p_data->>'job_id')::uuid for update;
  if j.status<>'running' or j.lease_token is distinct from (p_data->>'lease')::uuid or j.lease_until<now() then raise exception 'stale execution lease';end if;
  if p_data->>'success'='true' then
   if jsonb_typeof(p_data->'result') is distinct from 'object' or jsonb_typeof(p_data->'result'->'files') is distinct from 'array'
    or jsonb_array_length(p_data->'result'->'files') not between 1 and 12 or octet_length((p_data->'result')::text)>100000
    or p_data->'validation'->>'passed' is distinct from 'true' then raise exception 'unverified result';end if;
   update public.production_jobs set status='awaiting_review',result=p_data->'result',validation=p_data->'validation',result_hash=encode(sha256(convert_to((p_data->'result')::text,'UTF8')),'hex'),lease_token=null,lease_until=null,updated_at=now() where id=j.id;
   update public.production_attempts set status='succeeded',usage=p_data->'usage',completed_at=now() where job_id=j.id and status='reserved';
   insert into public.production_events(job_id,event) values(j.id,'generated_artifact_verified_awaiting_admin_review');
  else
   r:=case when p_data->>'error_code' in ('provider_failed_or_unknown','invalid_artifact','runtime_failed','budget_gate_closed') then p_data->>'error_code' else 'runtime_failed' end;
   update public.production_jobs set status='failed',error_code=r,lease_token=null,lease_until=null,updated_at=now() where id=j.id;
   update public.production_attempts set status='failed_or_unknown',error_code=r,completed_at=now() where job_id=j.id and status='reserved';
   insert into public.production_events(job_id,event) values(j.id,'agent_execution_failed_no_auto_retry');
  end if;
  return '{"saved":true}'::jsonb;
 else raise exception 'unsupported command';end if;
end $function$;

CREATE OR REPLACE FUNCTION public.nexus_production_command(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select nexus_production_private.command(p_action,p_data);$function$;

CREATE OR REPLACE FUNCTION nexus_production_private.guard_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (TG_OP='INSERT' and (new.production_approved_at is not null or new.production_approved_by is not null))
 or (TG_OP='UPDATE' and (new.production_approved_at is distinct from old.production_approved_at or new.production_approved_by is distinct from old.production_approved_by)) then
  if auth.uid() is null or coalesce(auth.jwt()->>'role','') <> 'authenticated' or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'authenticated admin approval required' using errcode='42501'; end if;
  if new.production_approved_by is distinct from auth.uid() or new.production_approved_at is null then raise exception 'invalid approval identity' using errcode='42501'; end if;
 end if;
 if new.status in ('queued','running','awaiting_review','released') then
  perform 1 from public.applications where id=new.application_id and status in ('deposit_confirmed','in_progress','completed') for update;
  if not found or new.payment_observed_at is null or new.production_approved_at is null
   or not exists(select 1 from public.admin_users where user_id=new.production_approved_by) then raise exception 'payment and separate production approval required' using errcode='42501'; end if;
 end if;
 if new.status='queued' and (TG_OP='INSERT' or old.status is distinct from 'queued') and coalesce(new.attempt_count,0)<>0 then raise exception 'duplicate execution prohibited' using errcode='42501';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION nexus_production_private.approve(p_application uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.applications; j public.production_jobs; actor uuid:=auth.uid();
begin
 if actor is null or coalesce(auth.jwt()->>'role','') <> 'authenticated' or not exists(select 1 from public.admin_users where user_id=actor) then raise exception 'admin required' using errcode='42501';end if;
 select * into strict a from public.applications where id=p_application for update;
 if a.status not in ('deposit_confirmed','in_progress') then raise exception 'manual payment confirmation required' using errcode='42501';end if;
 select * into j from public.production_jobs where application_id=a.id for update;
 if j.id is null then perform nexus_production_private.enroll(a.id); select * into strict j from public.production_jobs where application_id=a.id for update;end if;
 if j.production_approved_at is not null then return jsonb_build_object('approved',true,'duplicate',true,'job_id',j.id,'status',j.status);end if;
 if j.status<>'awaiting_deposit' or j.attempt_count<>0 then raise exception 'job is not approvable' using errcode='42501';end if;
 update public.production_jobs set production_approved_by=actor,production_approved_at=now(),payment_observed_at=now(),status='queued',updated_at=now() where id=j.id;
 update public.applications set status='in_progress' where id=a.id;
 insert into public.production_events(job_id,event) values(j.id,'separate_admin_production_approval');
 return jsonb_build_object('approved',true,'duplicate',false,'job_id',j.id,'status','queued');
end $function$;

CREATE OR REPLACE FUNCTION public.solq_approve_production(p_application uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select nexus_production_private.approve(p_application); $function$;

