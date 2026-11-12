# 고객 자동 제작 워커·미리보기 — 격리 후보

상태: **합성 워커 검증 PASS / 실제 운영 연결 NO-GO**. 운영 DB·실제 고객·실제 유료 모델·새 서버·공개 배포는 연결하지 않았다.

## 기존 자산 재사용

- `supabase/functions/nexus-production/artifact.mjs`의 `validateArtifact`를 그대로 호출한다. 파일 경로·크기·해시·비밀키 패턴을 검사하며 실행 테스트나 완전한 보안을 보장하는 검사는 아니다.
- `core/providers.mjs`의 `buildPrompt` 형식을 그대로 호출해 고객 입력을 불신 데이터로 취급한다. 기존 `runOpenAI`, `runCodex`, 운영 runner, 실제 Edge endpoint는 호출하지 않는다.
- 기존 생산 상태 모델의 입금 관찰, 별도 제작 승인, 승인자, 견적 동의, 원가 예약 및 불확실한 완료의 재호출 금지 원칙을 보존한다.

## UI용 합성 어댑터

```js
import {createSyntheticWorker} from './worker/engine.mjs';
import {mountPassivePreview} from './worker/preview.mjs';
const worker=createSyntheticWorker([{
  applicationId:'APP-A',customerId:'CUSTOMER-A',ownerId:'CUSTOMER-A',
  quoteAcceptedAt:'2026-11-12T00:00:00Z',
  depositConfirmedAt:null,productionApprovedAt:null,
  contractRevision:1,scopeTags:['landing','text','style'],revisionLimit:1,
  budgetMicroUsd:20000,unitCeilingMicroUsd:5000,maxAttempts:2
}],{adminIds:['ADMIN']});
const job=await worker.request({actorId:'CUSTOMER-A',applicationId:'APP-A',
  idempotencyKey:'request_initial_1',kind:'initial',message:'합성 카페 소개',scopeTags:['landing','text']});
await worker.tick({jobId:job.id}); // awaiting_approval; executionStarted=false
// Only synthetic admin controls, never production approval.
await worker.fixtureAdminConfirm({actorId:'ADMIN',applicationId:'APP-A',kind:'deposit'});
await worker.fixtureAdminConfirm({actorId:'ADMIN',applicationId:'APP-A',kind:'production'});
const outcome=await worker.tick({jobId:job.id}); // synthetic generation only
mountPassivePreview(frame,outcome.version.artifact);
```

`request`는 클라이언트의 승인·결제·provider·예산 필드를 받지 않는다. 서버 권한 원본(seedContracts)만 사용한다. 동의·입금·승인 전 요청을 대기열에 놓을 수는 있지만 실행하지 않는다. 계약 범위·버전·수정 횟수 한도는 요청과 실행 시 재검증한다. 수정 요청에는 선택적으로 expectedPreviewVersion을 전달하며 큐에 저장된 parent version도 실행 전후에 재대조해 이전 시안을 기준으로 한 변경이 새 버전을 덮어쓰지 못하게 한다. 첫 제작이 완료되기 전 수정 요청은 받지 않는다. 클라이언트 scopeTags가 style이어도 결제·로그인·새 페이지·외부 연동 등은 서버의 닫힌 규칙 분류기로 거부한다. 색상·여백·문구·제목 등의 제한된 수동 편집 의도만 받아들이며, 불명확한 자연어는 SCOPE_REVIEW_REQUIRED로 보류한다. 실제 의미 이해 모델이나 범용 자동 수정의 계약 적합성을 검증한 것은 아니다.

`snapshot({actorId,applicationId})`는 본인의 작업·버전·감사 이벤트·합성 비용 예약을 반환한다. A/B의 자료는 교차 조회할 수 없다. 같은 application/idempotency key는 동일 요청만 재사용하며 본문이 바뀌면 충돌한다. 수정 한도는 접수 시 소비한다. 실패한 최초 제작을 새 키로 만들어 재시도 횟수를 초기화할 수 없다.

`tick`은 실제 서비스라면 서버 worker에서만 호출해야 한다. 여기의 메모리 구현과 `fixtureAdminConfirm`은 브라우저 합성 UX 검증용이며 실제 사용자 인증이나 관리자의 실입금 증명이 아니다. `actorId`를 프런트엔드에서 신뢰해서는 안 된다.

## 실제 연결을 위한 서버 계약

운영 연결 어댑터는 아직 구현·배포하지 않았다. 다음 불변조건이 필요하다.

1. JWT/세션 실인증 후 `solq_customer_cases`에서 `account_id = auth.uid()`로 case를 조회하고 서버가 `application_id`를 결정한다. 프런트엔드 application/customer/owner ID나 접수번호·이름은 권한 근거가 아니다.
2. 기존 production_jobs의 `payment_observed_at`, `production_approved_at/by`, `quote_acceptance_id`, 계약 범위·버전과 연결된 고객 동의 증거를 서버가 직접 조회한다. 관리자 UID를 admin_users에 대조한다. client 승인 플래그는 무시한다.
3. 기존 비용 통제 원본을 서버에서 읽어 최대 원가를 먼저 원자적으로 예약하고 attempt·lease·멱등키를 기록한다. 고객 입력에 포함된 예산을 사용하지 않는다.
4. 실제 provider·모델·API 키·단가·계약 상한은 승인 후 서버에만 설정한다. 이 후보는 불변 `paidEnabled=false`, `liveEnabled=false`, `externalExecution=false`다.
5. 고객 대화 저장 동의 확인 후에만 보안 저장소의 수정 요청을 worker 큐로 넘긴다. worker의 artifact·메시지·미리보기 버전은 서버만 저장하고 고객은 소유권 RLS로 읽는다.
6. 저장 결과가 불확실하면 작업을 자동 재시작하지 않는다. 기존 lease/idempotency/audit를 먼저 확인한다. 작업 결과 공개 전에도 계약 취소·승인·버전을 다시 확인한다.

## 원가·실패·동시성

JS 후보는 하나의 프로세스에서 Promise 직렬화로 예약·요청·수정 한도를 원자적으로 변경한다. 분산·여러 프로세스 보장은 아니다. `reservation-fixture.sql`은 실제 PostgreSQL 행 잠금, 상태 CAS, lease, 유일한 멱등키, attempt 장부 및 원가 예약의 **격리 fixture**다. 운영 migration 파일이 아니며 그대로 운영 적용하면 안 된다.

시도 전 최대 원가를 예약하고, 실패·불확실한 시도도 예약 상한을 소비한다. 자동 재시도는 30초×시도횟수 대기 및 계약 maxAttempts(최대 5) 안에서만 가능하다. 별도 실행 루프·Cron·백그라운드 워커는 시작하지 않는다. UI가 모의 서버 tick을 호출해야 합성 진행을 볼 수 있다.

표시 원가는 합성 예산 예약액이다. 실제 모델 청구액은 항상 0이며 모델 품질·단가·실시간 견적·고객별 실제 원가는 검증하지 않았다. 예산 20,000 microUSD와 단위 예약 5,000 microUSD는 테스트 상수다.

## 미리보기 격리

`mountPassivePreview(iframe,artifact)`가 다음을 강제한다.

- `sandbox=""`: allow-scripts·allow-same-origin을 주지 않는 불투명 출처.
- HTML DOM 허용 목록만 복제. script, iframe, object, form, input, SVG, meta refresh, base 및 이벤트 속성·href/src·formaction을 제거.
- CSP로 script/connect/img/media/font/frame/object/base/form을 차단. 링크 탐색 속성 제거와 sandbox로 navigation을 제한.
- CSS `<` 문자를 escape해 stylesheet로 전달된 `</style>`의 HTML 재주입을 차단.
- referrer 비전송 및 카메라·마이크·위치·결제 capability 차단.

JS가 필요한 실제 사이트의 작동 미리보기가 아니라 정적인 수동 검토 화면이다. 원본 코드를 iframe 외부에서 실행하지 않는다. 이 후보는 JS 상호작용·실제 배포·외부 네트워크 접근을 허용하지 않는다.

## 검증 결과

`node --test candidates/customer-platform-20261112/worker/worker.test.mjs` → 12개 PASS.

- 승인 플래그 주입 거부, 견적 동의·입금·별도 승인 누락 차단.
- 관리자 외 모의 확인 거부, 고객 A/B 교차 조회·요청 거부.
- 동일 요청 100개가 하나의 작업 유지, 동일 작업 tick 20개 중 생성 1회.
- 계약 범위·버전·수정 횟수·최초시안 선행 조건 검증.
- 예산 초과 실행 전 차단, 실패 예약 소비, backoff와 최대 재시도 검증.
- 기존 artifact validator 검사 및 사용자 HTML 문자열 escaping.
- PGlite 실제 PostgreSQL fixture에서 claim 30개 중 예약 1개, lease 위조·완료 replay·멱등키 충돌·고객소유 불일치·anon 접근 거부.

PGlite는 단일 연결을 직렬화하므로 다중 프로세스 동시성/장기 장애·복구 검증을 대신하지 않는다. 실제 Supabase JWT/Edge/Storage 및 브라우저 iframe 보안은 root 통합 검증과 실제 승인된 환경에서 별도로 검증해야 한다. 운영 배포 NO-GO를 해제하지 않는다.
