# SOLQ 이메일 링크 인증·자동 안내 개발 후보

**기준: 2026-11-12 KST / 운영 미적용 / NO-GO 유지.** 기존 54 PASS는 다시 실행하지 않는다. 이번 신규 증거는 JS 24 + 실제 로컬 PostgreSQL 21 = **45 PASS**다. 실제 SDK·SMTP·메일 수신·브라우저 배치 성공을 의미하지 않는다.

## 파일과 연결

- `auth.mjs`: 주입된 Supabase Auth의 `signInWithOtp`를 링크 방식으로 요청한다. PKCE code를 `exchangeCodeForSession`으로 교환하고 `getUser` 확인 후 고정 `https://solqtech.com/#apply`로 이동한다. callback은 `https://solqtech.com/`만 허용한다. code는 교환 전에 URL에서 제거하고 오류/중복 code/외부 redirect/implicit token을 거부한다. provider 계정 오류를 고객에게 구분해 노출하지 않는다. 실제 발송·신규 가입 기본 OFF.
- `application.mjs`, `bootstrap.mjs`: 링크 인증 상태와 기존 verified intake를 연결하는 UI 상태/구성 모듈. 로그인·다중 탭 Auth 상태 전환 시 메모리 신청 상태를 폐기한다. 신청 직전/응답 직후 신원을 확인하고, 응답 유실은 동일 요청 ID로 재조회한다. 인증 안 된 신청은 intake에 전달하지 않는다. **운영 HTML에는 아직 연결하지 않는다.**
- `smtp-provider.mjs`: 승인된 기존 서버 SMTP transport용 adapter. From 고정·cc/bcc/첨부 제거·accepted/rejected/unknown 분리. 실제 transport 연결/비밀 로딩은 하지 않는다.
- `notifications.mjs`: 서버 완료 증거를 확인하는 bridge, 최소 내용 완료/수정 메일, 승인·비용 관문이 있는 1회 실행 dispatcher 및 service-only RPC adapter. 운영 transport 생성 없음. `authorizeCurrent`를 발송 직전 필수 재검사한다.
- `worker-completion.mjs`: 기존 워커 snapshot/검증 결과 + 서버의 계약/입금/별도 제작 승인/접근 검증을 결합한다. 기존 워커를 호출해 작업을 시작하지 않는다. 별도 `readAuthority`는 실제 서버 자료에 연결해야 한다. 구조 검증만 통과한 시안은 고객 완료로 처리하지 않는다.
- `completion.candidate.sql`: private schema `solq_mail_events`의 완료 outbox·감사, case/version/kind 유일성, 3회 상한·지연 재시도·lease·unknown 격리. 고객 role은 읽기/쓰기/RPC 실행 불가. 기존 applications/admin_users 데이터·grant·함수 및 접수 outbox를 수정하지 않는다. 신규 candidate preview 테이블의 SELECT만 service_role에 부여한다. 운영 migration 파일/운영 적용은 아님.
- `config.candidate.json`: 링크 모드·HTTPS 실제 도메인·정확한 allowlist·SMTP 후보와 모두 false인 승인 상태.

인증 → 기존 서버의 exact-token `getUser` + auth.sessions 확인 → 원자 신청/UID/인증 이메일/접수번호/outbox → 별도 접수 dispatcher 순서다. 이름·접수번호로 인증하지 않는다. 고객 입력 email/UID를 권한으로 신뢰하지 않는다. 일반 상담·기존 사이트·기존 OTP 후보/로컬 기록은 그대로 보존한다. **운영 anonymous 신청 경로 차단은 이번에 하지 않았다.** 기존 일반 상담과 제작 신청을 분리한 컷오버 후에만 기존 보안 후보를 별도 승인으로 적용한다.

## 실제 연결 전에 필요한 조립

1. 기존 SDK **2.118.0**을 기준으로, 브라우저 client를 PKCE / detectSessionInUrl=false로 구성한다. code verifier는 같은 브라우저/기기에서 redirect 뒤에도 유지되는 승인된 SDK storage를 사용한다. 여러 탭에서 새 링크를 요청하면 이전 verifier가 덮일 수 있으며 이전 링크는 안전하게 실패한다. 자동 다른 계정 연결·implicit fallback을 하지 않는다.
2. 루트 callback 처리기를 기존 app.js 및 외부 analytics/CDN 실행보다 먼저 실행한다. Referrer-Policy=no-referrer, Cache-Control=no-store와 code 즉시 URL 제거가 필요하다. 현재 정적 배포에서 헤더·라우팅·SDK 저장소를 실제로 적용/검증하지 않았으므로 배포 NO-GO다. root index에 바로 script를 추가한 상태가 아니다.
3. 링크 이메일의 기존 ConfirmationURL 템플릿을 유지한다. **이번 지시에 따라 숫자 OTP 변환은 필요하지 않다.** 이전 c0b1d70의 OTP 불일치는 이전 숫자 방식 후보의 차이이며 이번 링크 방식 자체의 차단 원인은 아니다. Site URL localhost와 redirect 미등록은 여전히 수정 승인 필요다.
4. auth send는 기존 shared persistent limiter의 trusted gateway에서 제한한다. 브라우저 limiter만으로 권한·남용 방지를 주장하지 않는다. 실제 Auth endpoint 직접 호출 차단·Supabase 한도·남용방지 정책은 운영 승인 전에 검증한다. 최초 고객은 `accountCreationApproved` 별도 승인 필요.
5. 고객 신청 HTTP는 기존 `createIntakeHandler` → `createServerAuthenticator` → `createVerifiedIntake` → `createIntakeStore`를 연결한다. 브라우저에 service_role/DB 세션 접근을 넣지 않는다. 운영 frontend의 기존 익명 fallback을 함께 실행하지 않는다. 기존 상담은 별도 공개 상담 경로로 보존한다.
6. 완료 ledger는 검증된 preview/version과 trusted contract authority가 일치할 때만 큐에 넣는다. 실제 worker 승인 자료 → readAuthority/검증 preview 저장을 기존 서버에 연결해야 한다. 이를 고객용 HTTP endpoint에 노출하지 않는다.
7. receipt/completion이 공유하는 영구 비용·메일 수량 reservation과 SMTP transport/timeout/반송 처리 연결이 필요하다. 이번엔 완료 dispatcher에 필수 budget seam을 만들었으며, 운영 전역 Gmail quota 예약기는 미연결이다. Supabase Auth 발송량도 계정 전체 Gmail 한도에 포함해 계획해야 한다.

발송 직후 DB 응답이 유실되면 lease 만료 후 unknown이고 자동 재시도하지 않는다. SMTP 자체는 idempotencyKey를 지원한다고 가정하지 않는다. accepted는 provider 수락이며 inbox delivery가 아니다. 주소·승인 변경과 외부 SMTP 발송을 완전 원자화할 수 없는 경쟁은 잔여 위험이다. provider 반송 webhook·24시간 운영·실제 다중 기기/브라우저·모바일 회귀 미검증.

## 신규 검증만 실행

```sh
node --test candidates/customer-platform-20261112/email-link/email-link.test.mjs
PYTHONPATH=/tmp/solq-mail-test-deps python candidates/customer-platform-20261112/email-link/native-completion.py /workspace/scratch/solq-pg-runtime/unpack/usr/lib/postgresql/17/bin
```

SQL runner는 psycopg[binary] 3.2.13, PostgreSQL 17.11, 임시 cluster·loopback·확장/Cron 없음. 이전 native-multisession의 bootstrap DDL만 재사용하고 기존 54/43 체크는 실행하지 않는다. 독립 backend 47개, 20개 동시 큐/claim 검증. 합성 `.invalid` 주소만 사용. 새 npm dependency·실제 외부 API 호출·자동 스케줄러 없음.

전체 보고·비용/승인: `docs/SOLQ_CUSTOMER_EMAIL_LINK_AUTONOTICE_RESULT_20261112.md`.
