# SOLQ 통합 오케스트레이션 후보 — 2026-11-01

판정: **후보 구현 및 합성 격리 검증 완료 / 운영 반영 보류**.

기준은 dev/solq-cost-control-20261028의 45d777df70b53a43d011e6008a8ec7edc8f37e2b이다. 새 브랜치는 dev/solq-integrated-orchestration-20261101. 운영 SQL/Edge/Sites/main 수정 없음. 다른 Work 작업을 시작하거나 중지하지 않았다. 외부 세션의 실행 상태를 단정할 수 없으므로 공용 브랜치를 수정하지 않고 새 후보 경로만 추가했다.

## 실제 확인 및 재사용

- 2026-11-01 14:59:23~15:01:42 KST, 운영 SELECT 집계만 수행. 시작/종료 모두 신청9·계획6·작업7. 세 테이블 전체 행 내용 지문, pg_policies 전체 정책 지문, cron 예약 명령 지문 일치. 실제 행/연락처/키를 출력하거나 백업으로 반출하지 않았다. preservation.json 참조.
- 신청 상태는 received5, reviewing3, cancelled1. 작업7개는 awaiting_approval. ai_work_plans에는 status 열이 없으며 상태를 새로 만들지 않았다. 최초 상태 집계가 해당 열 부재로 실패했고 이후 메타데이터 확인으로 수정했다. 쓰기는 없었다.
- 운영 Edge 목록: nexus-ai v4, nexus-orchestrator v7, nexus-agent-worker v2, nexus-production v1. 목록 조회는 실행/인증 성공 증거가 아니다. 뒤의 두 함수 verify_jwt=false는 함수 내부 통제까지 확인했다는 의미가 아니다.
- cron 활성2개: 매분 nexus_orchestrator_private.run_cycle, nexus_production_private.tick. 이 설정은 Work와 독립적인 서버 실행 경로의 존재를 보여주지만 실제 무료 처리 완료/24시간 가동 보장은 아니다. 함수 호출 및 tick 실행 없음.
- 기존 엔진 supabase/functions/nexus-orchestrator/engine.mjs는 고정 커밋 원격 blob ce7c7ce0d4a57570d45e8ea52327ba13d2fba578과 로컬 git hash-object 일치. requirements/scope/validation/human_review를 재사용하여 기존 6단계 계획을 유지했다.
- 기존 tests/plan-postgres/results.json의 native PostgreSQL9 PASS 및 tests/cost-control/validation.json의33 PASS, ops/phase1-readiness-20261101의14+1 PASS 자료를 재사용했다. 과거100/32독립연결 검증을 반복하지 않았다. 이번32요청은 **새 조정기 합성 fixture**에 대한 별도 동시 호출이며 독립 DB 연결 테스트가 아니다.
- 홈페이지와 신청/관리자 자산은 수정하지 않았다. PC/모바일은 기존 버전28 및 phase1 보호 파일 증거를 재사용. 이번 실기기/새 로그인/운영 신청 제출은 미실행이다.

## 역할과 권한

| 담당 | 책임 | 허용하지 않는 실행 |
|---|---|---|
| Work | 코드 개발·검증·위험 보고 | 상시 서버라고 가정, 무승인 운영 반영 |
| 중앙 조정기 | 인증된 서버 작업 배정, 중복 검사, 저장·감사 트랜잭션 | 브라우저 조회에서 생성, Work/Claude 자동 호출 |
| 무료 엔진 | 규칙 기반 분류·6단계 계획·기본 검증 | 실제 제작·납품·고객 자동 발송 |
| Claude | 무료 대체 불가능한 고난도 분석 후보 | 이번 구현의 실호출 전부 |
| 관리자 | 견적·은행 입금 수동 확인·제작/유료/API/배포 승인 | 동의·입금·제작 승인의 자동 합치기 |

서버 예약 처리와 Work 개발은 분리한다. Work가 종료되어도 기존 cron/Edge 경로가 유지된다. 단, 후보가 서버에 배포되어 검증된 것이 아니므로 목표 구조의 운영 정상화 완료를 선언하지 않는다.

## 신규 코드와 경계

coordinator.mjs는 기존 순수 규칙 엔진을 조합한다. 외부 요청/키/네트워크 어댑터, DB 연결정보, 운영 실행 경로는 포함하지 않는다.

- 기본 무료 계획·분류는 무료 엔진 우선, 고난도 분석·검토만 Claude 후보, 나머지는 수동 검토.
- 신청/tenant UUID와 접수번호 형식 검사. 서버 authorize adapter로 작업 실행 자격 확인. 저장소가 트랜잭션·신청 잠금·전역 접수번호 유일성·tenant 제한·계획/작업 원자 저장·감사 실패 롤백을 제공해야 한다. 메모리 fallback은 없다.
- 기존 계획/작업은 재사용. 한쪽만 있거나 연결/6단계가 잘못되면 관리자 검토. 과거 중복은 삭제하지 않는다. 규칙 계산 실패는 관리자 확인 상태로 남기고, 명시적 후속 dispatch에서만 최대2회까지 허용한다. 타임아웃/응답 유실/저장 오류 뒤 자동 재실행하지 않는다.
- 작업 상태는 기존 awaiting_approval을 사용하고 논리 단계는 STATE_MAP으로 구분한다. 새로운 운영 상태/스키마를 만들지 않았다. 계획 생성은 제작 또는 납품 완료가 아니다.
- 감사 기록은 신청 UUID, 이벤트, 엔진, 시도, 유료 호출수만. 고객 요청 원문·토큰·연락처를 감사 항목에 복제하지 않는다.
- Claude 승인 검사에는 신청·요청 digest·만료·호출1회·양의 비용 한도가 필요하다. **승인 조건이 맞아도 live_transport_disabled**. 실제 제공자 전송/예산 소비가 없는 후보다. 기존 비용 통제의 가격·모델 문자열을 실제 사용 가능하다고 간주하거나 다시 연결하지 않았다.
- 제작 조건 검사는 기본형10만원에 한정: 견적 동의, 동일 신청/견적의3만원 수동 확인, 그 이후 별도 제작 승인. 7만원 잔금/선택 유지관리 정책 불변. 맞춤형 계약은 기존 서버 견적 원장을 사용해야 하며 이 단순 gate를 확장 적용하지 않는다.

**중요:** verifiedByServer 필드와 authorize callback은 검증된 서버 어댑터의 반환값이라는 계약이다. 클라이언트 JSON을 그대로 넘기면 보안 통제가 아니다. 공개 HTTP endpoint를 만들지 않았다. 실제 JWT/admin_users/RLS·최신 견적·철회/만료·승인 원장 검사 및 원자 claim은 기존 SQL/Edge 통제와 실제 통합 검증으로 보완해야 한다. productionGate true도 실행 승인이 아니며 executeProduction은 항상 차단한다.

## 새 검증

results.json: **19 PASS / 0 FAIL**. node test.mjs로 실행한 새 조정기만의 결과다. 기존 테스트를 다시 돌리지 않았다. source SHA-256 포함.

검증: 무료 우선/수동 분류,32동시요청 한 쌍,재호출 재사용,비인가/tenant거부,접수번호 충돌,6단계/실행 미시작,저장 및 감사 실패 롤백,commit 실패,commit 성공 후 응답 유실 재사용,계산 실패 횟수 제한,timeout,잘못된 계획 차단,기존 불완전 연결 보존,Claude 승인/만료/범위/실호출 차단,제작3조건 분리,전송함수 차단,감사 정보 최소화/자격증명 형태 입력 거부.

이는 합성 신원/메모리 트랜잭션 fixture다. **실제 Supabase Auth/RLS/Edge/PostgreSQL 통합은 이번 결과로 PASS 처리하지 않는다.** Node JS 구문 검사 및 재사용 엔진 원격 blob 대조 PASS. API 호출0·실제 비용$0·운영 DML/DDL0.

## 기존 연결 차이 — 자동 정리 금지

기준 기록 미연결4/논리중복1쌍과 현재 정의별 집계는 직접 같다고 볼 수 없다.

- application_id/free_plan_id 모두 NULL:5건.
- 그중 과거 idempotency_key=plan.id로 추적되는 작업4건, 해당 경로로 추적 불가1건.
- 과거 plan/application 키를 함께 대조해 작업2개 이상이 연결되는 신청 그룹2개. 계획 없는 신청 참조(plan orphan)0.

정의 차이를 제외하고도 과거1쌍과의 차이 원인은 현재 전체 집계만으로 확정되지 않는다. 작업 시작/종료 지문은 같으므로 이번 작업 중 생성/변경된 증거는 없다. 새 UNIQUE 제약을 기존 데이터에 즉시 적용하면 실패할 수 있다. **삭제·재연결·상태 변경 없이 비식별 운영 매핑 검토 후 적용 가능성을 확정해야 한다.**

## 운영 배포 순서와 롤백

1. 최신 전체 암호화 백업 + 무결성 + 보호된 실제 격리 복원 성공 증거 확보. 현재 DB 비밀번호 미확보,SSL OFF,Temporary access 미확인 상태이며 변경 승인 없음. 지원 문의는 직전 발송 보류 상태로 공식 회신을 받았다고 간주하지 않는다. 백업/복원 실행 없음.
2. 보호된 기존 비운영 환경에서 실제 Auth/admin_users/RLS, 서버 저장 adapter의 원자성·receipt 유일성·중복 이력 처리·감사·lease/만료, 기존 Edge와 새 quote API를 연결 검증. fixture를 운영 저장소로 사용하지 않는다.
3. 기존 SQL 후보 link-guard → quote-evidence → quote-deposit-guard를 실제 기존 중복 보존 조건으로 사전 검토. 무료 서버 처리를 끄는 approval-gate.sql은 제외. 이번에 추가 SQL을 쓰거나 실행하지 않았다.
4. 기존 서버 API/DB 가드 → 조회 전용 관리자 후보 순서. 이 coordinator는 추가 후보이며 검증된 서버 adapter/단일 dispatcher로 연결하기 전 배포 대상이 아니다. 기존 free_cycle과 새 dispatcher를 동시에 생성자로 두지 않는다.
5. 모든 필수 증거와 사용자 별도 운영 승인을 받은 뒤 필요한 파일만 반영. Sites 버전28의 디자인/신청/정책/공유설정은 유지. 유료 API는 계속 OFF.
6. 오류 시 새 dispatcher/쓰기 진입만 중단, 안전한 읽기 전용 관리자 유지. 과거 자동 생성 관리자 파일로 무조건 되돌리지 않는다. 기존 행 삭제/파괴적 down migration 금지. 정상 서버 무료 경로를 보존한 상태로 검증된 manifest의 역순 복구 및 지문 대조. 복원/DB 변경은 별도 승인된 실행 계획에서만.

중단 조건: 인증/권한 불일치,연결 불명·중복 제약 충돌,백업/복원 미완료,감사 누락,unknown commit/비용,무료 엔진이 유료 엔진으로 fallback,기존 신청·디자인 변화. 현재 필수조건 미충족이므로 **운영 반영은 보류**한다.

## 다음 작업 및 승인

새 계정/키/서버/비용 승인 요청 없음. 지금 필요한 것은 공식 백업 지원 답변 확보와 보호된 기존 비운영 인증/저장 어댑터 검증이다. 이번 후보를 운영에 설치하거나 cron 변경하지 않는다. 실제 인증,전체 백업/복원,과거 연결 정의 검토 후 별도 배포 승인만 요청한다.
