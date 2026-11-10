-- DEVELOPMENT CANDIDATE ONLY. No production migration or historical sends.
-- Application storage never calls the notification enqueue path.
create schema solq_notification_private;
revoke all on schema solq_notification_private from public, anon, authenticated;
grant usage on schema solq_notification_private to service_role;

create table solq_notification_private.settings (
 singleton boolean primary key default true check(singleton),
 capture_from timestamptz, delivery_enabled boolean not null default false,
 admin_email_enabled boolean not null default false,
 customer_email_enabled boolean not null default false,
 daily_attempt_limit integer not null default 50 check(daily_attempt_limit between 1 and 500)
);
insert into solq_notification_private.settings(singleton) values(true);
create table solq_notification_private.intake_tokens (
 token_hash text primary key, request_hash text not null,
 application_id uuid not null unique references public.applications(id),
 expires_at timestamptz not null default now()+interval '7 days'
);
create table public.solq_customer_events (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.applications(id),
 kind text not null check(kind in ('application_received','account_viewed','account_copy_requested','account_copied','deposit_confirmed')),
 created_at timestamptz not null default now(),
 unique(application_id,kind)
);
create table public.solq_notification_outbox (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.solq_customer_events(id),
 audience text not null check(audience in ('admin','customer')),
 channel text not null default 'email' check(channel='email'),
 status text not null default 'requested' check(status in ('requested','sending','accepted','retry_wait','failed','uncertain','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 next_attempt_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, provider_id text,
 error_code text check(error_code in ('rate_limited','provider_rejected','transport_unknown','lease_expired','invalid_recipient','not_approved','auth_unavailable')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(event_id,audience,channel)
);
create index solq_outbox_due on public.solq_notification_outbox(next_attempt_at,created_at) where status in ('requested','retry_wait');
create index solq_events_application on public.solq_customer_events(application_id);
create table public.solq_notification_attempts (
 id bigint generated always as identity primary key,
 notification_id uuid not null references public.solq_notification_outbox(id),
 attempt integer not null, outcome text not null,
 error_code text, created_at timestamptz not null default now()
);
create index solq_attempts_notification on public.solq_notification_attempts(notification_id);
alter table public.solq_customer_events enable row level security;
alter table public.solq_notification_outbox enable row level security;
alter table public.solq_notification_attempts enable row level security;
alter table solq_notification_private.settings enable row level security;
alter table solq_notification_private.intake_tokens enable row level security;
revoke all on public.solq_customer_events,public.solq_notification_outbox,public.solq_notification_attempts from public,anon,authenticated;
grant select on public.solq_customer_events,public.solq_notification_outbox,public.solq_notification_attempts to authenticated;
create policy solq_events_admin on public.solq_customer_events for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy solq_outbox_admin on public.solq_notification_outbox for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy solq_attempts_admin on public.solq_notification_attempts for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
grant select,insert,update on public.applications to service_role;
grant select,insert,update on all tables in schema solq_notification_private to service_role;
grant select,insert,update on public.solq_customer_events,public.solq_notification_outbox,public.solq_notification_attempts to service_role;
grant usage,select on sequence public.solq_notification_attempts_id_seq to service_role;

-- Invoker rights: callable only by a service-role gateway, never directly by a browser.
create function public.solq_notification_command(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 a public.applications; e public.solq_customer_events; o public.solq_notification_outbox;
 token_row solq_notification_private.intake_tokens; cfg solq_notification_private.settings;
 h text; req_hash text; inserted integer; total integer:=0; result jsonb;
begin
 select * into cfg from solq_notification_private.settings where singleton;
 if p_action='submit' then
  if coalesce(p_data->>'token','') !~ '^[a-f0-9]{64}$'
   or (p_data->>'privacy_consent') is distinct from 'true'
   or (p_data->>'transfer_consent') is distinct from 'true'
   or char_length(btrim(coalesce(p_data->>'customer_name',''))) not between 1 and 100
   or char_length(btrim(coalesce(p_data->>'contact',''))) not between 3 and 200
   or coalesce(p_data->>'service_type','') not in ('website','ai_automation','custom_system','consulting')
   or char_length(btrim(coalesce(p_data->>'description',''))) not between 1 and 5000 then
    raise exception 'invalid intake' using errcode='22023';
  end if;
  h:=encode(sha256(convert_to(p_data->>'token','UTF8')),'hex');
  req_hash:=encode(sha256(convert_to((p_data-'token')::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(h,0));
  select * into token_row from solq_notification_private.intake_tokens where token_hash=h;
  if found then
   if token_row.request_hash<>req_hash then raise exception 'idempotency conflict' using errcode='22023'; end if;
   select * into a from public.applications where id=token_row.application_id;
  else
   if p_data ? 'receipt_number' and (p_data->>'receipt_number') !~ '^NX-[0-9]{8}-[A-F0-9]{8}$' then raise exception 'invalid receipt'; end if;
   if p_data ? 'id' then
    insert into public.applications(id,receipt_number,customer_name,contact,service_type,description,privacy_consent,status)
     values((p_data->>'id')::uuid,p_data->>'receipt_number',btrim(p_data->>'customer_name'),btrim(p_data->>'contact'),p_data->>'service_type',btrim(p_data->>'description'),true,'received') returning * into a;
   else
    insert into public.applications(customer_name,contact,service_type,description,privacy_consent,status)
     values(btrim(p_data->>'customer_name'),btrim(p_data->>'contact'),p_data->>'service_type',btrim(p_data->>'description'),true,'received') returning * into a;
   end if;
   insert into solq_notification_private.intake_tokens(token_hash,request_hash,application_id) values(h,req_hash,a.id);
  end if;
  return jsonb_build_object('receipt_number',a.receipt_number);
 elsif p_action='account_event' then
  if coalesce(p_data->>'token','') !~ '^[a-f0-9]{64}$'
   or coalesce(p_data->>'kind','') not in ('account_viewed','account_copy_requested','account_copied') then
   raise exception 'invalid event' using errcode='22023';
  end if;
  h:=encode(sha256(convert_to(p_data->>'token','UTF8')),'hex');
  select ap.* into a from public.applications ap join solq_notification_private.intake_tokens t on t.application_id=ap.id
   where t.token_hash=h and t.expires_at>now() and ap.receipt_number=p_data->>'receipt_number';
  if not found then raise exception 'invalid capability' using errcode='42501'; end if;
  -- One durable first-interaction event per kind; retries and repeated clicks do not spam.
  insert into public.solq_customer_events(application_id,kind) values(a.id,p_data->>'kind') on conflict do nothing;
  return jsonb_build_object('recorded',true);
 elsif p_action='reconcile' then
  if cfg.capture_from is null then return jsonb_build_object('disabled',true); end if;
  -- Retryable independent scan: no notification trigger in the intake transaction.
  insert into public.solq_customer_events(application_id,kind)
   select ap.id,'application_received' from public.applications ap where created_at>=cfg.capture_from
    and not exists(select 1 from public.solq_customer_events ev where ev.application_id=ap.id and ev.kind='application_received')
   order by created_at,id limit 500
   on conflict do nothing;
  insert into public.solq_customer_events(application_id,kind)
   select ap.id,'deposit_confirmed' from public.applications ap where created_at>=cfg.capture_from and (
    status='deposit_confirmed' or exists(select 1 from public.production_jobs j where j.application_id=ap.id and j.production_approved_at is not null and j.production_approved_by is not null)
   )
    and not exists(select 1 from public.solq_customer_events ev where ev.application_id=ap.id and ev.kind='deposit_confirmed')
   order by created_at,id limit 500
   on conflict do nothing;
  for e in select ev.* from public.solq_customer_events ev join public.applications ap on ap.id=ev.application_id
   where ap.created_at>=cfg.capture_from and (
    (cfg.admin_email_enabled and not exists(select 1 from public.solq_notification_outbox ob where ob.event_id=ev.id and ob.audience='admin'))
    or (cfg.customer_email_enabled and ev.kind in ('application_received','deposit_confirmed') and not exists(select 1 from public.solq_notification_outbox ob where ob.event_id=ev.id and ob.audience='customer'))
   ) order by ev.created_at,ev.id limit 500 loop
   if cfg.admin_email_enabled then
    insert into public.solq_notification_outbox(event_id,audience) values(e.id,'admin') on conflict do nothing;
    get diagnostics inserted=row_count; total:=total+inserted;
   end if;
   if cfg.customer_email_enabled and e.kind in ('application_received','deposit_confirmed') then
    insert into public.solq_notification_outbox(event_id,audience) values(e.id,'customer') on conflict do nothing;
    get diagnostics inserted=row_count; total:=total+inserted;
   end if;
  end loop;
  return jsonb_build_object('enqueued',total);
 elsif p_action='claim' then
  -- Serialize quota reservation across workers; a claimed attempt consumes quota.
  select * into cfg from solq_notification_private.settings where singleton for update;
  if not cfg.delivery_enabled then return jsonb_build_object('disabled',true); end if;
  -- Expired in-flight sends may already have reached the provider. Never auto resend.
  with expired as (
   update public.solq_notification_outbox set status='uncertain',error_code='lease_expired',updated_at=now(),lease_token=null,lease_until=null
   where status='sending' and lease_until<=now() returning id,attempts
  ) insert into public.solq_notification_attempts(notification_id,attempt,outcome,error_code)
    select id,attempts,'uncertain','lease_expired' from expired;
  if (select count(*) from public.solq_notification_attempts where outcome='requested' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=cfg.daily_attempt_limit then
   return jsonb_build_object('disabled',true,'reason','daily_limit');
  end if;
  select ob.* into o from public.solq_notification_outbox ob
   where ob.status in ('requested','retry_wait') and ob.next_attempt_at<=now() and ob.attempts<3
    and ((ob.audience='admin' and cfg.admin_email_enabled) or (ob.audience='customer' and cfg.customer_email_enabled))
   order by ob.next_attempt_at,ob.created_at,ob.id for update skip locked limit 1;
  if not found then return null; end if;
  update public.solq_notification_outbox set status='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
   where id=o.id returning * into o;
  insert into public.solq_notification_attempts(notification_id,attempt,outcome) values(o.id,o.attempts,'requested');
  select * into e from public.solq_customer_events where id=o.event_id;
  select * into a from public.applications where id=e.application_id;
  return jsonb_build_object('id',o.id,'lease_token',o.lease_token,'audience',o.audience,'kind',e.kind,
    'receipt_number',a.receipt_number,'contact',case when o.audience='customer' then a.contact else null end);
 elsif p_action='finish' then
  select * into o from public.solq_notification_outbox where id=(p_data->>'id')::uuid for update;
  if not found or o.status<>'sending' or o.lease_token is distinct from (p_data->>'lease_token')::uuid or o.lease_until<=now() then
   raise exception 'stale lease' using errcode='40001';
  end if;
  if coalesce(p_data->>'outcome','') not in ('accepted','retry_wait','failed','uncertain','skipped') then raise exception 'invalid outcome'; end if;
  update public.solq_notification_outbox set
   status=case when p_data->>'outcome'='retry_wait' and attempts>=3 then 'failed' else p_data->>'outcome' end,
   error_code=p_data->>'error_code',provider_id=left(p_data->>'provider_id',200),
   next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,attempts-1)::integer+floor(random()*15)::integer)),
   lease_token=null,lease_until=null,updated_at=now() where id=o.id returning * into o;
  insert into public.solq_notification_attempts(notification_id,attempt,outcome,error_code) values(o.id,o.attempts,o.status,o.error_code);
  return jsonb_build_object('status',o.status);
 else raise exception 'unsupported command' using errcode='22023';
 end if;
end $$;
revoke all on function public.solq_notification_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.solq_notification_command(text,jsonb) to service_role;

-- Existing BEFORE approval guards remain authoritative; this only observes success.
create function solq_notification_private.capture_deposit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='deposit_confirmed' and old.status is distinct from new.status and exists(
  select 1 from solq_notification_private.settings where capture_from is not null and new.created_at>=capture_from
 ) then
  insert into public.solq_customer_events(application_id,kind) values(new.id,'deposit_confirmed') on conflict do nothing;
 end if;
 return new;
exception when others then
 -- Notification event failure must never cancel a guarded, actual deposit confirmation.
 return new;
end $$;
revoke all on function solq_notification_private.capture_deposit() from public,anon,authenticated;
create trigger solq_capture_verified_deposit after update of status on public.applications for each row execute function solq_notification_private.capture_deposit();
