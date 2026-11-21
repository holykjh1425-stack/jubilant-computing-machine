-- REVIEW_ONLY / NOT_APPLIED. DEV-02 synthetic PostgreSQL 17 + Auth/PostgREST target only.
-- A separately approved isolated target, role and file hash are required before execution.
begin;

do $boundary$
begin
  if current_database() <> 'solq_dev02_synthetic'
     or current_setting('solq.dev02_scope', true) is distinct from 'synthetic-only' then
    raise exception 'DEV-02 synthetic target and review marker required';
  end if;
  if exists (select 1 from pg_roles where rolname = current_user and rolsuper)
     or not exists (
       select 1 from pg_roles r
       where r.rolname = 'solq_dev02_rpc' and not (
         r.rolsuper or r.rolbypassrls or r.rolcanlogin or r.rolcreaterole or
         r.rolcreatedb or r.rolreplication or r.rolinherit
       ) and not exists (
         select 1 from pg_auth_members m where m.member = r.oid and m.set_option
       )
     ) then
    raise exception 'Scoped non-superuser migration and dedicated non-login RPC role required';
  end if;
  if not has_schema_privilege('solq_dev02_rpc', 'auth', 'USAGE')
     or not has_function_privilege('solq_dev02_rpc', 'auth.uid()', 'EXECUTE')
     or not has_function_privilege('solq_dev02_rpc', 'auth.jwt()', 'EXECUTE')
     or not pg_has_role(current_user, 'solq_dev02_rpc', 'SET') then
    raise exception 'Approved existing Auth helpers required';
  end if;
end;
$boundary$;

create schema solq_dev02_private;
create schema solq_dev02_api;
revoke all on schema solq_dev02_private, solq_dev02_api from public, anon, authenticated, service_role;
grant usage, create on schema solq_dev02_private, solq_dev02_api to solq_dev02_rpc;
grant usage on schema solq_dev02_api to authenticated;

-- A trusted fixture harness registers an authenticated subject and session after Auth verification.
create table solq_dev02_private.session_lease (
  session_id uuid primary key,
  subject_id uuid not null references auth.users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table solq_dev02_private.staff (
  subject_id uuid primary key references auth.users(id)
);
create table solq_dev02_private.notice (
  kind text primary key check (kind in ('privacy', 'transfer')),
  version text not null check (version ~ '^fixture-[a-z0-9-]+$'),
  digest text not null check (digest ~ '^[a-f0-9]{64}$')
);
create table solq_dev02_private.application (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  request_id uuid not null,
  receipt_number text not null check (receipt_number ~ '^NX-[0-9]{8}-[A-F0-9]{8}$'),
  original jsonb not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null,
  constraint dev02_receipt_uq unique (receipt_number),
  constraint dev02_owner_request_uq unique (owner_id, request_id)
);
create table solq_dev02_private.consent (
  application_id uuid not null references solq_dev02_private.application(id),
  kind text not null check (kind in ('privacy', 'transfer')),
  accepted boolean not null check (accepted),
  version text not null,
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null,
  primary key (application_id, kind)
);
create table solq_dev02_private.workflow (
  application_id uuid primary key references solq_dev02_private.application(id),
  quote_version integer not null default 0 check (quote_version >= 0),
  accepted_version integer,
  deposit_version integer,
  approval_version integer,
  cancelled boolean not null default false,
  check (accepted_version is null or (quote_version > 0 and accepted_version = quote_version)),
  check (deposit_version is null or (accepted_version is not null and deposit_version = accepted_version)),
  check (approval_version is null or (deposit_version is not null and approval_version = deposit_version))
);

revoke all on all tables in schema solq_dev02_private from public, anon, authenticated, service_role;
grant select on all tables in schema solq_dev02_private to solq_dev02_rpc;
grant insert on solq_dev02_private.application, solq_dev02_private.consent, solq_dev02_private.workflow to solq_dev02_rpc;
grant update on solq_dev02_private.workflow to solq_dev02_rpc;

create function solq_dev02_private.actor() returns uuid
language sql stable security invoker set search_path = pg_catalog, pg_temp as $fn$
  select l.subject_id
  from solq_dev02_private.session_lease l
  where l.session_id::text = auth.jwt()->>'session_id'
    and l.subject_id = auth.uid()
    and l.revoked_at is null and l.expires_at > statement_timestamp()
$fn$;

create function solq_dev02_private.is_staff() returns boolean
language sql stable security invoker set search_path = pg_catalog, pg_temp as $fn$
  select exists (
    select 1 from solq_dev02_private.staff s where s.subject_id = solq_dev02_private.actor()
  )
$fn$;

alter table solq_dev02_private.application enable row level security;
alter table solq_dev02_private.application force row level security;
alter table solq_dev02_private.consent enable row level security;
alter table solq_dev02_private.consent force row level security;
alter table solq_dev02_private.workflow enable row level security;
alter table solq_dev02_private.workflow force row level security;

create policy app_case_read on solq_dev02_private.application for select to solq_dev02_rpc
  using (owner_id = solq_dev02_private.actor() or solq_dev02_private.is_staff());
create policy app_new_case on solq_dev02_private.application for insert to solq_dev02_rpc
  with check (owner_id = solq_dev02_private.actor() and not solq_dev02_private.is_staff());
create policy consent_case_read on solq_dev02_private.consent for select to solq_dev02_rpc
  using (exists (select 1 from solq_dev02_private.application a where a.id = consent.application_id));
create policy consent_owner_write on solq_dev02_private.consent for insert to solq_dev02_rpc
  with check (exists (select 1 from solq_dev02_private.application a
      where a.id = consent.application_id and a.owner_id = solq_dev02_private.actor()));
create policy workflow_case_read on solq_dev02_private.workflow for select to solq_dev02_rpc
  using (exists (select 1 from solq_dev02_private.application a where a.id = workflow.application_id));
create policy workflow_owner_insert on solq_dev02_private.workflow for insert to solq_dev02_rpc
  with check (exists (select 1 from solq_dev02_private.application a
      where a.id = workflow.application_id and a.owner_id = solq_dev02_private.actor()));
create policy workflow_case_update on solq_dev02_private.workflow for update to solq_dev02_rpc
  using (exists (select 1 from solq_dev02_private.application a where a.id = workflow.application_id))
  with check (exists (select 1 from solq_dev02_private.application a where a.id = workflow.application_id));

create function solq_dev02_api.submit_case(p_request uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
declare
  caller uuid := solq_dev02_private.actor();
  original_doc jsonb;
  consent_doc jsonb := '{}'::jsonb;
  stored_doc jsonb;
  fp text;
  k text;
  n solq_dev02_private.notice%rowtype;
  a solq_dev02_private.application%rowtype;
  new_id uuid;
  receipt text;
  saved_at timestamptz := statement_timestamp();
  tries integer;
  replayed boolean := true;
begin
  if caller is null or solq_dev02_private.is_staff() then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'RETRY_WITH_APPROVED_TRANSACTION_MODE' using errcode = '25000';
  end if;
  if p_request is null or jsonb_typeof(p_input) is distinct from 'object'
     or coalesce(p_input->>'service', '') not in ('website','ai_automation','custom_system','consulting')
     or jsonb_typeof(p_input->'description') is distinct from 'string'
     or length(btrim(p_input->>'description', E' \t\r\n')) not between 1 and 2200 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  foreach k in array array['privacy','transfer'] loop
    if p_input->'consents'->k->'accepted' is distinct from 'true'::jsonb then
      raise exception 'CONSENT_REQUIRED' using errcode = '22023';
    end if;
    select * into n from solq_dev02_private.notice where kind = k;
    if not found or p_input->'consents'->k->>'version' is distinct from n.version
       or p_input->'consents'->k->>'documentSha256' is distinct from n.digest then
      raise exception 'NOTICE_MISMATCH' using errcode = '22023';
    end if;
    consent_doc := consent_doc || jsonb_build_object(k, jsonb_build_object(
      'accepted', true, 'version', n.version, 'documentSha256', n.digest));
  end loop;
  original_doc := jsonb_build_object('service', p_input->>'service',
    'description', btrim(p_input->>'description', E' \t\r\n'), 'consents', consent_doc);
  fp := encode(sha256(convert_to(original_doc::text, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(caller::text || '/' || p_request::text, 0));
  select * into a from solq_dev02_private.application where owner_id = caller and request_id = p_request;
  if found then
    if a.original is distinct from original_doc then
      raise exception 'REQUEST_CONFLICT' using errcode = 'PT409';
    end if;
  else
    replayed := false;
    for tries in 1..4 loop
      new_id := gen_random_uuid();
      receipt := 'NX-' || to_char(saved_at at time zone 'UTC', 'YYYYMMDD') || '-'
                 || upper(substr(new_id::text, 1, 8));
      insert into solq_dev02_private.application
        (id, owner_id, request_id, receipt_number, original, fingerprint, received_at)
      values (new_id, caller, p_request, receipt, original_doc, fp, saved_at)
      on conflict on constraint dev02_receipt_uq do nothing returning * into a;
      exit when found;
    end loop;
    if a.id is null then raise exception 'COLLISION_EXHAUSTED' using errcode = 'PT503'; end if;
    foreach k in array array['privacy','transfer'] loop
      insert into solq_dev02_private.consent (application_id, kind, accepted, version, digest, recorded_at)
      values (a.id, k, true, consent_doc->k->>'version', consent_doc->k->>'documentSha256', saved_at);
    end loop;
    insert into solq_dev02_private.workflow (application_id) values (a.id);
  end if;

  select * into a from solq_dev02_private.application where owner_id = caller and request_id = p_request;
  select jsonb_object_agg(kind, jsonb_build_object('accepted', accepted, 'version', version, 'documentSha256', digest))
    into stored_doc from solq_dev02_private.consent
    where application_id = a.id and recorded_at = a.received_at;
  if a.id is null or a.original is distinct from original_doc or a.fingerprint is distinct from fp
     or stored_doc is distinct from consent_doc
     or not exists (select 1 from solq_dev02_private.workflow where application_id = a.id) then
    raise exception 'SAVE_UNCERTAIN' using errcode = 'PT503';
  end if;
  return jsonb_build_object('saved', true, 'requestId', p_request, 'applicationId', a.id,
    'receiptNumber', a.receipt_number, 'serverFingerprint', fp, 'replayed', replayed);
end;
$fn$;

create function solq_dev02_api.case_view(p_receipt text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
declare
  a solq_dev02_private.application%rowtype;
  workflow_view jsonb;
begin
  if solq_dev02_private.actor() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into a from solq_dev02_private.application where receipt_number = p_receipt;
  if not found then raise exception 'NOT_FOUND' using errcode = 'PT404'; end if;
  select to_jsonb(w) - 'application_id' into strict workflow_view
    from solq_dev02_private.workflow w where application_id = a.id;
  return jsonb_build_object('applicationId', a.id, 'receiptNumber', a.receipt_number,
    'original', a.original, 'receivedAtUtc', a.received_at, 'workflow', workflow_view);
end;
$fn$;

create function solq_dev02_api.case_action(p_receipt text, p_action text, p_version integer, p_amount integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
declare
  caller uuid := solq_dev02_private.actor();
  staff_actor boolean := solq_dev02_private.is_staff();
  a solq_dev02_private.application%rowtype;
  w solq_dev02_private.workflow%rowtype;
  reason text;
begin
  if caller is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_action in ('quote', 'deposit', 'approve', 'check_execution') and not staff_actor then
    raise exception 'DENIED' using errcode = '42501';
  end if;
  select * into a from solq_dev02_private.application where receipt_number = p_receipt;
  if not found then raise exception 'NOT_FOUND' using errcode = 'PT404'; end if;
  select * into strict w from solq_dev02_private.workflow where application_id = a.id for update;
  if p_action = 'check_execution' then
    reason := case when w.cancelled then 'CANCELLED'
      when w.accepted_version is null then 'QUOTE_REQUIRED'
      when w.deposit_version is null then 'DEPOSIT_REQUIRED'
      when w.approval_version is null then 'APPROVAL_REQUIRED' else 'RELEASE_DISABLED' end;
    return jsonb_build_object('allowed', false, 'reason', reason);
  end if;
  if w.cancelled then raise exception 'CANCELLED' using errcode = 'PT409'; end if;
  case p_action
    when 'cancel' then
      update solq_dev02_private.workflow set cancelled = true where application_id = a.id;
    when 'quote' then
      if w.deposit_version is not null then raise exception 'INVALID_STATE' using errcode = 'PT409'; end if;
      update solq_dev02_private.workflow set quote_version = quote_version + 1, accepted_version = null
        where application_id = a.id;
    when 'accept' then
      if caller <> a.owner_id or staff_actor then raise exception 'DENIED' using errcode = '42501'; end if;
      if w.quote_version = 0 or p_version is distinct from w.quote_version then
        raise exception 'STALE_QUOTE' using errcode = 'PT409';
      end if;
      update solq_dev02_private.workflow set accepted_version = p_version where application_id = a.id;
    when 'deposit' then
      if w.accepted_version is null or p_version is distinct from w.accepted_version then
        raise exception 'QUOTE_REQUIRED' using errcode = 'PT409';
      end if;
      if p_amount is distinct from 30000 then raise exception 'INVALID_DEPOSIT' using errcode = '22023'; end if;
      update solq_dev02_private.workflow set deposit_version = p_version where application_id = a.id;
    when 'approve' then
      if w.deposit_version is null or p_version is distinct from w.deposit_version then
        raise exception 'DEPOSIT_REQUIRED' using errcode = 'PT409';
      end if;
      update solq_dev02_private.workflow set approval_version = p_version where application_id = a.id;
    else
      raise exception 'INVALID_ACTION' using errcode = '22023';
  end case;
  return solq_dev02_api.case_view(p_receipt);
end;
$fn$;

create function solq_dev02_api.can_read_fixture_object(p_owner text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $fn$
  select coalesce(solq_dev02_private.actor()::text = p_owner or solq_dev02_private.is_staff(), false)
$fn$;

alter function solq_dev02_private.actor() owner to solq_dev02_rpc;
alter function solq_dev02_private.is_staff() owner to solq_dev02_rpc;
alter function solq_dev02_api.submit_case(uuid,jsonb) owner to solq_dev02_rpc;
alter function solq_dev02_api.case_view(text) owner to solq_dev02_rpc;
alter function solq_dev02_api.case_action(text,text,integer,integer) owner to solq_dev02_rpc;
alter function solq_dev02_api.can_read_fixture_object(text) owner to solq_dev02_rpc;
revoke create on schema solq_dev02_api, solq_dev02_private from solq_dev02_rpc;
set local role solq_dev02_rpc;
revoke all on all functions in schema solq_dev02_api, solq_dev02_private from public, anon, authenticated, service_role;
grant execute on function solq_dev02_api.submit_case(uuid,jsonb), solq_dev02_api.case_view(text),
  solq_dev02_api.case_action(text,text,integer,integer), solq_dev02_api.can_read_fixture_object(text) to authenticated;
reset role;

insert into storage.buckets (id, name, public) values ('solq-dev02-fixture', 'solq-dev02-fixture', false);
create policy dev02_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'solq-dev02-fixture' and solq_dev02_api.can_read_fixture_object((storage.foldername(name))[1]));
create policy dev02_storage_read_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id is distinct from 'solq-dev02-fixture'
    or solq_dev02_api.can_read_fixture_object((storage.foldername(name))[1]));
create policy dev02_storage_anon on storage.objects as restrictive for select to anon
  using (bucket_id is distinct from 'solq-dev02-fixture');
create policy dev02_storage_no_insert on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id is distinct from 'solq-dev02-fixture');
create policy dev02_storage_no_update on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id is distinct from 'solq-dev02-fixture') with check (bucket_id is distinct from 'solq-dev02-fixture');
create policy dev02_storage_no_delete on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id is distinct from 'solq-dev02-fixture');

-- Do not expose the API schema or enable a real connector from this review file.
rollback;
