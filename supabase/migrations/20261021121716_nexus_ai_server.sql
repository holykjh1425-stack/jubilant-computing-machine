-- APPROVAL REQUIRED: additive production DDL. No existing rows/triggers/policies changed.
create schema nexus_ai_private;
revoke all on schema nexus_ai_private from public, anon, authenticated;
grant usage on schema nexus_ai_private to service_role;

create table public.ai_connection_runs (
  run_key text primary key check (run_key = 'claude-connection-v1'),
  requested_by uuid not null,
  status text not null default 'reserved' check (status in ('reserved','succeeded','failed')),
  model text not null default 'claude-haiku-5-5' check (model = 'claude-haiku-5-5'),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_usd numeric check (estimated_cost_usd >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.ai_connection_runs enable row level security;
revoke all on public.ai_connection_runs from public, anon, authenticated;
grant select on public.ai_connection_runs to authenticated;
grant select, insert, update on public.ai_connection_runs to service_role;
create policy "admins read AI connection audit" on public.ai_connection_runs
for select to authenticated using (exists (
  select 1 from public.admin_users a where a.user_id = (select auth.uid())
));

create table public.ai_work_plans (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  created_by uuid not null,
  plan jsonb not null,
  created_at timestamptz not null default now()
);
-- Deliberately no trigger or FK on customer tables: existing intake is unaffected.
alter table public.ai_work_plans enable row level security;
revoke all on public.ai_work_plans from public, anon, authenticated;
grant select on public.ai_work_plans to authenticated;
grant select, insert on public.ai_work_plans to service_role;
create policy "admins read AI work plans" on public.ai_work_plans
for select to authenticated using (exists (
  select 1 from public.admin_users a where a.user_id = (select auth.uid())
));

-- The definer is private. Only the server service role can enter this bridge.
create function nexus_ai_private.claude_key() returns text
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'server role required' using errcode = '42501';
  end if;
  select decrypted_secret into strict v_key from vault.decrypted_secrets
    where name = 'nexus_labs_claude_api_key';
  return v_key;
end;
$$;
revoke all on function nexus_ai_private.claude_key() from public, anon, authenticated;
grant execute on function nexus_ai_private.claude_key() to service_role;

create function public.nexus_ai_key() returns text
language sql security invoker set search_path = '' as $$
  select nexus_ai_private.claude_key();
$$;
revoke all on function public.nexus_ai_key() from public, anon, authenticated;
grant execute on function public.nexus_ai_key() to service_role;

create function public.nexus_ai_claim_test(p_admin uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'server role required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.admin_users where user_id = p_admin) then
    raise exception 'admin required' using errcode = '42501';
  end if;
  insert into public.ai_connection_runs(run_key,requested_by)
    values ('claude-connection-v1',p_admin) on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.nexus_ai_claim_test(uuid) from public, anon, authenticated;
grant execute on function public.nexus_ai_claim_test(uuid) to service_role;
