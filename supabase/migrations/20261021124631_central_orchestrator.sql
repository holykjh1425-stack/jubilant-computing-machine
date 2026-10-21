-- REVIEW ONLY: additive metadata. No customer tables, triggers, Vault, or auth settings modified.
create schema nexus_orchestrator_private;
revoke all on schema nexus_orchestrator_private from public, anon, authenticated;
grant usage on schema nexus_orchestrator_private to service_role;
create table public.orchestrator_jobs (
 id uuid primary key default gen_random_uuid(), created_by uuid not null,
 idempotency_key uuid not null unique, instruction text not null check(length(instruction) between 1 and 2000),
 agent text not null check(agent in ('internal','claude','openai','codex','work')),
 status text not null default 'queued' check(status in ('queued','running','blocked','failed','awaiting_approval','completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.orchestrator_tasks (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.orchestrator_jobs(id),
 ordinal integer not null, kind text not null, agent text not null,
 status text not null default 'queued' check(status in ('queued','running','retry_wait','blocked','failed','awaiting_approval','completed')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 next_attempt_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
 result jsonb, error_code text, verified boolean not null default false,
 unique(job_id,ordinal), check(result is null or pg_column_size(result)<16000)
);
create table public.orchestrator_events (
 id bigint generated always as identity primary key, job_id uuid not null references public.orchestrator_jobs(id),
 task_id uuid references public.orchestrator_tasks(id), event text not null,
 code text, created_at timestamptz not null default now()
);
create index orchestrator_tasks_ready on public.orchestrator_tasks(status,next_attempt_at);
create index orchestrator_events_job on public.orchestrator_events(job_id,id);
alter table public.orchestrator_jobs enable row level security;
alter table public.orchestrator_tasks enable row level security;
alter table public.orchestrator_events enable row level security;
revoke all on public.orchestrator_jobs,public.orchestrator_tasks,public.orchestrator_events from public,anon,authenticated;
grant select on public.orchestrator_jobs,public.orchestrator_tasks,public.orchestrator_events to authenticated;
create policy "admin reads orchestration jobs" on public.orchestrator_jobs for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy "admin reads orchestration tasks" on public.orchestrator_tasks for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy "admin reads orchestration events" on public.orchestrator_events for select to authenticated using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
-- A single private definer owns transactional state transitions. It cannot access Vault.
create function nexus_orchestrator_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.orchestrator_jobs; t public.orchestrator_tasks; v_id uuid; v_status text; v_code text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server required' using errcode='42501'; end if;
 if p_action='submit' then
  if not exists(select 1 from public.admin_users where user_id=(p_data->>'actor')::uuid) then raise exception 'admin required'; end if;
  if (p_data->>'instruction') ~* '(sk-|sb_secret_|-----BEGIN|password\s*[:=]|비밀번호\s*[:=])' then raise exception 'credential input forbidden'; end if;
  insert into public.orchestrator_jobs(created_by,idempotency_key,instruction,agent)
  values((p_data->>'actor')::uuid,(p_data->>'key')::uuid,p_data->>'instruction',p_data->>'agent')
  on conflict(idempotency_key) do nothing returning * into j;
  if j.id is null then
   select * into strict j from public.orchestrator_jobs where idempotency_key=(p_data->>'key')::uuid;
   if j.created_by<>(p_data->>'actor')::uuid or j.instruction<>p_data->>'instruction' or j.agent<>p_data->>'agent' then raise exception 'idempotency conflict'; end if;
   return to_jsonb(j);
  end if;
  insert into public.orchestrator_tasks(job_id,ordinal,kind,agent) values
   (j.id,1,'requirements','internal'),(j.id,2,'scope',j.agent),(j.id,3,'validation','internal'),(j.id,4,'human_review','internal');
  insert into public.orchestrator_events(job_id,event) values(j.id,'submitted');
  return to_jsonb(j);
 elsif p_action='claim' then
  -- Expired internal work is safe to retry. External outcomes must be reviewed, never replayed.
  for t in select * from public.orchestrator_tasks where status='running' and lease_until<now() for update skip locked loop
   v_status:=case when t.agent='internal' and t.attempts<3 then 'retry_wait' else 'blocked' end;
   update public.orchestrator_tasks set status=v_status,error_code='lease_expired',lease_token=null,lease_until=null,next_attempt_at=now()+interval '5 seconds' where id=t.id;
   update public.orchestrator_jobs set status=case when v_status='blocked' then 'blocked' else 'running' end,updated_at=now() where id=t.job_id;
   insert into public.orchestrator_events(job_id,task_id,event,code) values(t.job_id,t.id,v_status,'lease_expired');
  end loop;
  select x.* into t from public.orchestrator_tasks x
   join public.orchestrator_jobs y on y.id=x.job_id
   where x.status in ('queued','retry_wait') and x.next_attempt_at<=now() and y.status in ('queued','running')
   and not exists(select 1 from public.orchestrator_tasks d where d.job_id=x.job_id and d.ordinal<x.ordinal and (d.status<>'completed' or not d.verified))
   order by y.created_at,x.ordinal for update of x skip locked limit 1;
  if t.id is null then return 'null'::jsonb; end if;
  update public.orchestrator_tasks set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where id=t.id returning * into t;
  update public.orchestrator_jobs set status='running',updated_at=now() where id=t.job_id;
  insert into public.orchestrator_events(job_id,task_id,event) values(t.job_id,t.id,'claimed');
  select * into strict j from public.orchestrator_jobs where id=t.job_id;
  return to_jsonb(t)||jsonb_build_object('instruction',j.instruction,'previous',coalesce((select jsonb_agg(result order by ordinal) from public.orchestrator_tasks where job_id=t.job_id and ordinal<t.ordinal),'[]'::jsonb));
 elsif p_action='finish' then
  select * into strict t from public.orchestrator_tasks where id=(p_data->>'task_id')::uuid for update;
  if t.status<>'running' or t.lease_token<>(p_data->>'lease')::uuid or t.lease_until<now() or p_data->>'lease' is null then raise exception 'stale lease'; end if;
  v_status:=p_data->>'status'; v_code:=p_data->>'code';
  if v_status not in ('completed','blocked','failed','awaiting_approval','retry_wait') then raise exception 'invalid status'; end if;
  if v_status='completed' and coalesce((p_data->>'verified')::boolean,false) is not true then raise exception 'verification required'; end if;
  if v_status='retry_wait' and (t.agent<>'internal' or t.attempts>=3) then v_status:='blocked'; v_code:='retry_not_safe'; end if;
  update public.orchestrator_tasks set status=v_status,result=p_data->'result',error_code=v_code,
   verified=coalesce((p_data->>'verified')::boolean,false),lease_token=null,lease_until=null,
   next_attempt_at=now()+make_interval(secs=>least(60,power(2,t.attempts)::int)) where id=t.id;
  insert into public.orchestrator_events(job_id,task_id,event,code) values(t.job_id,t.id,v_status,v_code);
  update public.orchestrator_jobs set status=case
   when v_status in ('blocked','failed','awaiting_approval') then v_status
   when not exists(select 1 from public.orchestrator_tasks where job_id=t.job_id and status<>'completed') then 'completed'
   else 'running' end,updated_at=now() where id=t.job_id;
  return jsonb_build_object('saved',true,'status',v_status);
 else raise exception 'unsupported command'; end if;
end; $$;
revoke all on function nexus_orchestrator_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function nexus_orchestrator_private.command(text,jsonb) to service_role;
create function public.nexus_orchestrator_command(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select nexus_orchestrator_private.command(p_action,p_data);$$;
revoke all on function public.nexus_orchestrator_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.nexus_orchestrator_command(text,jsonb) to service_role;
