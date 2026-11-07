# SOLQ 중복 생성 원인 제거 수정 — 2026-10-26 KST

기준: f44e5b179e37d86dcae2e76706216c28bb700876. 지정 작업 브랜치 전용. 운영 배포/DB 변경 없음.

## 1. 직접 원인과 증거 구분
운영 배포본 admin.js의 processNew는 최근 신청을 조회한 뒤 free.plan → free.assign을 호출한다. 30000ms 타이머가 processNew를 반복 호출하고, planControls의 렌더링도 같은 생성을 자동 호출한다. 로그인 → enterDashboard → load → render → planControls로 이어져 로그인/목록 표시가 쓰기를 발생시킨다. free.assign은 계획 ID를 idempotency_key로 조회/등록하지만 정상 DB free_cycle은 신청 ID를 키로 사용한다. 구 서버 command('submit')는 키의 unique 충돌만 처리하고 application_id/free_plan_id를 저장하지 않아 같은 계획의 두 경로가 서로 다른 키로 통과한다. 브라우저 Map/navigator.locks는 서버 워커와 여러 기기 사이의 중복을 막지 못한다.

실제 읽기 전용 로그: 2026-10-26 14:33:23 KST OPTIONS, 14:33:25 및 14:33:32 KST nexus-orchestrator POST 200. 기존 작업/이벤트 기록상 해당 시각 추가 미연결 작업이 submitted → 승인 대기로 진행했다. 이 로그에는 action/body/브라우저 호출 스택이 없어 클릭과 폴링 중 실제 발생 주체는 확정하지 않는다. 정상 free_cycle 생성과 이후 구 등록 경로가 겹친다는 분석과 요청 주체의 미확정을 구분한다.

## 2. 수정 파일/함수
- admin.html/admin.js: 후보 폴더에만 있던 관리자 조회 수정을 저장소 최상위 배포 대상에 반영. enterDashboard/load/render/planControls는 조회만 실행. 타이머는 snapshot 조회 Promise만 대기한다.
- free-workflow.js: createFreeWorkflow는 snapshot 하나만 공개. plan/assign/instruction/fetch 생성 경로 제거. 신청 ID로 서버 연결을 읽고 계획/작업의 고객 일치를 검사한다.
- plan-view.js/admin-review.css/admin-base.css: 기존 호스팅 관리자 스타일과 무료 6단계 표시. 공개 홈페이지 styles.css는 변경하지 않는다.
- vendor/supabase-2.118.0.js: 기존 호스팅 고정 버전 SDK를 보존. admin.html CSP는 로컬 스크립트와 기존 Supabase 연결만 허용. config.js/고객 접수 페이지 변경 없음.
- supabase/functions/nexus-orchestrator/handler.mjs: 관리자 인증 후 submit의 key가 기존 신청 ID 또는 계획 ID이면 409 customer_registration_server_only. 고객 등록은 기존 DB 워커에 남긴다. 조회 실패 시 등록 RPC로 진행하지 않는다. 일반 별도 작업 지시 등록은 유지.
- ops/admin-integration-candidate/link-guard.sql: private guard_customer_link 트리거와 계획별 unique 인덱스 후보. 운영 미적용.

## 3. 제거 경로와 전수 검사
로그인/세션 복원 → 목록 렌더링 → 자동 plan/assign 경로 제거. 30초 processNew 제거. 카드의 계획 생성/작업 배정 버튼 제거. root free workflow의 POST 및 자동 tick 제거.

현 admin.html이 로드하는 사용자 코드: config.js, free-workflow.js, plan-view.js, admin.js. 조회에서 쓰기 API 호출 없음. admin.js에 남은 쓰기는 명시적 버튼 이벤트의 문의 답변 UPDATE, 신청 상태 UPDATE, 별도 제작 승인 RPC이다. 이 버튼은 이번 테스트에서 실행하지 않았다. quote-panel은 의존하지 않으므로 미배포 견적 API가 조회 수정 배포의 의존성이 되지 않는다.

그 밖의 저장소 JS도 검색했다. orchestrator-admin의 submit/tick, production-admin의 issue_link/release, quote-evidence-admin의 증거 명령, support-admin의 답변 UPDATE는 명시적 버튼 경로이고 이 관리자 문서에서는 로드하지 않는다. 이들 코드 자체를 삭제하거나 실제 제작을 활성화하지 않았다. 고객 신청/문의 제출은 별도 사용자 제출 이벤트로 유지된다.

## 4. 서버 원자적 차단
기존 solq_one_free_job_per_application unique 인덱스 및 idempotency_key unique를 유지한다. 신규 solq_one_free_job_per_plan은 free_plan_id IS NOT NULL인 행에만 적용한다. PostgreSQL의 unique 검사가 동일 신청/계획의 동시 INSERT를 원자적으로 차단한다. API의 선행 조회는 사용자에게 오류를 설명하기 위한 검사이며, 최종 방어는 DB 트리거/unique다.

트리거는 신청-계획 관계와 idempotency_key=application_id를 강제하고 연결 ID 변경을 금지한다. 연결 없는 INSERT가 기존 신청/계획 키를 사용하면 구 클라이언트 요청으로 거부한다. 기존 미연결 작업의 실행 상태 진입을 막으며, 같은 키를 가진 역사적 미연결 작업이 있으면 신규 연결 작업 추가도 거부한다. 이미 있는 행의 삭제/수정/재연결은 없다. 기존 정상 free_cycle의 감지·규칙 기반 6단계 계획·작업·단계·이벤트·승인 대기 코드는 변경하지 않는다.

제약 적용 전 연결된 행의 신청별/계획별 중복 및 부분 연결을 읽기 전용으로 점검해야 한다. 기존 논리적 중복은 한쪽 연결 ID가 NULL이므로 새 부분 인덱스 대상에서 제외되며, 이는 데이터 정리가 완료됐다는 뜻이 아니다. 연결된 중복이 별도로 발견되면 인덱스 생성은 실패하고 전체 트랜잭션을 롤백한다. 자동 정리하지 않는다. 별도 방안: 식별 근거/작업·단계·이벤트 영향 확인 → 관리자가 대표 작업/보존 방식 승인 → 별도 데이터 마이그레이션 설계. 이번 SQL에는 데이터 정리 명령이 없다.

## 5. 재현 및 결과
수정에 직접 관련된 새 테스트만 실행했다. 기존 14개/16회/100건 테스트 모음은 재실행하지 않았다.

```
node --test tests/duplicate-fix-api.test.mjs tests/duplicate-fix-db.test.mjs
NODE_PATH=<Playwright 설치 경로> SOLQ_QA_BROWSER=<Chromium 실행 파일> node tests/admin-duplicate-fix-ui.cjs
```

- 신규 Node 테스트 3개 통과/실패 0.
- API: 신청 키 100개, 계획 키 100개의 동시 요청 각각 모두 409, 등록 RPC 0회. 인증/백엔드 조회 실패 차단 및 별도 일반 작업 명령 유지 통과. 합성 Auth/fetch 어댑터 사용.
- 내장 PostgreSQL(PGlite 0.5.11): 겹쳐 실행한 워커 요청 100회 후 신규 신청의 계획 1/작업 1/단계 6, 마지막 단계 awaiting_approval. 동일 신청 원자적 INSERT 요청 100개 중 INSERT 결과 1개. 신청/계획 기준 구 등록 거부, 고객 간 연결 오류/재연결/미연결 실행 거부 통과.
- 합성 역사적 미연결 4개 + 논리적 중복 쌍을 포함한 5개 작업 전체 JSON 전후 동일. 실제 고객 원문을 격리 DB에 복사하지 않음. 제작 시도 0.
- 실제 Chromium 1440px/390px 각각 로그인 100회 + 목록 갱신 100회 + 30초 타이머 콜백 100회 + 계획 조회 100회. 쓰기 호출 0, 6단계 내용/상태 정상, 가로 넘침/JS 오류 0. 캡처는 합성 고객만 포함. 타이머는 콜백을 제어해 검증했으며 실제 50분 대기를 수행한 것은 아니다.
- 최초 Chromium 다운로드는 손상된 ZIP으로 실패. 이미 설치된 별도 Chromium 실행 파일을 찾아 PC/모바일 검증을 완료했다. 새 DB 테스트 작성 중 문자열 구문 오류 1회는 수정 후 위 결과로 통과했다.
- 한계: PGlite는 단일 연결에서 SQL을 직렬화한다. Promise.all 100회는 네이티브 PostgreSQL 100개 세션의 잠금/교착/실성능 검증이 아니다. 실행 환경에 네이티브 Postgres/psql이 없고 패키지 다운로드도 패키지 목록 부재로 불가하여 실제 다중 세션 검사는 미실행. 운영 관리자 JWT/Edge 런타임/실물 휴대전화 검사는 이번 범위에서 완료했다고 주장하지 않는다. 브라우저는 합성 SDK 어댑터와 스크립트 주입을 사용하므로 실제 CSP/캐시/SDK 네트워크 통합은 배포 후 별도 확인 대상.

## 6. 운영 보존
이번 시작/종료 읽기 전용 집계: 신청 8, 계획 5, 작업 5, 미연결 4, 제작 시도 0. 종료 논리적 중복 그룹 1. 운영에 보낸 SQL은 SELECT뿐이다. 작업/고객 행, Auth, RLS, 제작 승인 정책, cron, Edge 배포를 변경하지 않았다. 전체 운영 행 내용 지문 전후 검사는 하지 않았으므로 집계를 전체 데이터 동일성 증명으로 확대하지 않는다.

## 7. 운영 반영 최소 범위/복구
별도 승인 후 최소 대상: 관리자 자산 7개(admin.html/admin.js/free-workflow.js/plan-view.js/admin-base.css/admin-review.css/vendor SDK와 기존 config 의존성 확인), nexus-orchestrator handler 배포, link-guard.sql 한 트랜잭션 적용. config.js 자체 변경은 불필요. 신규 계획/견적 원장/API/제작 기능 배포는 이 수정의 필수 조건이 아니다. main/홈페이지/기존 워커 변경 불필요.

반영 전에 현재 배포 자산·함수 정의·트리거·인덱스·ACL/RLS와 보호된 DB 백업을 확보하고, 다중 세션 경합을 격리 네이티브 PostgreSQL에서 추가 검증한다. 먼저 서버 가드, 다음 API 거부, 다음 관리자 자산을 반영하고 열린 구 탭 재접속 및 자산 해시/캐시/CSP를 확인한다. 중간 실패 시 제작 비활성 유지, 조회 전용 관리자 또는 유지보수 화면 사용. 구 자동 생성 관리자 JS로 복구하지 않는다. SQL 트랜잭션 실패는 rollback, 승인 후 커밋한 함수/트리거는 보존한 정의/ACL로 복구하되 이후 신청/증거는 삭제하지 않는다. 새 unique 인덱스를 제거하면 방어가 약해지므로 별도 검토한다.

## 8. 남은 위험/승인 경계
수정 코드와 재현 가능한 격리 증거는 완성했으나 운영은 미배포 상태이므로 구 운영 코드의 노출은 지속된다. 이것은 후보 코드 미수정과 다른 상태다. 실제 요청 주체 식별, 네이티브 다중 세션 경합, 실제 Auth/배포 CSP·캐시 통합은 남는다. 서버/자산 배포와 운영 SQL 적용에는 별도 승인이 필요하다. 기존 중복 정리와 제작 활성화는 이 변경 승인에 포함하지 않는다.
