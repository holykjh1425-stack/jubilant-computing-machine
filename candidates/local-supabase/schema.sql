-- LOCAL SYNTHETIC STACK ONLY. Do not apply to an existing/hosted project.
create table public.solq_local_admins(user_id uuid primary key references auth.users);
create table public.solq_local_applications(id uuid primary key, approved boolean not null default false);
create table public.solq_local_plans(id uuid primary key default gen_random_uuid(),application_id uuid unique references solq_local_applications,steps jsonb not null);
create table public.solq_local_jobs(id uuid primary key default gen_random_uuid(),application_id uuid unique references solq_local_applications,plan_id uuid unique references solq_local_plans,status text not null check(status='awaiting_approval'));
create table public.solq_local_annotations(plan_id uuid primary key references solq_local_plans,body jsonb not null,source text not null check(source='claude_mock'));
alter table solq_local_admins enable row level security;
create policy self on solq_local_admins for select to authenticated using(user_id=(select auth.uid()));
grant select on solq_local_admins to authenticated;
revoke all on solq_local_admins from anon;
do $$declare t text;begin
 foreach t in array array['solq_local_applications','solq_local_plans','solq_local_jobs','solq_local_annotations'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy admin_read on %I for select to authenticated using(exists(select 1 from public.solq_local_admins where user_id=(select auth.uid())))',t);
  execute format('create policy admin_insert on %I for insert to authenticated with check(exists(select 1 from public.solq_local_admins where user_id=(select auth.uid())))',t);
  execute format('grant select on %I to anon,authenticated',t);
  execute format('grant insert on %I to authenticated',t);
 end loop;
end $$;
create function public.solq_local_generate(p_application uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.solq_local_applications;p public.solq_local_plans;j public.solq_local_jobs;
begin
 if not exists(select 1 from public.solq_local_admins where user_id=auth.uid()) then raise exception 'admin_required';end if;
 -- Advisory lock avoids UPDATE privilege merely for a row lock in this minimal insert-only fixture.
 perform pg_advisory_xact_lock(hashtextextended(p_application::text,0));
 select * into a from public.solq_local_applications where id=p_application;
 if not found or not a.approved then raise exception 'approval_required';end if;
 select * into p from public.solq_local_plans where application_id=a.id;
 if found then
  select * into j from public.solq_local_jobs where application_id=a.id and plan_id=p.id;
  if not found then raise exception 'incomplete_existing_records';end if;
  return jsonb_build_object('planId',p.id,'jobId',j.id,'reused',true,'status',j.status);
 end if;
 insert into public.solq_local_plans(application_id,steps) values(a.id,'["requirements","scope","implementation","validation","human_review","delivery"]') returning * into p;
 insert into public.solq_local_jobs(application_id,plan_id,status) values(a.id,p.id,'awaiting_approval') returning * into j;
 insert into public.solq_local_annotations values(p.id,'{"summary":"synthetic analysis","requiresReview":true,"productionCompleted":false}','claude_mock');
 return jsonb_build_object('planId',p.id,'jobId',j.id,'reused',false,'status',j.status);
end $$;
revoke all on function public.solq_local_generate(uuid) from public,anon;
grant execute on function public.solq_local_generate(uuid) to authenticated;
