-- REVIEW_ONLY / NOT_APPLIED. Designed for a separately approved synthetic Supabase target.
-- Stop before DDL if the candidate schema, bucket or policy names already exist.
begin;

create schema solq_portal_candidate;
revoke all on schema solq_portal_candidate from public, anon, authenticated;
grant usage on schema solq_portal_candidate to authenticated, service_role;

create table solq_portal_candidate.staff (
  user_id uuid primary key references auth.users(id)
);

create table solq_portal_candidate.application (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  request_id uuid not null,
  receipt_number text not null unique check (receipt_number ~ '^NX-[0-9]{8}-[A-F0-9]{8}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  service_type text not null check (service_type in ('website', 'ai_automation', 'custom_system', 'consulting')),
  original_description text not null check (length(original_description) between 1 and 2200),
  received_at timestamptz not null default now(),
  unique (owner_id, request_id)
);

create table solq_portal_candidate.consent (
  application_id uuid not null references solq_portal_candidate.application(id),
  kind text not null check (kind in ('privacy', 'transfer')),
  accepted boolean not null check (accepted),
  notice_version text not null,
  notice_sha256 text not null check (notice_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default now(),
  primary key (application_id, kind)
);

create table solq_portal_candidate.workflow (
  application_id uuid primary key references solq_portal_candidate.application(id),
  draft_plan jsonb,
  quote_version integer check (quote_version > 0),
  accepted_quote_version integer,
  confirmed_quote_version integer,
  approved_quote_version integer,
  cancelled_at timestamptz,
  check (accepted_quote_version is null or
    (quote_version is not null and accepted_quote_version = quote_version)),
  check (confirmed_quote_version is null or
    (accepted_quote_version is not null and confirmed_quote_version = accepted_quote_version)),
  check (approved_quote_version is null or
    (confirmed_quote_version is not null and approved_quote_version = confirmed_quote_version))
);

alter table solq_portal_candidate.staff enable row level security;
alter table solq_portal_candidate.application enable row level security;
alter table solq_portal_candidate.consent enable row level security;
alter table solq_portal_candidate.workflow enable row level security;

create policy staff_self_read on solq_portal_candidate.staff for select to authenticated
  using (user_id = (select auth.uid()));

create policy application_owner_or_staff_read on solq_portal_candidate.application for select to authenticated
  using (owner_id = (select auth.uid()) or exists (
    select 1 from solq_portal_candidate.staff where user_id = (select auth.uid())
  ));

-- The application subqueries intentionally use invoker privileges and application RLS.
create policy consent_visible_application_read on solq_portal_candidate.consent for select to authenticated
  using (exists (select 1 from solq_portal_candidate.application a where a.id = application_id));
create policy workflow_visible_application_read on solq_portal_candidate.workflow for select to authenticated
  using (exists (select 1 from solq_portal_candidate.application a where a.id = application_id));

revoke all on all tables in schema solq_portal_candidate from public, anon, authenticated, service_role;
grant select on all tables in schema solq_portal_candidate to authenticated, service_role;
grant insert on solq_portal_candidate.application, solq_portal_candidate.consent to service_role;
grant insert, update on solq_portal_candidate.workflow to service_role;
-- No runtime membership write grant. Provision fixture staff via separate controlled setup.
-- A server transaction must write one application and both accepted consent rows or roll back.
-- Never expose service_role credentials. This schema is not automatically added to the Data API.

insert into storage.buckets (id, name, public) values ('solq-portal-dev01-fixture', 'solq-portal-dev01-fixture', false);

-- A permissive grant is bounded by restrictive policies, including if other broad policies exist.
create policy solq_dev01_object_reader on storage.objects for select to authenticated
  using (bucket_id = 'solq-portal-dev01-fixture');
create policy solq_dev01_object_owner_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id is distinct from 'solq-portal-dev01-fixture' or
    (storage.foldername(name))[1] = (select auth.uid())::text or exists (
      select 1 from solq_portal_candidate.staff where user_id = (select auth.uid())
    ));
create policy solq_dev01_anon_no_read on storage.objects as restrictive for select to anon
  using (bucket_id is distinct from 'solq-portal-dev01-fixture');
create policy solq_dev01_no_client_upload on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id is distinct from 'solq-portal-dev01-fixture');
create policy solq_dev01_no_client_update on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id is distinct from 'solq-portal-dev01-fixture')
  with check (bucket_id is distinct from 'solq-portal-dev01-fixture');
create policy solq_dev01_no_client_delete on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id is distinct from 'solq-portal-dev01-fixture');

-- Deliberately leave the review transaction uncommitted.
rollback;
