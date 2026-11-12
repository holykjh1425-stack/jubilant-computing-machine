# SOLQ 인증 이메일 신청 — 개발 후보

2026-11-12 KST. **격리 개발 PASS / 실제 연결·발송·운영 적용 NO-GO.**

[작업지시서](../../../docs/SOLQ_VERIFIED_EMAIL_APPLICATION_WORK_ORDER_20261112.md)에 따라 기존 브랜치 `dev/solq-customer-chat-pricing-20261112`의 `c486add29fc67f5cf5367e6e5f6cf981ee448b21`에서 이어 개발했다. 실제 이메일, Auth 계정 생성, 운영 INSERT/DDL, 신규 결제·서버·배포·Actions 실행 없음. 아래 결과는 신규 경로 후보이며 기존 운영 신청의 익명 권한을 철회하지 않았다.

## 구현과 연결 상태

| 영역 | 구현·확인 결과 | 실제 운영 |
|---|---|---|
| Auth 현황 조사 A | public `/auth/v1/settings` GET: email=true, disable_signup=false, mailer_autoconfirm=false. 기존 공개 client key만 사용, 출력/저장하지 않음 | 설정 변경 없음 |
| SMTP·템플릿·요금 A | 현재 connector에 Auth 관리 설정 읽기 기능이 없어 미확인. public settings에는 SMTP·템플릿·한도·요금이 없음 | 비용 0원/기존 범위 판정 불가, 발송 관문 차단 |
| 기존 호출 경로 B | `app.js` → `submit_application` RPC → applications → receipt-only. 실제 함수 정의만 읽기 전용 확인 | 기존 함수/권한·폼 무변경 |
| 인증 신규 경로 B | OTP gateway, verified email 필수 서버 service, CSRF/Origin/본문 크기 제한, 인증 후 신청 가능한 client controller | 기본 비활성, 실제 SDK/endpoint wiring 미완료 |
| 원자 저장 C | 기존 applications INSERT + 신규 account case + submission + receipt outbox + audit 한 SQL 트랜잭션 | 미적용 SQL 후보 |
| 알림 C | 신청 저장 후 outbox, idempotency·lease·상한 3회·backoff·실패/불명확·수신처 변경 통제 | 실제 mail provider 없음 |
| UI C | 독립 합성 QA 페이지: 인증 전 폼 잠금 → 합성 번호 확인 → 작성 → 접수번호/메일 대기 분리. 390px 프레임 가로 넘침 없음 | 홈페이지 연결/공개 배포 없음 |
| 실제 E2E D | 실제 OTP/매직링크·Auth·PostgREST·이메일 수신 미실행 | 발송/비용/환경 승인 전 NO-GO |
| 기존 관문 E | 보안 7건·백업·복원·RPO/RTO·롤백 미종결 상태 유지 | 이번 합성 테스트로 PASS 처리하지 않음 |

고객은 서비스·일반 문의·공개 상담을 비로그인으로 볼 수 있고, **새 신청 경로**는 이메일 인증 후 작성한다. `index.html`은 합성 QA용 독립 파일이며 실제 운영 홈페이지의 index.html이 아니다. 인증 안내의 123456은 가짜 OTP이며 실제 인증 서버에 보낼 수 없다.

## 새 검증 증거

- **SQL 35 PASS / 0 FAIL**: [원문](../evidence/verified-email-sql.txt), [재현](native-intake.py). PostgreSQL 17.11 실제 다중 연결, 실행 전체 86 backend PID. 신규 시나리오만 기존 클러스터 bootstrap을 재사용했다. 원래 43개 시나리오는 다시 실행하지 않았다.
- **새 JS 16 PASS / 0 FAIL**: [원문](../evidence/verified-email-js.txt), [테스트](verified-email.test.mjs).
- `server-authenticator`의 검증된 이메일 반환 추가에 따른 **회귀 3 PASS / 0 FAIL**: [원문](../evidence/verified-email-auth-regression.txt). 기존 49 + 이전 보완 43/9/5 로그는 그대로 보존했다. 이전 57에는 변경 부분 회귀 5가 포함되므로 모두 신규 독립 검사라고 합산하지 않는다.
- 브라우저 desktop에서 인증 전 disabled → 합성 코드 확인 후 활성화 → 합성 신청 성공/메일 pending 표시를 확인. 390×844 iframe의 clientWidth=375, scrollWidth=375, 이메일 입력 폭 293px. 실물 모바일·키보드·모바일 실제 수신은 미확인이다.

SQL: 20개 동시 같은 요청 → 신규 신청·outbox 각각 1개, 나머지 19개는 같은 receipt 반환. 동일 ID/다른 본문 충돌 거부. outbox 저장 실패 시 application·case·submission도 롤백. 인증 이메일/UID/세션/토큰 기한 및 필수 동의 확인, 타 고객 status 차단, 익명 receipt claim 거부. 별도 계정용 UID를 API 본문으로 받지 않는다. 20개 발송 claim 중 1 lease만 획득. definite failure만 지연 재시도, 최대 3회. 응답 불명확·lease 상실은 unknown으로 격리. 이메일 변경은 claim 및 실제 transport 직전 확인 단계에서 취소. 서버가 수신처를 임의 입력으로 신뢰하지 않는다. OTP 20개 동시 요청은 resend 1건/검증 5건만 예약. 기존 합성 고객 행·applications/admin_users GRANT를 보존했다.

JS: 기본 off 시 외부 호출 0, phone-only/미확인 이메일/만료 거부, UID/email·동의 위조 차단, OTP 1회·만료·재전송/시도 한도 합성 검증, CSRF·Origin, 메일 최소 내용, timeout 불명확 처리, 이중 제출 single-flight, 계정 전환/로그아웃 후 늦은 응답 제거, 유실 응답의 status 재조회 확인. 실제 Auth OTP의 일회성은 provider의 보장에 의존하며 합성 모델이 그 실제 동작을 증명하지는 않는다.

```bash
PYTHONDONTWRITEBYTECODE=1 python candidates/customer-platform-20261112/verified-email/native-intake.py /absolute/postgresql/17/bin
node --test candidates/customer-platform-20261112/verified-email/verified-email.test.mjs
node --test --test-name-pattern='server authenticator|server auth' candidates/customer-platform-20261112/security/session-hardening.test.mjs
```

Python `psycopg[binary]==3.2.13`. 빈 임시 local cluster, 127.0.0.1 전용, plpgsql 외 확장/Cron/pg_net/preload 없음, 종료 시 프로세스 중지·임시 DB 제거. 운영 URL·이메일 계정·JWT·서비스 키를 사용하지 않는다. 기존 네이티브 fixture의 최소 테이블에 운영과 호환되는 신청 필드/default를 추가한 합성 모델이며 운영 전체 함수/트리거·Auth·PostgREST를 복제한 환경은 아니다.

## 인터페이스·권한

- [service.mjs](service.mjs): `createVerifiedIntake`, `createIntakeStore`, `createOtpGateway`, `createPersistentOtpLimiter`, `createIntakeHandler`. 전부 기본 비활성. 신청 payload는 이름·서비스·본문·두 필수 동의·intake-email-v1뿐이다. 이메일은 기존 exact-token `getUser` 서버 인증기의 confirmed email에서 가져오고, DB의 현재 verified email과 다시 비교한다. phone-confirmed-only 계정은 거부한다. 미인증·다른 세션·만료된 context는 DB에서도 거부한다.
- [intake.candidate.sql](intake.candidate.sql): 신규 private schema/table 4개(신청 연결, outbox, audit, OTP attempts), RLS enable, anon/authenticated의 모든 table/RPC 권한 철회. 신규 RPC는 service_role 전용 invoker. 보호된 Auth 테이블에서 이메일만 확인하는 좁은 비공개 definer helper 1개는 service_role만 호출한다. 기존 Auth/신청/관리자 테이블의 schema·GRANT·RLS 및 기존 submit_application은 변경하지 않는다.
- SQL 적용 후보 순서: customer-schema → enrollment-proof → session-hardening → intake. 운영 적용·migration 파일 자동 실행은 금지 상태다. 기존 운영 트리거가 외부 알림·계획 생성 등을 실행할 가능성을 승인 전 별도로 감사해야 한다.
- [client.mjs](client.mjs): 인증 전 입력 잠금 상태, in-memory request UUID, 고정 본문 재시도·status reconciliation, single-flight, 세션 전환 후 화면 데이터 무효화. `clear()`는 실제 Auth event/로그아웃/이메일 변경 시 호스트가 연결하고 DOM 입력도 초기화해야 한다. 실제 SDK Auth listener/세션 보관은 미연결이다. 브라우저 새로고침으로 메모리 UUID를 잃을 때의 안전한 복구/서버 사용자별 목록 화면도 운영 전 구현해야 한다.
- OTP는 비밀번호 없는 **번호 입력 방식**을 우선 선정했다. SDK의 signInWithOtp는 기본 템플릿에 따라 Magic Link를 보낼 수 있으므로 6자리 `.Token` 템플릿을 승인·검증하기 전 활성화할 수 없다. shouldCreateUser=false가 기본이다. 최초 방문자의 실제 계정 생성과 OTP 발송은 각각 승인된 서버 설정이 필요하다. 매직링크 redirect/PKCE 경로는 이번에 구현하지 않았다.
- shared limiter는 서버가 계산한 이메일 HMAC·신뢰 ingress network HMAC만 저장하도록 한다. HMAC용 기존 승인된 secret·trusted ingress·OTP HTTP wrapper/세션 보관·CAPTCHA·perimeter 한도 연결은 미완료다. caller JSON/임의 X-Forwarded-For를 신뢰하면 안 된다. 공개 Supabase Auth endpoint를 직접 호출하는 행위는 이 wrapper의 제한을 우회하므로 실제 provider의 native limits/abuse 설정을 확인해야 한다. Origin은 인증 대체 수단이 아니다.

## 발송 상태 의미와 비용

[outbox.mjs](outbox.mjs)는 실제 provider를 생성하지 않는다. `enabled`, `deliveryApproved`, `costApproved`가 모두 충족되어야 실제 adapter가 실행 가능하다. synthetic은 테스트용 명시적 분기이며 운영에서 사용할 설정이 아니다. dispatcher를 자동 예약하거나 Cron에 연결하지 않았다.

| 상태 | 의미·조치 |
|---|---|
| pending | 신청은 저장됨. 확인 메일 발송 대기 |
| processing | 한 작업자가 lease 획득. 발송 결과 미확정 |
| accepted | provider가 요청을 수락. 고객 메일함 도착/읽음 확인 아님 |
| failed | provider가 수락하지 않았음이 확실한 경우에 한해 60초/300초 간격 재시도, 최대 3회 |
| unknown | timeout·응답 손실·lease 만료 등. 자동 재시도 금지, provider idempotency/상태 조회로 수동 대사 필요 |
| cancelled | 현재 인증 이메일이 수신처와 달라 전송 취소. 새 이메일로 자동 재발송하지 않음 |

메일에는 접수번호·접수 사실·고정 SOLQ 홈페이지 로그인 안내만 포함한다. 신청 본문·인증번호·bearer·enrollment proof·접근 토큰·receipt query URL은 없다. '거래성 접수 확인'으로 분류하고 홍보 수신 동의를 근거로 보내지 않는다. 이 분류는 제품 설계이며 실제 발송 문안·정책 검토를 대신하지 않는다. 이메일 변경이 transport 최종 확인 직후 일어나는 경쟁을 외부 발송과 완전히 원자화할 수는 없다. provider 측 accepted 이후의 실제 반송/webhook 처리는 미구현이다.

2026-11-12 공식 문서 확인: 기본 SMTP는 팀 주소 제한·시간당 2건·best-effort이며 고객용 운영 발송 기반으로 간주할 수 없다. custom SMTP의 초기 Auth 제한은 30건/시간, OTP 재요청 기본 간격은 60초지만 **현 프로젝트의 실제 값은 미확인**이다. [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [한도](https://supabase.com/docs/guides/auth/rate-limits), [OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).

현재 SMTP 제공자·잔여 한도·인증 발송/접수 알림 발송 경로·계정 요금·도메인 SPF/DKIM/DMARC·템플릿이 미확인이라 운영 추가 비용 0원 판정은 보류한다. 하루 정상 신규 신청 N명은 대략 OTP N + 확인 N = 2N건에 재인증·실패 재시도를 더하는 **사용량 가정**이며 금액 견적은 아니다. Auth SMTP와 앱 접수 메일은 서로 다른 발송 기능이며 Auth SMTP 설정만으로 앱 알림이 자동 구현되지 않는다. 이번 개발의 실제 발송 0건·유료 API 0·추가 결제 0원.

## 고지·운영 승인 잔여 사항

기존 개인정보/삭제 요청 페이지는 변경하지 않았다. 운영 전 인증 이메일·Auth 계정·신청 UID 연결·신청/동의 버전·발송 수신처·전달 상태/감사 이력·남용 방지 HMAC의 목적, 실제 보관/삭제 기간·법정 보존 예외·요청자 확인·담당자·발송 제공자/국가/위탁 정보를 실제 구성에 맞춰 확정해야 한다. SMTP 제공자도 미확인이라 국외 처리 고지를 완결했다고 볼 수 없다. 법률 적합성 PASS 판정이 아니며 임의 30일 자동삭제는 추가하지 않았다. 기술적 제한은 삭제 요청 처리 면제를 뜻하지 않는다.

다음 관문: ① SMTP/템플릿/실요금 읽기 전용 확인 및 발송량 상한 ② 신규 private schema·definer 소유자·service_role 권한·기존 트리거/가입/메일 전송 경계 승인 ③ 안전한 격리 Auth/PostgREST 환경·합성 이메일 수신 승인 후 실제 E2E ④ 고지/보존·provider 반송/대사·롤백/모니터링 확정 ⑤ 보안 7건·백업/복원/RPO/RTO 종결 ⑥ 별도 운영 적용 승인. 검증 완료 전 익명 submit_application을 REVOKE하지 않는다. 기존 관리자 무료 계획→견적 동의→입금 확인→별도 제작 승인·가격/비용 관문은 그대로다.

코드 롤백은 이 후보 연결을 해제하는 방식이며 기존 고객 데이터를 삭제하지 않는다. 아직 연결하지 않았으므로 운영에 롤백할 변경도 없다. 구현 파일·증거는 이 브랜치에 저장하고 이슈 #10에 보고한다.
