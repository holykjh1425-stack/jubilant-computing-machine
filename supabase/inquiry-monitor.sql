create schema if not exists nexus_private;
revoke all on schema nexus_private from public, anon, authenticated;
create table public.inquiry_events (
 id bigint generated always as identity primary key,
 application_id uuid not null unique references public.applications(id) on delete cascade,
 detected_at timestamptz not null default now(),
 source text not null default 'application_form' check(source='application_form')
);
alter table public.inquiry_events enable row level security;
revoke all on public.inquiry_events from anon, authenticated;
grant select on public.inquiry_events to authenticated;
create policy "admins read inquiry events" on public.inquiry_events for select to authenticated
using (exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create function nexus_private.capture_inquiry() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.inquiry_events(application_id) values(new.id) on conflict(application_id) do nothing;
 return new;
end; $$;
revoke all on function nexus_private.capture_inquiry() from public,anon,authenticated;
create trigger nexus_capture_inquiry after insert on public.applications for each row execute function nexus_private.capture_inquiry();
