-- Current-catalog recovery of untracked approval prerequisites. Not historical migration text.
create table "nexus_production_private"."security_backups" (
 "backup_key" text not null,
 "created_at" timestamp with time zone default now() not null,
 "payload" jsonb not null,
 constraint "security_backups_pkey" PRIMARY KEY (backup_key)
);
revoke all on nexus_production_private.security_backups from public,anon,authenticated,service_role;
create unique index ai_work_plans_one_per_application on public.ai_work_plans(application_id);
alter table public.production_jobs add column "production_approved_by" uuid;
alter table public.production_jobs add column "production_approved_at" timestamp with time zone;
alter table public.production_jobs add constraint "production_jobs_production_approved_by_fkey" FOREIGN KEY (production_approved_by) REFERENCES admin_users(user_id);
CREATE OR REPLACE FUNCTION nexus_production_private.approve(p_application uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.applications; j public.production_jobs; actor uuid:=auth.uid();
begin
 if actor is null or coalesce(auth.jwt()->>'role','') <> 'authenticated' or not exists(select 1 from public.admin_users where user_id=actor) then raise exception 'admin required' using errcode='42501';end if;
 select * into strict a from public.applications where id=p_application for update;
 if a.status not in ('deposit_confirmed','in_progress') then raise exception 'manual payment confirmation required' using errcode='42501';end if;
 select * into j from public.production_jobs where application_id=a.id for update;
 if j.id is null then perform nexus_production_private.enroll(a.id); select * into strict j from public.production_jobs where application_id=a.id for update;end if;
 if not exists(select 1 from public.solq_quote_acceptances q where q.id=j.quote_acceptance_id and q.application_id=a.id) then raise exception 'verified customer quotation acceptance required' using errcode='42501';end if;
 if j.production_approved_at is not null then return jsonb_build_object('approved',true,'duplicate',true,'job_id',j.id,'status',j.status);end if;
 if j.status<>'awaiting_deposit' or j.attempt_count<>0 then raise exception 'job is not approvable' using errcode='42501';end if;
 update public.production_jobs set production_approved_by=actor,production_approved_at=now(),payment_observed_at=now(),status='queued',updated_at=now() where id=j.id;
 update public.applications set status='in_progress' where id=a.id;
 insert into public.production_events(job_id,event) values(j.id,'separate_admin_production_approval');
 return jsonb_build_object('approved',true,'duplicate',false,'job_id',j.id,'status','queued');
end $function$
;
revoke all on function "nexus_production_private"."approve"(p_application uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION nexus_production_private.guard_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.status is distinct from old.status and new.status in ('in_progress','completed') and not exists(select 1 from public.production_jobs j join public.admin_users u on u.user_id=j.production_approved_by where j.application_id=new.id and j.production_approved_at is not null and j.payment_observed_at is not null) then raise exception 'separate production approval required' using errcode='42501';end if;
 return new;
end $function$
;
revoke all on function "nexus_production_private"."guard_application"() from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION nexus_production_private.guard_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (TG_OP='INSERT' and (new.production_approved_at is not null or new.production_approved_by is not null))
 or (TG_OP='UPDATE' and (new.production_approved_at is distinct from old.production_approved_at or new.production_approved_by is distinct from old.production_approved_by)) then
  if auth.uid() is null or coalesce(auth.jwt()->>'role','') <> 'authenticated' or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'authenticated admin approval required' using errcode='42501'; end if;
  if new.production_approved_by is distinct from auth.uid() or new.production_approved_at is null then raise exception 'invalid approval identity' using errcode='42501'; end if;
 end if;
 if new.status in ('queued','running','awaiting_review','released') then
  perform 1 from public.applications where id=new.application_id and status in ('deposit_confirmed','in_progress','completed') for update;
  if not found or new.payment_observed_at is null or new.production_approved_at is null
   or not exists(select 1 from public.admin_users where user_id=new.production_approved_by) then raise exception 'payment and separate production approval required' using errcode='42501'; end if;
 end if;
 if new.status='queued' and (TG_OP='INSERT' or old.status is distinct from 'queued') and coalesce(new.attempt_count,0)<>0 then raise exception 'duplicate execution prohibited' using errcode='42501';end if;
 return new;
end $function$
;
revoke all on function "nexus_production_private"."guard_job"() from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.solq_approve_production(p_application uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select nexus_production_private.approve(p_application); $function$
;
revoke all on function "public"."solq_approve_production"(p_application uuid) from public,anon,authenticated,service_role;
grant usage on schema nexus_production_private to authenticated;
grant execute on function nexus_production_private.approve(uuid),public.solq_approve_production(uuid) to authenticated;
CREATE TRIGGER solq_application_approval_guard BEFORE UPDATE OF status ON public.applications FOR EACH ROW EXECUTE FUNCTION nexus_production_private.guard_application();
CREATE TRIGGER solq_production_approval_guard BEFORE INSERT OR UPDATE ON public.production_jobs FOR EACH ROW EXECUTE FUNCTION nexus_production_private.guard_job();
