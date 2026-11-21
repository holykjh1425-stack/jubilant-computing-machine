-- REVIEW_ONLY / NOT_APPLIED. Candidate teardown for an empty, quiesced synthetic target.
-- Preserve approved fixture evidence before teardown. This file does not purge fixture rows.
begin;

do $boundary$
begin
  if current_database() <> 'solq_dev02_synthetic'
     or current_setting('solq.dev02_scope', true) is distinct from 'synthetic-only'
     or not pg_has_role(current_user, 'solq_dev02_rpc', 'SET')
     or exists (select 1 from pg_roles where rolname = current_user and rolsuper) then
    raise exception 'DEV-02 rollback target or role does not match';
  end if;
end;
$boundary$;

lock table solq_dev02_private.application, solq_dev02_private.consent, solq_dev02_private.workflow,
  solq_dev02_private.session_lease, solq_dev02_private.staff, solq_dev02_private.notice in access exclusive mode;

-- Table ownership and scoped locks are required to make the empty check independent of FORCE RLS.
alter table solq_dev02_private.application no force row level security;
alter table solq_dev02_private.consent no force row level security;
alter table solq_dev02_private.workflow no force row level security;
set local row_security = off;

do $empty$
begin
  if exists (select 1 from solq_dev02_private.application)
     or exists (select 1 from solq_dev02_private.consent)
     or exists (select 1 from solq_dev02_private.workflow)
     or exists (select 1 from solq_dev02_private.session_lease)
     or exists (select 1 from solq_dev02_private.staff)
     or exists (select 1 from solq_dev02_private.notice)
     or exists (select 1 from storage.objects where bucket_id = 'solq-dev02-fixture')
     or not exists (select 1 from storage.buckets where id = 'solq-dev02-fixture' and not public) then
    raise exception 'Quiesce the target and preserve fixture evidence before approved teardown';
  end if;
end;
$empty$;

drop policy dev02_storage_no_delete on storage.objects;
drop policy dev02_storage_no_update on storage.objects;
drop policy dev02_storage_no_insert on storage.objects;
drop policy dev02_storage_anon on storage.objects;
drop policy dev02_storage_read_guard on storage.objects;
drop policy dev02_storage_read on storage.objects;
delete from storage.buckets where id = 'solq-dev02-fixture' and not public;

drop table solq_dev02_private.workflow;
drop table solq_dev02_private.consent;
drop table solq_dev02_private.application;

set local role solq_dev02_rpc;
drop function solq_dev02_api.can_read_fixture_object(text);
drop function solq_dev02_api.case_action(text,text,integer,integer);
drop function solq_dev02_api.case_view(text);
drop function solq_dev02_api.submit_case(uuid,jsonb);
drop function solq_dev02_private.is_staff();
drop function solq_dev02_private.actor();
reset role;

drop table solq_dev02_private.notice;
drop table solq_dev02_private.staff;
drop table solq_dev02_private.session_lease;
drop schema solq_dev02_api restrict;
drop schema solq_dev02_private restrict;
-- Keep the separately provisioned non-login role and all DEV-01 objects.
rollback;
