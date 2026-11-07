
-- Production approval, queue/claim, and direct status writes all require a real quotation record.
create function nexus_production_private.guard_quote() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.status in ('queued','running','awaiting_review','released') or new.production_approved_at is not null then
  if not exists(select 1 from public.solq_quote_acceptances q where q.id=new.quote_acceptance_id and q.application_id=new.application_id) then raise exception 'verified customer quotation acceptance required' using errcode='42501';end if;
 end if;
 return new;
end $fn$;
revoke all on function nexus_production_private.guard_quote() from public,anon,authenticated,service_role;
create trigger solq_quotation_guard before insert or update on public.production_jobs for each row execute function nexus_production_private.guard_quote();
create function nexus_production_private.guard_application_quote() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.status is distinct from old.status and new.status in ('in_progress','completed') and not exists(select 1 from public.production_jobs j join public.solq_quote_acceptances q on q.id=j.quote_acceptance_id and q.application_id=j.application_id where j.application_id=new.id) then raise exception 'verified customer quotation acceptance required' using errcode='42501';end if;
 return new;
end $fn$;
revoke all on function nexus_production_private.guard_application_quote() from public,anon,authenticated,service_role;
create trigger solq_application_quotation_guard before update of status on public.applications for each row execute function nexus_production_private.guard_application_quote();
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
  elsif j.status in ('deposit_confirmed','in_progress') and exists (select 1 from public.production_jobs q join public.admin_users u on u.user_id=q.production_approved_by where q.id=j.id and q.production_approved_at is not null and q.payment_observed_at is not null and exists(select 1 from public.solq_quote_acceptances qa where qa.id=q.quote_acceptance_id and qa.application_id=q.application_id)) then
   update public.production_jobs set status='queued',payment_observed_at=coalesce(payment_observed_at,now()),updated_at=now() where id=j.id and status='awaiting_deposit';
   if found then insert into public.production_events(job_id,event) values(j.id,'admin_deposit_confirmation_observed');end if;
  else update public.production_jobs set status='awaiting_deposit' where id=j.id and status='queued';end if;
 end loop;
 for j in select id from public.production_jobs where status='running' and lease_until<now() for update skip locked loop
  update public.production_jobs set status='failed',error_code='execution_outcome_unknown_no_retry',lease_token=null,lease_until=null,updated_at=now() where id=j.id;
  update public.production_attempts set status='unknown',error_code='lease_expired_no_retry',completed_at=now() where job_id=j.id and status='reserved';
  insert into public.production_events(job_id,event) values(j.id,'execution_unknown_no_retry');
 end loop;
 perform nexus_production_private.free_cycle();
 return n;
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
 if not exists(select 1 from public.solq_quote_acceptances q where q.id=j.quote_acceptance_id and q.application_id=a.id) then raise exception 'verified customer quotation acceptance required' using errcode='42501';end if;
 if j.production_approved_at is not null then return jsonb_build_object('approved',true,'duplicate',true,'job_id',j.id,'status',j.status);end if;
 if j.status<>'awaiting_deposit' or j.attempt_count<>0 then raise exception 'job is not approvable' using errcode='42501';end if;
 update public.production_jobs set production_approved_by=actor,production_approved_at=now(),payment_observed_at=now(),status='queued',updated_at=now() where id=j.id;
 update public.applications set status='in_progress' where id=a.id;
 insert into public.production_events(job_id,event) values(j.id,'separate_admin_production_approval');
 return jsonb_build_object('approved',true,'duplicate',false,'job_id',j.id,'status','queued');
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
   where p.status='queued' and exists(select 1 from public.solq_quote_acceptances qa where qa.id=p.quote_acceptance_id and qa.application_id=p.application_id) and p.provider=c.provider and p.attempt_count=0 and p.payment_observed_at is not null and p.production_approved_at is not null and exists (select 1 from public.admin_users u where u.user_id=p.production_approved_by) and src_app.status in ('deposit_confirmed','in_progress')
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


