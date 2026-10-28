-- ISOLATED FIXTURE ONLY. No production migration or real auth users.
create schema solq_plan_fixture;
create table solq_plan_fixture.applications(id text primary key, approved boolean not null default false);
create table solq_plan_fixture.plans(id bigint generated always as identity primary key, application_id text unique references solq_plan_fixture.applications, steps jsonb not null);
create table solq_plan_fixture.jobs(id bigint generated always as identity primary key, application_id text unique references solq_plan_fixture.applications,plan_id bigint unique references solq_plan_fixture.plans,status text not null check(status='awaiting_approval'));
create table solq_plan_fixture.annotations(plan_id bigint primary key references solq_plan_fixture.plans,source text not null check(source='claude_mock'),body jsonb not null);
create table solq_plan_fixture.budget(singleton boolean primary key check(singleton),charged bigint not null default 0,cap bigint not null check(cap<=1000000));
insert into solq_plan_fixture.budget values(true,0,1000000);
create function solq_plan_fixture.generate(aid text, steps jsonb, note jsonb, input_tokens integer, output_tokens integer, fail_after_plan boolean default false) returns jsonb language plpgsql as $$
declare a solq_plan_fixture.applications;p solq_plan_fixture.plans;j solq_plan_fixture.jobs; amount bigint;b solq_plan_fixture.budget;
begin
 select * into a from solq_plan_fixture.applications where id=aid for update;
 if not found or not a.approved then raise exception 'plan_approval_required';end if;
 select * into p from solq_plan_fixture.plans where application_id=aid;
 if found then
  select * into j from solq_plan_fixture.jobs where application_id=aid and plan_id=p.id;
  if not found then raise exception 'incomplete_existing_records';end if;
  return jsonb_build_object('planId',p.id,'jobId',j.id,'reused',true,'status',j.status);
 end if;
 if steps is distinct from '["requirements","scope","implementation","validation","human_review","delivery"]'::jsonb then raise exception 'invalid_steps';end if;
 if note is not null then
  if input_tokens is null or output_tokens is null or input_tokens not between 0 and 1000 or output_tokens not between 0 and 512 then raise exception 'usage_invalid';end if;
  amount:=input_tokens*100::bigint+output_tokens*500::bigint;
  select * into b from solq_plan_fixture.budget where singleton for update;
  if b.charged+amount>b.cap then raise exception 'budget_exceeded';end if;
  update solq_plan_fixture.budget set charged=charged+amount;
 end if;
 insert into solq_plan_fixture.plans(application_id,steps) values(aid,steps) returning * into p;
 if fail_after_plan then raise exception 'injected_store_failure';end if;
 insert into solq_plan_fixture.jobs(application_id,plan_id,status) values(aid,p.id,'awaiting_approval') returning * into j;
 if note is not null then insert into solq_plan_fixture.annotations values(p.id,'claude_mock',note);end if;
 return jsonb_build_object('planId',p.id,'jobId',j.id,'reused',false,'status',j.status);
end $$;
revoke all on schema solq_plan_fixture from public;
