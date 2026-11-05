-- Run atomically. Only schema/function changes and an internal recovery snapshot.
insert into nexus_production_private.security_backups(backup_key,payload)
select 'solq_free_plan_automation_v1',jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('nexus_production_private','nexus_orchestrator_private')),
 'applications',(select jsonb_agg(to_jsonb(a) order by id) from public.applications a),
 'plans',(select jsonb_agg(to_jsonb(p) order by id) from public.ai_work_plans p),
 'production_jobs',(select jsonb_agg(to_jsonb(j) order by id) from public.production_jobs j),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'cron',(select jsonb_agg(jsonb_build_object('jobid',jobid,'schedule',schedule,'command',command,'active',active)) from cron.job))
on conflict(backup_key) do nothing;

alter table public.ai_work_plans alter column created_by drop not null;
create unique index solq_one_free_plan_per_application on public.ai_work_plans(application_id);
alter table public.orchestrator_jobs alter column created_by drop not null;
alter table public.orchestrator_jobs add column application_id uuid references public.applications(id), add column free_plan_id uuid references public.ai_work_plans(id);
create unique index solq_one_free_job_per_application on public.orchestrator_jobs(application_id) where free_plan_id is not null;

create table public.solq_free_plan_runs (
 application_id uuid primary key references public.applications(id),
 status text not null default 'pending' check(status in ('pending','retry_wait','awaiting_approval','failed','existing_plan')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 next_attempt_at timestamptz not null default now(),
 plan_id uuid references public.ai_work_plans(id), job_id uuid references public.orchestrator_jobs(id),
 error_code text, error_history jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.solq_free_plan_runs enable row level security;
revoke all on public.solq_free_plan_runs from public,anon,authenticated;
grant select on public.solq_free_plan_runs to authenticated;
create policy solq_admin_read_free_runs on public.solq_free_plan_runs for select to authenticated
using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create table nexus_production_private.free_plan_settings(singleton boolean primary key default true check(singleton),capture_from timestamptz not null default now());
insert into nexus_production_private.free_plan_settings(singleton) values(true);
revoke all on nexus_production_private.free_plan_settings from public,anon,authenticated,service_role;

-- A factual acceptance record is required. No old records are backfilled.
create table public.solq_quote_acceptances (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id),
 quote_reference text not null check(length(btrim(quote_reference)) between 1 and 200),
 quote_version text not null check(length(btrim(quote_version)) between 1 and 100),
 amount_krw bigint not null check(amount_krw>0),
 accepted_at timestamptz not null check(accepted_at<=now()),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 5 and 1000),
 verified_by uuid not null references public.admin_users(user_id),
 recorded_at timestamptz not null default now(), unique(application_id,quote_reference,quote_version)
);
alter table public.solq_quote_acceptances enable row level security;
revoke all on public.solq_quote_acceptances from public,anon,authenticated,service_role;
grant select on public.solq_quote_acceptances to authenticated;
create policy solq_admin_read_quote_acceptances on public.solq_quote_acceptances for select to authenticated
using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
alter table public.production_jobs add column quote_acceptance_id uuid references public.solq_quote_acceptances(id);

create function nexus_production_private.free_plan(p_application uuid) returns jsonb
language plpgsql stable set search_path='' as $fn$
declare a public.applications; label text; scope_text text; actions jsonb; flags jsonb; gaps jsonb; enough boolean;
begin
 select * into strict a from public.applications where id=p_application;
 label:=case a.service_type when 'website' then '웹사이트' when 'ai_automation' then '업무 자동화' when 'custom_system' then '맞춤 시스템' else '상담·기타 문의' end;
 flags:=jsonb_build_object('login',a.description ~* '로그인|login','payment',a.description ~* '결제|payment','integration',a.description ~* '연동|integration','notifications',a.description ~* '알림|발송|문자|이메일','classification',a.description ~* '분류|정리|문의','sensitive_input',a.description ~* '(sk-|sb_secret_|-----BEGIN|password\s*[:=]|비밀번호\s*[:=])');
 enough:=length(btrim(a.description))>=20;
 scope_text:=case a.service_type
 when 'website' then '신청 원문에 나온 페이지·입력 항목·모바일 동선을 목록화하고 입력 양식과 결과 화면의 초안을 검토한다.'
 when 'ai_automation' then '신청 원문에 나온 입력·분류 조건·출력 형식을 규칙표로 정리하고 반복 업무 1개의 자동화 범위를 검토한다.'
 when 'custom_system' then '신청 원문에 나온 사용자 역할·데이터·처리 흐름을 분리하고 최소 기능과 권한 경계를 검토한다.'
 else '문의에서 해결할 문제와 원하는 결과를 추출한다. 명시하지 않은 제작 기능이나 서비스를 임의 확정하지 않는다.' end;
 actions:=jsonb_build_array(scope_text,'검토할 고객 요청: '||left(a.description,500),'요청과 연결된 가상 입력 예시와 기대 결과를 작성하고 경계·누락 입력 검증 기준을 정한다.','추가 확인 질문과 포함·제외 범위를 관리자에게 전달한다. 실제 제작은 별도 승인 뒤 진행한다.');
 if a.description ~ '분류|정리' then actions:=actions||jsonb_build_array('분류·정리: 고객에게 실제 입력 예시와 분류 목록을 받아 규칙표를 작성한다. 일치하지 않는 입력은 기타·관리자 확인으로 분리하고 오분류 예시로 검증한다.');end if;
 if a.description ~ '메뉴' then actions:=actions||jsonb_build_array('메뉴 관련 요청: 고객의 실제 메뉴 목록을 기준표로 사용하고 메뉴명 누락·별칭·여러 메뉴가 섞인 문의의 처리 기준을 확인한다.');end if;
 if a.description ~ '예약' then actions:=actions||jsonb_build_array('예약 관련 요청: 날짜·시간·서비스·인원 입력 필요 여부와 중복 시간·마감·취소 처리 기준을 확인한다. 자동 확정 여부는 별도 합의한다.');end if;
 if a.description ~ '주문' then actions:=actions||jsonb_build_array('주문 관련 요청: 품목·수량·옵션 입력과 누락·중복 주문 처리 기준을 먼저 합의한다. 결제·실제 주문 전송은 실행하지 않는다.');end if;
 if a.description ~ '엑셀|스프레드시트|CSV|csv' then actions:=actions||jsonb_build_array('표 데이터 요청: 개인정보를 제거한 예시 파일의 열 이름·필수 값·중복 기준을 확인하고 입력과 결과 열 매핑을 작성한다.');end if;
 if (flags->>'login')::boolean then actions:=actions||jsonb_build_array('로그인 요청: 이용자 역할·접근 권한·인증 방식 확인을 실행 전 조건으로 둔다.');end if;
 if (flags->>'integration')::boolean then actions:=actions||jsonb_build_array('연동 요청: 대상 서비스·접근 권한·전송할 정보·요금을 확인하기 전 실제 연동을 실행하지 않는다.');end if;
 if (flags->>'payment')::boolean then actions:=actions||jsonb_build_array('결제 요청: 결제 제공사·계약·비용을 별도 견적 대상으로 분리한다.');end if;
 if (flags->>'notifications')::boolean then actions:=actions||jsonb_build_array('알림·발송 요청: 채널·수신 동의·대상·발송 비용을 확인한다. 자동 발송은 이 무료 단계에서 실행하지 않는다.');end if;
 gaps:=case when enough then jsonb_build_array('원문에 없는 입력 예시·완료 기준·예산·일정은 관리자 검토에서 확인한다.') else jsonb_build_array('요청 내용이 짧아 목적·입력 자료·원하는 결과·사용 환경을 추가 확인해야 한다. 구체 기능 확정 보류.') end;
 return jsonb_build_object('engine','solq_rules_v1','generation_method','rules_only','model_used',false,'paid_calls',0,
 'application_id',a.id,'receipt_number',a.receipt_number,'service_type',a.service_type,
 'source_hash',md5(a.service_type||E'\n'||a.description),'requirements',a.description,
 'steps',jsonb_build_array('requirements','classification','scope','implementation','validation','human_review'),
 'details',jsonb_build_array(
 jsonb_build_object('ordinal',1,'title','고객 요청 분석','request_excerpt',left(a.description,1000),'sufficient_detail',enough,'follow_up',gaps),
 jsonb_build_object('ordinal',2,'title','서비스 유형 및 목적 분류','service',label,'classification_basis','고객 선택 service_type 기준, 키워드는 확인 항목만 추가','features',flags),
 jsonb_build_object('ordinal',3,'title','자동화 가능 범위 판단','proposed_scope',scope_text,'confirmed_scope',false,'requires_human_review',true),
 jsonb_build_object('ordinal',4,'title','구체적인 실행 단계','proposed_actions',actions,'execution_started',false),
 jsonb_build_object('ordinal',5,'title','예상 결과·제약·비용 검토','expected_result','요청별 범위 초안·확인 질문·검증 기준','limitations','무료 규칙 기반 초안이며 모델 추론·제작 결과·확정 견적이 아님','possible_costs','생성형 AI·외부 연동·발송·호스팅·제작은 별도 비용 검토. 무료 계획은 0원.'),
 jsonb_build_object('ordinal',6,'title','관리자 검토용 최종 계획','status','awaiting_approval','next_action','신청 원문과 범위·질문 검토 후 개별 견적 안내. 고객 견적 동의·실제 입금 확인·별도 제작 승인 전 실행 금지')),
 'status','awaiting_approval','external_execution','requires_separate_approval','execution_started',false);
end $fn$;
revoke all on function nexus_production_private.free_plan(uuid) from public,anon,authenticated,service_role;

create function nexus_production_private.free_cycle() returns integer language plpgsql security definer set search_path='' as $fn$
declare r public.solq_free_plan_runs; a public.applications; p jsonb; pid uuid; jid uuid; n integer:=0; stage jsonb;
begin
 if not pg_try_advisory_xact_lock(68170223) then return 0;end if;
 insert into public.solq_free_plan_runs(application_id)
 select x.id from public.applications x where x.created_at>=(select capture_from from nexus_production_private.free_plan_settings where singleton)
 and x.status<>'cancelled' and not exists(select 1 from public.solq_free_plan_runs f where f.application_id=x.id) order by x.created_at limit 100
 on conflict(application_id) do nothing;
 for r in select * from public.solq_free_plan_runs where status in ('pending','retry_wait') and attempts<3 and next_attempt_at<=now() order by created_at for update skip locked limit 50 loop
  update public.solq_free_plan_runs set attempts=attempts+1,updated_at=clock_timestamp() where application_id=r.application_id;
  begin
   select * into strict a from public.applications where id=r.application_id for update;
   select id into pid from public.ai_work_plans where application_id=a.id;
   if pid is not null then
    update public.solq_free_plan_runs set status='existing_plan',plan_id=pid,updated_at=clock_timestamp() where application_id=a.id;
    continue;
   end if;
   p:=nexus_production_private.free_plan(a.id);
   insert into public.ai_work_plans(application_id,created_by,plan) values(a.id,null,p) returning id into pid;
   insert into public.orchestrator_jobs(created_by,idempotency_key,instruction,agent,status,application_id,free_plan_id)
   values(null,a.id,'무료 규칙 기반 계획 검토: '||a.receipt_number,'internal','awaiting_approval',a.id,pid) returning id into jid;
   for stage in select value from jsonb_array_elements(p->'details') loop
    insert into public.orchestrator_tasks(job_id,ordinal,kind,agent,status,attempts,result,verified)
    values(jid,(stage->>'ordinal')::integer,(p->'steps')->>((stage->>'ordinal')::integer-1),'internal',
     case when (stage->>'ordinal')::integer=6 then 'awaiting_approval' else 'completed' end,1,
     jsonb_build_object('application_id',a.id,'plan_id',pid,'source_hash',p->>'source_hash','stage',stage,'paid_calls',0),
     (stage->>'ordinal')::integer<6);
   end loop;
   insert into public.orchestrator_events(job_id,event,code) values(jid,'free_plan_automatically_saved','rules_only'),(jid,'awaiting_approval','no_paid_execution');
   update public.solq_free_plan_runs set status='awaiting_approval',plan_id=pid,job_id=jid,error_code=null,updated_at=clock_timestamp() where application_id=a.id;
   n:=n+1;
  exception when others then
   update public.solq_free_plan_runs set status=case when attempts>=3 then 'failed' else 'retry_wait' end,
    error_code='free_plan_failed_'||sqlstate,error_history=error_history||jsonb_build_array(jsonb_build_object('attempt',attempts,'code',sqlstate,'at',clock_timestamp())),next_attempt_at=now()+make_interval(mins=>least(10,attempts)),updated_at=clock_timestamp() where application_id=r.application_id;
  end;
 end loop;
 return n;
end $fn$;
revoke all on function nexus_production_private.free_cycle() from public,anon,authenticated,service_role;

-- Production approval, queue/claim, and direct status writes all require a real quotation record.
create function nexus_production_private.guard_quote() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.status in ('queued','running','awaiting_review','released') or new.production_approved_at is not null then
  if not exists(select 1 from public.solq_quote_acceptances q where q.id=new.quote_acceptance_id and q.application_id=new.application_id) then raise exception 'verified customer quotation acceptance required' using errcode='42501';end if;
 end if;
 return new;
end $fn$;
revoke all on function nexus_production_private.guard_quote() from public,anon,authenticated,service_role;
create trigger solq_quotation_guard before insert or update on public.production_jobs for each row execute function nexus_production_private.guard_quote();
create function nexus_production_private.guard_application_quote() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.status is distinct from old.status and new.status in ('in_progress','completed') and not exists(select 1 from public.production_jobs j join public.solq_quote_acceptances q on q.id=j.quote_acceptance_id and q.application_id=j.application_id where j.application_id=new.id) then raise exception 'verified customer quotation acceptance required' using errcode='42501';end if;
 return new;
end $fn$;
revoke all on function nexus_production_private.guard_application_quote() from public,anon,authenticated,service_role;
create trigger solq_application_quotation_guard before update of status on public.applications for each row execute function nexus_production_private.guard_application_quote();
CREATE OR REPLACE FUNCTION nexus_production_private.tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a record;j record;n int:=0;
begin
 if not pg_try_advisory_xact_lock(68170222) then return 0;end if;
 for a in select x.id from public.applications x where x.created_at >= (select capture_from from nexus_production_private.settings where singleton)
 and not exists(select 1 from public.production_jobs y where y.application_id=x.id) order by x.created_at limit 50 loop
  perform nexus_production_private.enroll(a.id);n:=n+1;
 end loop;
 for j in select p.id,src_app.status from public.production_jobs p join public.applications src_app on src_app.id=p.application_id
 where p.status in ('awaiting_deposit','queued') for update of p skip locked loop
  if j.status='cancelled' then
   update public.production_jobs set status='cancelled',updated_at=now() where id=j.id;
   insert into public.production_events(job_id,event) values(j.id,'application_cancelled');
  elsif j.status in ('deposit_confirmed','in_progress') and exists (select 1 from public.production_jobs q join public.admin_users u on u.user_id=q.production_approved_by where q.id=j.id and q.production_approved_at is not null and q.payment_observed_at is not null and exists(select 1 from public.solq_quote_acceptances qa where qa.id=q.quote_acceptance_id and qa.application_id=q.application_id)) then
   update public.production_jobs set status='queued',payment_observed_at=coalesce(payment_observed_at,now()),updated_at=now() where id=j.id and status='awaiting_deposit';
   if found then insert into public.production_events(job_id,event) values(j.id,'admin_deposit_confirmation_observed');end if;
  else update public.production_jobs set status='awaiting_deposit' where id=j.id and status='queued';end if;
 end loop;
 for j in select id from public.production_jobs where status='running' and lease_until<now() for update skip locked loop
  update public.production_jobs set status='failed',error_code='execution_outcome_unknown_no_retry',lease_token=null,lease_until=null,updated_at=now() where id=j.id;
  update public.production_attempts set status='unknown',error_code='lease_expired_no_retry',completed_at=now() where job_id=j.id and status='reserved';
  insert into public.production_events(job_id,event) values(j.id,'execution_unknown_no_retry');
 end loop;
 perform nexus_production_private.free_cycle();
 return n;
end $function$;

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
end $function$;

CREATE OR REPLACE FUNCTION nexus_production_private.command(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.production_jobs;a public.applications;c nexus_production_private.providers;k text;h text;r text;v uuid;cost bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server required' using errcode='42501';end if;
 if p_action in ('snapshot','issue_link','release') and not exists(select 1 from public.admin_users where user_id=(p_data->>'actor')::uuid) then raise exception 'admin required' using errcode='42501';end if;
 if p_action='submit' then
  k:=p_data->>'token';
  if k is null or k !~ '^[a-f0-9]{64}$' or p_data->>'privacy_consent' is distinct from 'true' or p_data->>'transfer_consent' is distinct from 'true'
   or coalesce(length(btrim(p_data->>'customer_name')),0) not between 1 and 100
   or coalesce(length(btrim(p_data->>'contact')),0) not between 3 and 200
   or coalesce(length(btrim(p_data->>'description')),0) not between 1 and 5000
   or coalesce(p_data->>'service_type','') not in ('website','ai_automation','custom_system','consulting') then raise exception 'invalid order';end if;
  h:=encode(sha256(convert_to((p_data-'token')::text,'UTF8')),'hex');
  -- Serialize the same capability so retries cannot create duplicate customer records.
  perform pg_advisory_xact_lock(hashtextextended(k,0));
  select p.* into j from public.production_jobs p join nexus_production_private.access_keys x on x.job_id=p.id where x.token_hash=encode(sha256(convert_to(k,'UTF8')),'hex');
  if j.id is not null then
   if (select request_hash from nexus_production_private.access_keys where job_id=j.id) is distinct from h then raise exception 'idempotency conflict';end if;
  else
   insert into public.applications(customer_name,contact,service_type,description,privacy_consent,status,internal_note)
   values(btrim(p_data->>'customer_name'),btrim(p_data->>'contact'),p_data->>'service_type',btrim(p_data->>'description'),true,'received',null) returning * into a;
   v:=nexus_production_private.enroll(a.id);select * into strict j from public.production_jobs where id=v;
   insert into nexus_production_private.access_keys(job_id,token_hash,request_hash) values(j.id,encode(sha256(convert_to(k,'UTF8')),'hex'),h);
  end if;
  return jsonb_build_object('receipt_number',j.receipt_number,'status',j.status,'preview',j.plan-'requirements');
 elsif p_action='portal' then
  k:=p_data->>'token';if k is null or k !~ '^[a-f0-9]{64}$' then return 'null'::jsonb;end if;
  select p.* into j from public.production_jobs p join nexus_production_private.access_keys x on x.job_id=p.id
   where p.receipt_number=p_data->>'receipt_number' and x.token_hash=encode(sha256(convert_to(k,'UTF8')),'hex');
  if j.id is null then return 'null'::jsonb;end if;
  return jsonb_build_object('receipt_number',j.receipt_number,'status',j.status,'preview',j.plan-'requirements','result',case when j.status='released' then j.result else null end,'released_at',j.released_at);
 elsif p_action='snapshot' then
  return jsonb_build_object('jobs',(select coalesce(jsonb_agg(x),'[]'::jsonb) from(select * from public.production_jobs order by created_at desc limit 30)x),
   'providers',(select jsonb_agg(jsonb_build_object('provider',provider,'enabled',enabled,'verified_at',verified_at,'readiness',readiness,'heartbeat_at',heartbeat_at)) from nexus_production_private.providers),
   'attempts',(select coalesce(jsonb_agg(x),'[]'::jsonb) from(select * from public.production_attempts order by created_at desc limit 100)x),
   'events',(select coalesce(jsonb_agg(x),'[]'::jsonb) from(select * from public.production_events order by id desc limit 100)x));
 elsif p_action='issue_link' then
  select * into strict j from public.production_jobs where id=(p_data->>'job_id')::uuid for update;
  k:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into nexus_production_private.access_keys(job_id,token_hash) values(j.id,encode(sha256(convert_to(k,'UTF8')),'hex')) on conflict(job_id) do update set token_hash=excluded.token_hash,request_hash=null;
  insert into public.production_events(job_id,event) values(j.id,'customer_access_link_issued');
  return jsonb_build_object('receipt_number',j.receipt_number,'token',k);
 elsif p_action='release' then
  select * into strict j from public.production_jobs where id=(p_data->>'job_id')::uuid for update;
  if j.status<>'awaiting_review' or j.result_hash is distinct from p_data->>'expected_hash' then raise exception 'review stale or result unavailable';end if;
  if not exists(select 1 from public.applications where id=j.application_id and status in ('deposit_confirmed','in_progress','completed')) then raise exception 'payment not confirmed';end if;
  update public.production_jobs set status='released',released_by=(p_data->>'actor')::uuid,released_at=now(),updated_at=now() where id=j.id;
  insert into public.production_events(job_id,event) values(j.id,'reviewed_result_released_to_customer_portal');return '{"released":true}'::jsonb;
 elsif p_action='heartbeat' then
  update nexus_production_private.providers set heartbeat_at=now(),readiness=case when p_data->>'ready'='true' then 'ready' else 'authentication_or_runtime_missing' end where provider=p_data->>'provider';
  return '{"saved":true}'::jsonb;
 elsif p_action='claim' then
  perform nexus_production_private.tick();
  select * into c from nexus_production_private.providers where provider=p_data->>'provider' for update;
  if c.provider is null then raise exception 'unsupported provider';end if;
  if not c.enabled or c.verified_at is null or c.verified_at<now()-interval '1 hour' or c.approved_calls<=c.reserved_calls or c.model is null then return jsonb_build_object('blocked','provider_not_enabled_or_verified');end if;
  cost:=case when c.provider='openai' then (24096::bigint*c.input_micro_per_token+4096::bigint*c.output_micro_per_token) else 0 end;
  if c.provider='openai' and (c.input_micro_per_token<=0 or c.output_micro_per_token<=0 or c.reserved_micro_usd+cost>c.approved_micro_usd) then return jsonb_build_object('blocked','approved_budget_exhausted');end if;
  select p.* into j from public.production_jobs p join public.applications src_app on src_app.id=p.application_id
   where p.status='queued' and exists(select 1 from public.solq_quote_acceptances qa where qa.id=p.quote_acceptance_id and qa.application_id=p.application_id) and p.provider=c.provider and p.attempt_count=0 and p.payment_observed_at is not null and p.production_approved_at is not null and exists (select 1 from public.admin_users u where u.user_id=p.production_approved_by) and src_app.status in ('deposit_confirmed','in_progress')
   order by p.created_at for update of p skip locked limit 1;
  if j.id is null then return 'null'::jsonb;end if;
  update nexus_production_private.providers set reserved_calls=reserved_calls+1,reserved_micro_usd=reserved_micro_usd+cost where provider=c.provider;
  update public.production_jobs set status='running',attempt_count=1,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() where id=j.id returning * into j;
  insert into public.production_attempts(job_id,provider,reserved_micro_usd) values(j.id,c.provider,cost);
  insert into public.production_events(job_id,event) values(j.id,'agent_execution_reserved');
  return jsonb_build_object('id',j.id,'lease',j.lease_token,'provider',c.provider,'model',c.model,'plan',j.plan,'max_output_tokens',4096,'execution_authorized',true);
 elsif p_action='finish' then
  select * into strict j from public.production_jobs where id=(p_data->>'job_id')::uuid for update;
  if j.status<>'running' or j.lease_token is distinct from (p_data->>'lease')::uuid or j.lease_until<now() then raise exception 'stale execution lease';end if;
  if p_data->>'success'='true' then
   if jsonb_typeof(p_data->'result') is distinct from 'object' or jsonb_typeof(p_data->'result'->'files') is distinct from 'array'
    or jsonb_array_length(p_data->'result'->'files') not between 1 and 12 or octet_length((p_data->'result')::text)>100000
    or p_data->'validation'->>'passed' is distinct from 'true' then raise exception 'unverified result';end if;
   update public.production_jobs set status='awaiting_review',result=p_data->'result',validation=p_data->'validation',result_hash=encode(sha256(convert_to((p_data->'result')::text,'UTF8')),'hex'),lease_token=null,lease_until=null,updated_at=now() where id=j.id;
   update public.production_attempts set status='succeeded',usage=p_data->'usage',completed_at=now() where job_id=j.id and status='reserved';
   insert into public.production_events(job_id,event) values(j.id,'generated_artifact_verified_awaiting_admin_review');
  else
   r:=case when p_data->>'error_code' in ('provider_failed_or_unknown','invalid_artifact','runtime_failed','budget_gate_closed') then p_data->>'error_code' else 'runtime_failed' end;
   update public.production_jobs set status='failed',error_code=r,lease_token=null,lease_until=null,updated_at=now() where id=j.id;
   update public.production_attempts set status='failed_or_unknown',error_code=r,completed_at=now() where job_id=j.id and status='reserved';
   insert into public.production_events(job_id,event) values(j.id,'agent_execution_failed_no_auto_retry');
  end if;
  return '{"saved":true}'::jsonb;
 else raise exception 'unsupported command';end if;
end $function$;



