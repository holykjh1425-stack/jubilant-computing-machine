-- Fresh local synthetic database ONLY. These base tables are a dependency fixture,
-- not a copy of the current operating schema or an operating backup restore.
create table public.admin_users(user_id uuid primary key references auth.users);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public,anon,authenticated;
grant select on public.admin_users to authenticated;
create policy self_read on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
create table public.applications(id uuid primary key default gen_random_uuid(),receipt_number text unique not null,
 customer_name text,contact text,service_type text not null,description text not null,
 privacy_consent boolean,status text not null default 'received',internal_note text,created_at timestamptz default now());
alter table public.applications enable row level security;
revoke all on public.applications from public,anon,authenticated;
grant select on public.applications to authenticated;
create policy admin_read on public.applications for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
