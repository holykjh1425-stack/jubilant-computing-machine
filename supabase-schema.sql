-- Supabase SQL Editor에서 실행한 뒤 실제 정책을 테스트하세요.
create extension if not exists pgcrypto;
create table if not exists public.admin_users(user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists public.applications(
 id uuid primary key default gen_random_uuid(),
 receipt_number text not null unique default ('NX-'||to_char(now() at time zone 'utc','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 created_at timestamptz not null default now(),
 customer_name text not null check(char_length(customer_name) between 1 and 100),
 contact text not null check(char_length(contact) between 3 and 200),
 service_type text not null check(service_type in ('website','ai_automation','custom_system','consulting')),
 description text not null check(char_length(description) between 1 and 5000),
 privacy_consent boolean not null check(privacy_consent=true),
 status text not null default 'received' check(status in ('received','reviewing','deposit_confirmed','in_progress','completed','cancelled')),
 internal_note text
);
alter table public.admin_users enable row level security;
alter table public.applications enable row level security;
create policy "admin reads own record" on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
create policy "public submits only new applications" on public.applications for insert to anon,authenticated with check(privacy_consent=true and status='received' and internal_note is null);
create policy "admins read applications" on public.applications for select to authenticated using(exists(select 1 from public.admin_users au where au.user_id=(select auth.uid())));
create policy "admins update applications" on public.applications for update to authenticated using(exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()))) with check(exists(select 1 from public.admin_users au where au.user_id=(select auth.uid())));
-- 관리자 계정 생성 후 아래를 SQL Editor에서 실행하고 UUID를 실제 사용자 ID로 바꾸세요:
-- insert into public.admin_users(user_id) values ('관리자-사용자-UUID');
-- service_role/secret key는 절대 브라우저 코드에 넣지 마세요.
