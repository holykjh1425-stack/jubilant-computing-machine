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
