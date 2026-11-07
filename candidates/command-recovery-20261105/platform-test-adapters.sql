-- TEST ADAPTERS ONLY: no Supabase Auth/JWT verification, pg_net, pg_cron or Vault implementation.
-- No network operations are available. No production credentials or data are used.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon,authenticated,service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique);
create view vault.decrypted_secrets as select id,name,'NONSECRET_TEST_PLACEHOLDER'::text as decrypted_secret from vault.secrets;
create function vault.create_secret(ignored text,n text) returns uuid language sql as $$insert into vault.secrets(name) values(n) returning id$$;
create function vault.update_secret(ignored_id uuid,ignored_value text) returns void language sql as $$select$$;
create schema cron;
create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text,active boolean default false);
create function cron.schedule(n text,s text,c text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values(n,s,c) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;
create schema net;
create table net.http_request_queue(id bigint);
create table net._http_response(id bigint);
create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000) returns bigint language plpgsql as $$begin raise exception 'network_disabled_in_test';end$$;
