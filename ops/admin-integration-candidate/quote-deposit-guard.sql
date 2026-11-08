-- Candidate only; NOT applied. Requires quote-evidence.sql first.
-- New append-only ledgers. No backfill or changes to existing customer rows/RLS.
create table public.solq_issued_quotes(
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id),
 version integer not null check(version>0), quote_reference text not null check(length(btrim(quote_reference)) between 1 and 200),
 amount_krw bigint not null check(amount_krw>=30000), issued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null check(isfinite(expires_at) and expires_at>issued_at),
 issued_by uuid not null references public.admin_users(user_id), unique(application_id,version)
);
create table public.solq_deposit_evidence(
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id),
 quote_id uuid not null references public.solq_issued_quotes(id), amount_krw bigint not null check(amount_krw=30000),
 paid_at timestamptz not null check(isfinite(paid_at) and paid_at<=now()),
 transaction_reference text not null unique check(length(btrim(transaction_reference)) between 1 and 200),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 1000),
 recorded_by uuid not null references public.admin_users(user_id), recorded_at timestamptz not null default clock_timestamp()
);
create table public.solq_deposit_confirmations(
 id uuid primary key default gen_random_uuid(), deposit_id uuid not null unique references public.solq_deposit_evidence(id),
 confirmed_by uuid not null references public.admin_users(user_id), confirmed_at timestamptz not null default clock_timestamp()
);
-- Evidence upload/record and human bank reconciliation are separate commands/records.
do $$declare t text;begin
 foreach t in array array['solq_issued_quotes','solq_deposit_evidence','solq_deposit_confirmations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy admin_read on public.%I for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())))',t);
 execute format('create trigger immutable_ledger before update or delete on public.%I for each row execute function nexus_production_private.immutable_quote()',t);
 end loop;end$$;
create function nexus_production_private.quote_ledger(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); app uuid:=(p_data->>'application_id')::uuid; q public.solq_issued_quotes; d public.solq_deposit_evidence; r jsonb;
begin
 if actor is null or coalesce(auth.jwt()->>'role','')<>'authenticated' or not exists(select 1 from public.admin_users where user_id=actor) then raise exception 'admin required' using errcode='42501';end if;
 if p_data ?| array['issued_by','recorded_by','confirmed_by','recorded_at','confirmed_at','issued_at'] then raise exception 'server identity fields forbidden';end if;
 perform 1 from public.applications where id=app for update;if not found then raise exception 'application not found';end if;
 if exists(select 1 from public.production_jobs where application_id=app and (production_approved_at is not null or attempt_count<>0 or status<>'awaiting_deposit')) then raise exception 'production locked';end if;
 select * into q from public.solq_issued_quotes where application_id=app order by version desc limit 1;
 if p_action='issue_quote' then
 insert into public.solq_issued_quotes(application_id,version,quote_reference,amount_krw,expires_at,issued_by)
 values(app,coalesce(q.version,0)+1,p_data->>'quote_reference',(p_data->>'amount_krw')::bigint,(p_data->>'expires_at')::timestamptz,actor) returning to_jsonb(solq_issued_quotes.*) into r;
 return r;
 end if;
 if q.id is null or q.id is distinct from (p_data->>'quote_id')::uuid or q.expires_at<=clock_timestamp() then raise exception 'latest valid quote required';end if;
 if p_action='record_deposit' then
 insert into public.solq_deposit_evidence(application_id,quote_id,amount_krw,paid_at,transaction_reference,evidence_reference,recorded_by)
 values(app,q.id,(p_data->>'amount_krw')::bigint,(p_data->>'paid_at')::timestamptz,p_data->>'transaction_reference',p_data->>'evidence_reference',actor) returning to_jsonb(solq_deposit_evidence.*) into r;
 elsif p_action='confirm_deposit' then
 if p_data->>'bank_verified' is distinct from 'true' then raise exception 'manual bank review required';end if;
 select * into strict d from public.solq_deposit_evidence where id=(p_data->>'deposit_id')::uuid and application_id=app and quote_id=q.id;
 insert into public.solq_deposit_confirmations(deposit_id,confirmed_by) values(d.id,actor) returning to_jsonb(solq_deposit_confirmations.*) into r;
 else raise exception 'unsupported command';end if;
 return r;
end$$;
revoke all on function nexus_production_private.quote_ledger(text,jsonb) from public,anon,service_role;
grant execute on function nexus_production_private.quote_ledger(text,jsonb) to authenticated;
create function public.solq_quote_ledger(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select nexus_production_private.quote_ledger(p_action,p_data)$$;
revoke all on function public.solq_quote_ledger(text,jsonb) from public,anon,service_role;
grant execute on function public.solq_quote_ledger(text,jsonb) to authenticated;
-- All acceptance writes, including RPCs, must match the authoritative issued quote.
create function nexus_production_private.validate_latest_acceptance() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.solq_issued_quotes;begin
 perform 1 from public.applications where id=new.application_id for update;
 select * into q from public.solq_issued_quotes where application_id=new.application_id order by version desc limit 1;
 if q.id is null or q.quote_reference is distinct from new.quote_reference or q.version::text is distinct from new.quote_version or q.amount_krw is distinct from new.amount_krw
 or not isfinite(new.accepted_at) or new.accepted_at<q.issued_at or new.accepted_at>clock_timestamp() or q.expires_at<=clock_timestamp() or new.accepted_at>=q.expires_at then raise exception 'latest valid quote and matching acceptance required' using errcode='42501';end if;
 return new;
end$$;
revoke all on function nexus_production_private.validate_latest_acceptance() from public,anon,authenticated,service_role;
create trigger solq_latest_acceptance before insert on public.solq_quote_acceptances for each row execute function nexus_production_private.validate_latest_acceptance();
-- Fail closed at separate approval/queue and again at running/claim.
create function nexus_production_private.guard_quote_deposit() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.solq_issued_quotes;begin
 if tg_op='UPDATE' and old.production_approved_at is not null and new.quote_acceptance_id is distinct from old.quote_acceptance_id then raise exception 'approved evidence locked';end if;
 if new.status in ('queued','running') or (new.production_approved_at is not null and (tg_op='INSERT' or old.production_approved_at is distinct from new.production_approved_at)) then
 perform 1 from public.applications where id=new.application_id for update;
 select * into q from public.solq_issued_quotes where application_id=new.application_id order by version desc limit 1;
 if q.id is null or q.expires_at<=clock_timestamp() or not exists(select 1 from public.solq_quote_acceptances a where a.id=new.quote_acceptance_id and a.application_id=q.application_id and a.quote_reference=q.quote_reference and a.quote_version=q.version::text and a.amount_krw=q.amount_krw and a.accepted_at>=q.issued_at and a.accepted_at<q.expires_at) then raise exception 'latest valid accepted quote required' using errcode='42501';end if;
 if not exists(select 1 from public.solq_deposit_evidence d join public.solq_deposit_confirmations c on c.deposit_id=d.id join public.admin_users u on u.user_id=c.confirmed_by where d.application_id=new.application_id and d.quote_id=q.id and d.amount_krw=30000 and c.confirmed_at<=new.production_approved_at) then raise exception 'separate manual deposit confirmation required' using errcode='42501';end if;
 end if;return new;
end$$;
revoke all on function nexus_production_private.guard_quote_deposit() from public,anon,authenticated,service_role;
create trigger solq_quote_deposit_guard before insert or update on public.production_jobs for each row execute function nexus_production_private.guard_quote_deposit();

-- Preserve old acceptance evidence while allowing a newly issued version to be accepted.
create or replace function nexus_production_private.record_quote(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); app uuid; q public.solq_quote_acceptances; j public.production_jobs;
begin
 if actor is null or coalesce(auth.jwt()->>'role','')<>'authenticated'
 or not exists(select 1 from public.admin_users where user_id=actor) then
 raise exception 'admin required' using errcode='42501'; end if;
 if p_data->>'evidence_verified' is distinct from 'true' or p_data->>'accepted' is distinct from 'true'
 or p_data ? 'verified_by' or p_data ? 'recorded_at' then raise exception 'verified evidence required';end if;
 app:=(p_data->>'application_id')::uuid;
 perform 1 from public.applications where id=app for update;
 if not found then raise exception 'application not found';end if;
 select * into strict j from public.production_jobs where application_id=app for update;
 if j.status<>'awaiting_deposit' or j.production_approved_at is not null or j.attempt_count<>0
 or exists(select 1 from public.solq_quote_acceptances where application_id=app and quote_reference=p_data->>'quote_reference' and quote_version=p_data->>'quote_version') then raise exception 'quotation already locked';end if;
 if (p_data->>'accepted_at')::timestamptz is null then raise exception 'acceptance time required';end if;
 insert into public.solq_quote_acceptances(application_id,quote_reference,quote_version,amount_krw,accepted_at,evidence_reference,verified_by)
 values(app,p_data->>'quote_reference',p_data->>'quote_version',(p_data->>'amount_krw')::bigint,
 (p_data->>'accepted_at')::timestamptz,p_data->>'evidence_reference',actor) returning * into q;
 update public.production_jobs set quote_acceptance_id=q.id where id=j.id;
 return to_jsonb(q)||jsonb_build_object('accepted',true,'verification_method','admin_reviewed_external_evidence');
end$$;
