-- Additive core. Existing applications/admin functions, policies, rows and Claude secrets are untouched.
create schema nexus_production_private;
revoke all on schema nexus_production_private from public,anon,authenticated;
grant usage on schema nexus_production_private to service_role;
create table nexus_production_private.settings(singleton boolean primary key check(singleton),capture_from timestamptz not null default now());
insert into nexus_production_private.settings values(true,now());
create table nexus_production_private.providers(
 provider text primary key check(provider in ('openai','codex')), enabled boolean not null default false,
 verified_at timestamptz, model text, approved_micro_usd bigint not null default 0, reserved_micro_usd bigint not null default 0,
 input_micro_per_token integer not null default 0, output_micro_per_token integer not null default 0,
 approved_calls integer not null default 0,reserved_calls integer not null default 0,
 heartbeat_at timestamptz, readiness text not null default 'not_connected'
);
insert into nexus_production_private.providers(provider) values('openai'),('codex');
create table public.production_jobs(
 id uuid primary key default gen_random_uuid(),application_id uuid not null unique,receipt_number text not null unique,
 service_type text not null,provider text not null check(provider in ('openai','codex')),
 status text not null default 'awaiting_deposit' check(status in ('awaiting_deposit','queued','running','awaiting_review','released','failed','cancelled','blocked')),
 plan jsonb not null,result jsonb,result_hash text,validation jsonb,error_code text,
 lease_token uuid,lease_until timestamptz,attempt_count integer not null default 0 check(attempt_count between 0 and 1),
 payment_observed_at timestamptz,released_by uuid,released_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(result is null or octet_length(result::text)<=100000)
);
create table nexus_production_private.access_keys(job_id uuid primary key references public.production_jobs(id),token_hash text unique not null,request_hash text);
create table public.production_attempts(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.production_jobs(id),provider text not null,
 status text not null default 'reserved',reserved_micro_usd bigint not null,usage jsonb,error_code text,
 created_at timestamptz not null default now(),completed_at timestamptz
);
create table public.production_events(id bigint generated always as identity primary key,job_id uuid not null references public.production_jobs(id),event text not null,created_at timestamptz not null default now());
create index production_jobs_status on public.production_jobs(status,created_at);
create index production_attempts_job on public.production_attempts(job_id);
create index production_events_job on public.production_events(job_id,id);
alter table public.production_jobs enable row level security;
alter table public.production_events enable row level security;
alter table public.production_attempts enable row level security;
alter table nexus_production_private.settings enable row level security;
alter table nexus_production_private.providers enable row level security;
alter table nexus_production_private.access_keys enable row level security;
revoke all on public.production_jobs,public.production_events,public.production_attempts from public,anon,authenticated;
grant select on public.production_jobs,public.production_events,public.production_attempts to authenticated,service_role;
revoke all on nexus_production_private.settings,nexus_production_private.providers,nexus_production_private.access_keys from public,anon,authenticated,service_role;
create policy production_admin_jobs on public.production_jobs for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy production_admin_events on public.production_events for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy production_admin_attempts on public.production_attempts for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy private_settings on nexus_production_private.settings for all using(false) with check(false);
create policy private_providers on nexus_production_private.providers for all using(false) with check(false);
create policy private_access on nexus_production_private.access_keys for all using(false) with check(false);

create function nexus_production_private.plan(p_type text,p_description text) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('classification_method','rules','service_type',p_type,'requirements',p_description,
  'assigned_agent',case when p_type in ('website','custom_system') then 'codex' else 'openai' end,
  'stages',jsonb_build_array('classification','preview','deposit_confirmation','generation','validation','admin_review','delivery'),
  'features',jsonb_build_object('login',p_description ~* '로그인|login','payment',p_description ~* '결제|payment','integration',p_description ~* '연동|integration'),
  'preview_only',true,'paid_calls',0,'claude_required',false);
$$;
revoke all on function nexus_production_private.plan(text,text) from public,anon,authenticated,service_role;

create function nexus_production_private.enroll(p_application uuid) returns uuid
language plpgsql set search_path='' as $$
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
end $$;
revoke all on function nexus_production_private.enroll(uuid) from public,anon,authenticated,service_role;

create function nexus_production_private.tick() returns integer
language plpgsql security definer set search_path='' as $$
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
  elsif j.status in ('deposit_confirmed','in_progress') then
   update public.production_jobs set status='queued',payment_observed_at=coalesce(payment_observed_at,now()),updated_at=now() where id=j.id and status='awaiting_deposit';
   if found then insert into public.production_events(job_id,event) values(j.id,'admin_deposit_confirmation_observed');end if;
  else update public.production_jobs set status='awaiting_deposit',payment_observed_at=null where id=j.id and status='queued';end if;
 end loop;
 for j in select id from public.production_jobs where status='running' and lease_until<now() for update skip locked loop
  update public.production_jobs set status='failed',error_code='execution_outcome_unknown_no_retry',lease_token=null,lease_until=null,updated_at=now() where id=j.id;
  update public.production_attempts set status='unknown',error_code='lease_expired_no_retry',completed_at=now() where job_id=j.id and status='reserved';
  insert into public.production_events(job_id,event) values(j.id,'execution_unknown_no_retry');
 end loop;
 return n;
end $$;
revoke all on function nexus_production_private.tick() from public,anon,authenticated,service_role;

create function nexus_production_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
   where p.status='queued' and p.provider=c.provider and p.attempt_count=0 and src_app.status in ('deposit_confirmed','in_progress')
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
end $$;
revoke all on function nexus_production_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function nexus_production_private.command(text,jsonb) to service_role;
create function public.nexus_production_command(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select nexus_production_private.command(p_action,p_data);$$;
revoke all on function public.nexus_production_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.nexus_production_command(text,jsonb) to service_role;
-- Independent schedule. No existing queue function or customer trigger is modified.
select cron.schedule('nexus-production-capture','* * * * *','select nexus_production_private.tick();');
-- Explicitly keep the consumed Claude diagnostic disarmed. Keys and the failed attempt are preserved.
update nexus_orchestrator_private.worker_state set test_requested=false where singleton;
