-- CANDIDATE ONLY. Never apply to operating Supabase without separate approval.
-- New private objects only. Live execution is disabled; no Vault access/provider HTTP.
begin;
create schema solq_cost_private;
revoke all on schema solq_cost_private from public,anon,authenticated;
create table solq_cost_private.policy(
 id boolean primary key default true check(id),healthy boolean not null default true,
 monthly_nano bigint not null default 5000000000 check(monthly_nano between 0 and 5000000000),
 daily_nano bigint not null default 500000000 check(daily_nano between 0 and 500000000),
 job_nano bigint not null default 20000000 check(job_nano between 0 and 20000000),
 live_enabled boolean not null default false check(live_enabled=false),
 price_version text not null default '2026-10-28',
 price_expires timestamptz not null default '2026-11-04T00:00:00Z');
insert into solq_cost_private.policy(id) values(true);
create table solq_cost_private.approvals(
 job_hash text primary key check(job_hash ~ '^[0-9a-f]{64}$'),
 admin_id uuid not null,model text not null check(model in ('claude-haiku-5-5','claude-sonnet-5-5')),
 input_cap integer not null check(input_cap between 1 and 8192),output_cap integer not null check(output_cap between 1 and 2048),
 max_calls integer not null check(max_calls between 1 and 2),max_nano bigint not null check(max_nano between 0 and 20000000),
 expires timestamptz not null,created_at timestamptz not null default now());
create table solq_cost_private.reservations(
 job_hash text not null references solq_cost_private.approvals(job_hash), attempt integer not null check(attempt between 1 and 2),
 reservation_day date not null,reservation_month date not null,
 reserved_nano bigint not null check(reserved_nano>=0),charged_nano bigint not null check(charged_nano>=0),
 state text not null check(state in ('reserved','settled','failed_known','quality_failed','unknown')),
 lease uuid not null default gen_random_uuid(),primary key(job_hash,attempt));
alter table solq_cost_private.policy enable row level security;
alter table solq_cost_private.approvals enable row level security;
alter table solq_cost_private.reservations enable row level security;
revoke all on all tables in schema solq_cost_private from public,anon,authenticated,service_role;

create function solq_cost_private.approve(p_hash text,p_model text,p_input integer,p_output integer,p_calls integer,p_max bigint,p_expires timestamptz,p_upgrade boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_admin uuid:=auth.uid();v_policy solq_cost_private.policy%rowtype;
begin
 if v_admin is null or not exists(select 1 from public.admin_users where user_id=v_admin) then raise exception 'admin_required';end if;
 select * into strict v_policy from solq_cost_private.policy where id=true for update;
 if p_expires is null or p_expires<=clock_timestamp() or p_max is null or p_max>v_policy.job_nano then raise exception 'scope_invalid';end if;
 if p_model='claude-sonnet-5-5' and p_upgrade is distinct from true then raise exception 'upgrade_required';end if;
 insert into solq_cost_private.approvals(job_hash,admin_id,model,input_cap,output_cap,max_calls,max_nano,expires)
 values(p_hash,v_admin,p_model,p_input,p_output,p_calls,p_max,p_expires);
 -- Insert-only: a new scope needs a new hash, never mutate an existing approval.
end $$;
create function solq_cost_private.reserve(p_hash text,p_attempt integer,p_model text,p_input integer,p_output integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p solq_cost_private.policy%rowtype;a solq_cost_private.approvals%rowtype;
 d date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;m date;v_cost bigint;job_total bigint;day_total bigint;month_total bigint;v_lease uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_required';end if;
 select * into strict p from solq_cost_private.policy where id=true for update;
 if not p.healthy then raise exception 'accounting_unhealthy';end if;
 if p.price_expires<=clock_timestamp() then raise exception 'pricing_expired';end if;
 select * into a from solq_cost_private.approvals where job_hash=p_hash;
 if not found or a.expires<=clock_timestamp() or a.model is distinct from p_model or a.input_cap is distinct from p_input or a.output_cap is distinct from p_output then raise exception 'approval_scope';end if;
 if p_attempt is null or p_attempt<1 or p_attempt>a.max_calls then raise exception 'attempt_limit';end if;
 if exists(select 1 from solq_cost_private.reservations where job_hash=p_hash and attempt=p_attempt) then raise exception 'duplicate_attempt';end if;
 if p_attempt<>(select count(*)+1 from solq_cost_private.reservations where job_hash=p_hash)
 or exists(select 1 from solq_cost_private.reservations where job_hash=p_hash and state<>'failed_known') then raise exception 'retry_forbidden';end if;
 v_cost:=case p_model when 'claude-haiku-5-5' then p_input::bigint*100+p_output::bigint*500 when 'claude-sonnet-5-5' then p_input::bigint*2000+p_output::bigint*10000 else null end;
 if v_cost is null then raise exception 'model_unknown';end if;
 m:=date_trunc('month',d)::date;
 select coalesce(sum(charged_nano),0) into job_total from solq_cost_private.reservations where job_hash=p_hash;
 select coalesce(sum(charged_nano),0) into day_total from solq_cost_private.reservations where reservation_day=d or state in ('reserved','unknown');
 select coalesce(sum(charged_nano),0) into month_total from solq_cost_private.reservations where reservation_month=m or state in ('reserved','unknown');
 if job_total+v_cost>least(a.max_nano,p.job_nano) then raise exception 'job_budget';end if;
 if day_total+v_cost>p.daily_nano then raise exception 'daily_budget';end if;
 if month_total+v_cost>p.monthly_nano then raise exception 'monthly_budget';end if;
 insert into solq_cost_private.reservations(job_hash,attempt,reservation_day,reservation_month,reserved_nano,charged_nano,state)
 values(p_hash,p_attempt,d,m,v_cost,v_cost,'reserved') returning lease into v_lease;
 return jsonb_build_object('lease',v_lease,'reserved_nano',v_cost,'mode','simulation_only');
end $$;
create function solq_cost_private.settle(p_hash text,p_attempt integer,p_lease uuid,p_input integer,p_output integer,p_quality boolean default true,p_known_failure boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare p solq_cost_private.policy%rowtype;r solq_cost_private.reservations%rowtype;a solq_cost_private.approvals%rowtype;v_cost bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_required';end if;
 select * into strict p from solq_cost_private.policy where id=true for update;
 select * into r from solq_cost_private.reservations where job_hash=p_hash and attempt=p_attempt for update;
 if not found or p_lease is distinct from r.lease then raise exception 'lease_mismatch';end if;
 if r.state<>'reserved' then return r.state;end if;
 if p_known_failure is true then
  update solq_cost_private.reservations set state='failed_known' where job_hash=p_hash and attempt=p_attempt;
  return 'failed_known';
 end if;
 select * into strict a from solq_cost_private.approvals where job_hash=p_hash;
 if p_input is null or p_output is null or p_input<0 or p_output<0 or p_input>a.input_cap or p_output>a.output_cap
 or r.reservation_day<>(clock_timestamp() at time zone 'Asia/Seoul')::date then
  update solq_cost_private.policy set healthy=false where id=true;
  update solq_cost_private.reservations set state='unknown' where job_hash=p_hash and attempt=p_attempt;
  return 'unknown';
 end if;
 v_cost:=case a.model when 'claude-haiku-5-5' then p_input::bigint*100+p_output::bigint*500 else p_input::bigint*2000+p_output::bigint*10000 end;
 update solq_cost_private.reservations set charged_nano=v_cost,state=case when p_quality is true then 'settled' else 'quality_failed' end where job_hash=p_hash and attempt=p_attempt;
 return case when p_quality is true then 'settled' else 'quality_failed' end;
end $$;
revoke all on all functions in schema solq_cost_private from public,anon,authenticated,service_role;
grant usage on schema solq_cost_private to authenticated,service_role;
grant execute on function solq_cost_private.approve(text,text,integer,integer,integer,bigint,timestamptz,boolean) to authenticated;
grant execute on function solq_cost_private.reserve(text,integer,text,integer,integer) to service_role;
grant execute on function solq_cost_private.settle(text,integer,uuid,integer,integer,boolean,boolean) to service_role;
-- Private schema is deliberately not added to PostgREST exposed schemas.
-- No live Edge dispatcher exists. A separately reviewed server-only adapter is required.
commit;
