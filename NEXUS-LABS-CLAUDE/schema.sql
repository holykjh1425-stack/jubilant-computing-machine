-- STAGED ONLY. Apply after deployment approval. No changes to customer tables or RPCs.
begin;
do $role$ begin if not exists(select 1 from pg_roles where rolname='nexus_ai_backend') then create role nexus_ai_backend nologin; end if; end $role$;
create schema if not exists nexus_ai_private;
revoke all on schema nexus_ai_private from public, anon, authenticated;
create table if not exists nexus_ai_private.jobs (
 request_id uuid primary key,
 admin_id uuid not null references public.admin_users(user_id),
 application_id uuid not null references public.applications(id),
 status text not null check (status in ('running','draft_verified','needs_review','failed')),
 reserved_usd numeric(16,6) not null check(reserved_usd>0),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 error_code text
);
create table if not exists nexus_ai_private.calls (
 request_id uuid not null references nexus_ai_private.jobs(request_id),
 stage text not null check(stage in ('analysis','worker','verification')),
 provider text not null check(provider in ('openai','claude')),
 model text not null,
 status text not null check(status in ('started','succeeded','failed')),
 error_code text,
 input_tokens integer check(input_tokens>=0),
 output_tokens integer check(output_tokens>=0),
 created_at timestamptz not null default now(),
 primary key(request_id,stage)
);
alter table nexus_ai_private.jobs enable row level security;
alter table nexus_ai_private.calls enable row level security;
revoke all on all tables in schema nexus_ai_private from public,anon,authenticated;
grant usage on schema nexus_ai_private, public to nexus_ai_backend;
grant select, insert, update on nexus_ai_private.jobs to nexus_ai_backend;
grant select, insert, update on nexus_ai_private.calls to nexus_ai_backend;
create policy backend_jobs on nexus_ai_private.jobs to nexus_ai_backend using(true) with check(true);
create policy backend_calls on nexus_ai_private.calls to nexus_ai_backend using(true) with check(true);
grant select(user_id) on public.admin_users to nexus_ai_backend;
grant select(id,service_type,description,privacy_consent,status) on public.applications to nexus_ai_backend;
create policy backend_admin_lookup on public.admin_users for select to nexus_ai_backend using(true);
create policy backend_order_lookup on public.applications for select to nexus_ai_backend using(true);
-- An intentional owner-rights, security-barrier view limits backend access to TWO named keys.
-- The backend role gets NO direct USAGE on vault and NO direct SELECT on decrypted_secrets.
create view nexus_ai_private.api_keys with (security_barrier=true) as
 select name,decrypted_secret from vault.decrypted_secrets
 where name in ('nexus_labs_claude_api_key','nexus_labs_openai_api_key');
revoke all on nexus_ai_private.api_keys from public,anon,authenticated;
grant select on nexus_ai_private.api_keys to nexus_ai_backend;
-- No public RPC exposes the Vault or ledger. Provision a dedicated login as member of
-- nexus_ai_backend at deployment. Do NOT run this service with a postgres/admin login.
commit;
