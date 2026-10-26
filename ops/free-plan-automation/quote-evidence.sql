-- Prepared only: not applied to production. Existing admin RLS stays unchanged.
create function nexus_production_private.immutable_quote() returns trigger
language plpgsql set search_path='' as $$begin
 raise exception 'quotation evidence is append-only' using errcode='42501';
end$$;
revoke all on function nexus_production_private.immutable_quote() from public,anon,authenticated,service_role;
create trigger solq_quote_immutable before update or delete on public.solq_quote_acceptances
for each row execute function nexus_production_private.immutable_quote();

create function nexus_production_private.record_quote(p_data jsonb) returns jsonb
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
 or j.quote_acceptance_id is not null then raise exception 'quotation already locked';end if;
 if (p_data->>'accepted_at')::timestamptz is null then raise exception 'acceptance time required';end if;
 insert into public.solq_quote_acceptances(application_id,quote_reference,quote_version,amount_krw,accepted_at,evidence_reference,verified_by)
 values(app,p_data->>'quote_reference',p_data->>'quote_version',(p_data->>'amount_krw')::bigint,
 (p_data->>'accepted_at')::timestamptz,p_data->>'evidence_reference',actor) returning * into q;
 update public.production_jobs set quote_acceptance_id=q.id where id=j.id;
 return to_jsonb(q)||jsonb_build_object('accepted',true,'verification_method','admin_reviewed_external_evidence');
end$$;
revoke all on function nexus_production_private.record_quote(jsonb) from public,anon,authenticated,service_role;
-- Invoker entry point delegates to a narrow, identity-checking private function.
grant usage on schema nexus_production_private to authenticated;
grant execute on function nexus_production_private.record_quote(jsonb) to authenticated;
create function public.solq_record_quote_evidence(p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select nexus_production_private.record_quote(p_data)$$;
revoke all on function public.solq_record_quote_evidence(jsonb) from public,anon,service_role;
grant execute on function public.solq_record_quote_evidence(jsonb) to authenticated;
