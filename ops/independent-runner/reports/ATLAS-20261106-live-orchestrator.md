# SOLQ 실제 오케스트레이터 운영 점검
관측: **2026-11-06 05:41–05:44 KST**. 실행: 현재 Work 세션. 기존 예약 작업을 실행·중단·재구축하지 않았다.

## 결론
**DB 예약 처리 정상 관측 / 홈페이지·관리자 전체 실동작 미검증 / 변경 배포 보류.**
기존 서비스는 유지했다. 손상 복구 작업을 수행한 것이 아니며, 기존 51 PASS는 비운영 증거로 재사용하고 운영 전체 PASS로 확대하지 않았다.

## 새 읽기 전용 증거
|항목|실제 결과|판정 범위|
|---|---|---|
|nexus-free-orchestrator|활성·매분·최근 1시간 성공60/실패0|cron SQL 실행 성공|
|nexus-production-capture|활성·매분·최근 1시간 성공60/실패0|cron SQL 실행 성공|
|worker_state|05:42 시작·완료, 오류 없음|내부 예외를 잡고 반환할 가능성을 별도 상태로 대조|
|신청/계획/기존 작업|9/6/7|현재 집계|
|개인정보 동의/접수번호|동의 누락0·번호 중복그룹0|기존 기록, 신규 제출 시험 아님|
|무료 계획|6건 모두 steps 6개. 2건은 details 6개, 나머지4건 details 없음|계획 품질/상세도가 동일하다는 의미 아님|
|자동 계획 실행|2건 awaiting_approval, 각 연결작업6개 중 승인대기1개|무료 단계·관리자 검토 분리|
|자동 계획 오류|failed/retry_wait 0|현재 기록 집계|
|무계획 신청|3건 모두 capture_from 이전; cancelled/reviewing/received 각1|임의 소급 생성하지 않음|
|자동처리 범위 내 무계획|0|현재 backlog 없음, 신규 접수 시험은 아님|
|계획 연결/중복|미존재 신청 참조0·신청당 계획 중복그룹0|기존 작업 중복은 정리하지 않음|
|제작 관리|6건=awaiting_deposit5/cancelled1|실제 제작 진행 상태 없음|
|견적 수락/제작 시도|0/0|계약 흐름 실제 사용 완료 증거 없음|
|선행조건 누락 실행상태|0|queued/running/awaiting_review/released 자체가 없어 부정 실행 시험 PASS는 아님|
|내용 보존|9/6/7 테이블의 전체 행 내용 지문 점검 중 전후 일치|과거 다른 산식 지문과 비교하지 않음|

## 실제 자동화 연결
- free-orchestrator → nexus_orchestrator_private.run_cycle: 내부 요구사항·범위·기본검증을 규칙으로 처리하고 human_review에서 멈춘다. 아래 무료6단계 생성 경로와 구분한다.
- production-capture → nexus_production_private.tick → free_cycle: 처리 시작일 이후 신청을 추적하고 기존 계획은 재사용한다. 새 계획은 연결 작업·6단계와 함께 저장한다.
- free_cycle의 advisory lock·신청 잠금·등록 충돌 처리·실패 하위 트랜잭션·최대3회 제한 재시도 정의를 읽었다. 실제 동시성/롤백 시험은 기존51 PASS를 재사용했다. 운영 함수를 직접 호출하지 않았다.
- 일반 무료 계획 생성에는 외부 AI 호출이 없다. run_cycle에는 과거 연결시험 분기가 있지만 현재 test_requested=false, test_dispatched=true다. 해당 분기를 실행하지 않았다.

## 제작 승인·비용 통제
운영 approve 정의에서 authenticated 관리자, 수동 입금 확인 상태, 동일 신청 견적 수락 연결, 별도 제작 승인 및 반복 승인 재사용을 확인했다. tick은 견적·입금 관측·등록 관리자 승인을 함께 요구한다. 견적/제작 승인 guard 트리거4개와 공개 접수 캡처 트리거가 활성이다.

applications/ai_work_plans/admin_users/production_jobs/solq_quote_acceptances는 RLS 활성이다. 활성 플래그만으로 모든 정책 안전성을 PASS 처리하지 않았다. solq_approve_production은 anon 실행 불가, authenticated 실행 가능하며 본문에서 관리자 검증한다.

제작 제공자 openai/codex는 모두 enabled=false, 승인·예약 호출 및 예산0이다. Claude 작업은 무료 run_cycle에서 차단 사유로 처리한다. Vault 키 유효성/Console 청구는 미확인이다. 견적 수락0건의 원인을 API 고장이나 고객 거절로 단정하지 않는다. 이번 유료 호출·고객 발송·실제 제작0건이다.

## 홈페이지·관리자·Edge
- Sites 관리 API: public, https://solqtech.com, 버전28, 해당 배포 succeeded. 소스는 Sites 저장소 ab4d34c830669e69b57f0689588eb6a24b41f91e다. GitHub main/개발 브랜치를 배포본과 동일시하지 않았다.
- 공개 웹 조회 도구는 메인/workflow-guide에 Internal Error를 반환했다. 사이트의 HTTP 오류코드가 아니므로 장애를 확정하지 않는다.
- 현재 연결 실행 환경 unavailable, 브라우저 제어 도구 없음. PC·Android·iOS 입력·동의·제출·접수번호, 관리자 실제 로그인·조회·상태 변경은 미검증이다. 운영 고객으로 시험 신청/상태 변경하지 않았다.
- Edge 활성4개: nexus-ai v4, nexus-orchestrator v7, nexus-agent-worker v2, nexus-production v1.
- **연결 위험:** 실제 nexus-production v1 handler의 허용 Origin은 https://holykjh1425-stack.github.io 하나다. solqtech.com 브라우저의 직접 호출은 소스상 거부된다. Sites 서버 프록시 경유 여부는 미확인이다. 따라서 홈페이지 경로의 실제 실패로 단정하거나 CORS를 임의 확대하지 않았다.
- **관리자 후보 위험:** 개발 브랜치 orchestrator-admin.js는 15초마다 refresh(true) → tick을 호출한다. admin.js의 신청 알림 조회 전용 처리와 구별해야 한다. 현재 Sites 배포본에서 해당 스크립트를 불러오는지는 미확인이다. 안전화 후보와 배포본 대조 전에 관리자 로그인 시험을 강행하지 않는다.

## 미완료 및 재개 조건
1. 보호된 PC/모바일 실행 경로에서 현재 버전28의 실제 신청/API/관리자 스크립트 경로를 확인한다. 기존 예약 작업을 중단할 필요는 없다.
2. 기존 안전화 후보를 재사용하고 신규 변경 부분만 보호 비운영 환경에서 검증한다. 실제 고객 상태나 신규 운영 신청으로 시험하지 않는다.
3. 견적 발행·동의 저장·고객 제공 화면의 실제 연결을 확인한다. 동의 기록0건을 임의 생성하지 않는다.
4. 직접 Edge 호출 여부가 확인되면 CORS 후보/서버 프록시 중 필요한 최소 수정만 검증한다. 현재 실행환경이 없어 추정 패치·배포는 하지 않았다.
5. 백업·격리 복원·최종 보안·실기기·롤백은 기존 미완료 상태다. 이것이 시스템 손상 증거는 아니며 정상 cron을 중단할 이유로 사용하지 않았다.
6. 유료 AI가 필수일 때만 필요성·모델·토큰·호출수·예상상한을 먼저 보고하고 별도 승인받는다. 이번에는 유료 호출이 필요하지 않았다.

## 비용·보존·기록
운영 SQL 쓰기/스키마/RLS/Auth/Vault/SSL/cron/Edge 변경0, 사이트 배포/main 병합0, 고객 수정·삭제0, 신규 유료 자원/API/광고 지출0.
개발 브랜치에는 본 보고와 개인정보 없는 집계 증거만 추가한다. 다른 워커 상태·예약 자동화는 변경하지 않는다.
원본 고객 행·이메일·요구사항·토큰·키·로그 본문을 증거에 넣지 않는다.

**고객 접수 가능 여부:** 기존 접수 저장 이력과 무료 자동 처리 가동은 확인. 현재 PC·모바일→관리자→계약 전체 정상 동작 확정은 미검증. 기존 서비스 유지, 신규 변경 배포 보류.
