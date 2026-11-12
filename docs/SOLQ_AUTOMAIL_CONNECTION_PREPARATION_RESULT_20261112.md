# SOLQ 고객 이메일 자동 발송 연결 준비 결과

기준: 2026-11-12 UTC. 기존 개발 브랜치의 `95f3e45`에서 연속 수행. **개발 연결 후보 보완 완료 / 운영 자동 발송 연결 미완료 / 운영 전환 NO-GO.**

## 1. otp_disabled 원인과 증거 구분

- 기존 한정 시험은 HTTP 422 / `otp_disabled`, 요청의 `create_user:false`였다. 실제 전송을 재시도하지 않았다. [기존 시험 기록](SOLQ_GMAIL_SMTP_TEST_ATTEMPT_RESULT_20261112.md)을 보존한다.
- 이번 읽기 전용 SQL은 사용자가 지정한 시험 주소 한 개의 `auth.users` 존재 여부만 확인했고 **false**였다. 사용자 목록·다른 고객 정보·비밀번호·토큰은 조회하지 않았다. Google 로그인 계정 또는 비밀번호 관리자 계정이라는 사실은 SOLQ 프로젝트의 고객 Auth 등록을 뜻하지 않는다.
- Supabase 공식 Auth 소스 `Otp`는 `shouldCreateUser`가 false이면 `otp_disabled`를 반환한 뒤 MagicLink 발송으로 진행하지 않는다. `shouldCreateUser`는 `create_user:false`일 때 이메일/audience 사용자를 조회해 not-found면 false를 반환한다. 따라서 이 시험은 **미등록 수신자 + 신규 계정 생성 금지**로 발송 이전에 차단된 경로와 일치한다. SMTP 인증 실패나 Gmail 전달 지연의 증거가 아니다. 운영 Auth 바이너리의 소스 SHA를 직접 대조한 것은 아니다.
- 현재 공개 Auth settings GET 200: `email=true`, `disable_signup=false`, `mailer_autoconfirm=false`, `anonymous_users=false`. 이메일 공급자 자체가 꺼진 상태가 아니다. 가입 허용 설정과 개별 요청의 신규 생성 금지 옵션은 별개다.
- 실제 메일/계정 생성 POST는 이번에 0회. 과거 Gmail 웹 직접 발송의 수신 확인은 Supabase SMTP 경로 성공과 구분한다(이슈 #10, comment 6819197750).

공식 근거: [Auth otp.go](https://github.com/supabase/auth/blob/master/internal/api/otp.go), [signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp). 새 고객 인증이 필요하다고 `shouldCreateUser:true`를 무승인 운영 실행하지 않았다.

## 2. 운영과 개발 후보의 차이

| 항목 | 확인된 운영/보존 증거 | 후보 및 차단 사항 |
|---|---|---|
| SMTP | 승인된 활성화 기록 `14bd489`, Gmail 465 implicit TLS, SOLQ 발신 | 재등록·비밀 재발급 없음. 실제 SMTP 수신 미검증 |
| 링크 템플릿 | 이전 관리자 실조회 `.ConfirmationURL` | 현재 PKCE 후보와 링크 형식 일치. 숫자 OTP 전환 불필요 |
| Site URL / redirect | 이전 관리자 실조회 localhost / allowlist 없음 | 후보 `https://solqtech.com/` 및 인증 후 `#apply`. 이번 새 실조회가 아닌 보존 기준이며 변경 승인 필요 |
| 고객 생성 | 현재 가입 허용, 요청별 생성 금지는 별도 | 최초 고객용 accountCreationApproved 기본 false 유지 |
| 고객 신청 | 운영 기존 익명 흐름 보존 | bootstrap → 서버 getUser/session → 원자 UID/verified email/접수번호/outbox. 운영 HTML 미연결 |
| 저장 구조 | 이번 SQL: verified intake schema / completion schema / verified submit RPC 모두 없음 | 후보 SQL은 운영 미적용. 기존 고객 행 수정/삭제 없음 |
| 안내 메일 | Auth SMTP는 인증 메일 경로 | 접수/완료 워커는 별도 trusted server transport와 보호 비밀 등록 필요 |

`auth.users` 및 metadata SQL은 SELECT만 실행했다. 이번 조회는 기존 테이블 전체·고객 건수·과거 데이터 지문 재검증이 아니다. 조회 결과를 신규 데이터 보존 PASS로 확대하지 않는다.

## 3. 실제 보완한 코드

- `email-link/config.candidate.json`, `smtp-provider.mjs`: 후보 SMTP profile을 저장된 **465 implicit TLS / 인증서 검증 ON**에 맞췄다. 공개 profile에 비밀값 없음. 서버 transport를 생성하거나 연결하지 않는다.
- `email-link/mail-worker.mjs`: 기존 접수/완료 dispatcher를 재사용하는 수동 1회 실행 composition. 기본 비활성, 실제 실행 시 SMTP/발송/비용 승인 모두 필수. 두 경로는 같은 `reserveBudget`를 거치며 한 worker instance의 중복 실행을 막는다. 완료 시 현재 계약/승인 재검사, 접수 시 인증된 목적지 재확인. 생성 시 timer/Cron/네트워크 호출 없음.
- 기존 SQL의 최대 3회·backoff·lease·unknown 격리를 재사용한다. 명확한 미수락만 재시도 후보이며 모호한 SMTP 결과는 unknown으로 격리한다. provider accepted는 수신함 도착 PASS가 아니다.
- `reserveBudget`는 **영구·원자·다중 인스턴스 공통 구현이 필수인 주입 지점**이며 이번에 그 저장기를 운영 연결한 것은 아니다. 예산 거절도 기존 failed transition을 사용하므로 attempt가 소비된다. 운영 실행기는 한도 회복 이전에 claim을 반복하지 않아야 한다. 재시도 스케줄러·한도 수치는 자동 활성화하지 않는다.
- Supabase Auth의 저장 비밀번호를 읽어 워커에 복사하지 않는다. 이미 발급된 앱 비밀번호를 사용자가 별도 승인된 서버 secret 입력 화면에 직접 등록할 단계가 남았다. 비밀 재발급 불필요.

브라우저 신청 연결은 기존 `bootstrap.mjs`/`application.mjs` 및 verified intake를 재사용한다. production에 연결할 때 legacy submit과 새 submit을 동시 호출하지 않고, 일반 상담은 유지한다. 인증 전 제작 신청만 새 경로에서 차단하고 UID/email을 고객 입력으로 신뢰하지 않는다. 기존 익명 신청을 지금 차단하지 않았다.

## 4. 신규 격리 검증과 기존 증거 재사용

새 composition 범위만 합성 주소 `example.invalid`로 실행: **10 PASS / 0 FAIL**. [로그](../candidates/customer-platform-20261112/evidence/mail-worker-assembly.txt). 기본 차단, 승인별 차단, budget 필수/거절, 목적지 변경, 완료 승인 재검사, 모호한 결과 격리, 접수/완료 동시 실행 차단을 검증했다. 네트워크·실메일·운영 DB 호출 없는 injected mock 검증이며 실제 SMTP/분산 worker 검증이 아니다.

기존 54 PASS(661cfd4), 신규 45 PASS(d0ab77e)는 재실행하지 않았다. 로그 및 기존 운영 HTML/app.js/config.js/admin.html이 기준 커밋과 동일한지 파일 지문을 확인했다. [보존 증거](../candidates/customer-platform-20261112/evidence/automail-preparation-preservation.json). 54+45+10은 서로 다른 범위이며 이를 운영 E2E 109 PASS로 표현하지 않는다.

## 5. 운영 영향·롤백·승인 관문

| 단계 | 예상 영향 | 적용 전 조건과 롤백 |
|---|---|---|
| Auth 시험 1회 | 신규 사용자 생성 또는 기존 시험 계정 로그인·메일 1건 | 수신함/계정 생성 허용 여부/최대 1건 승인. 미등록 테스트 주소는 create_user:false로 다시 보내지 않음. 기존 템플릿 유지. 시험 계정 삭제는 자동 수행하지 않음 |
| Auth URL 변경 | 인증 링크 도착 위치 변경 | 현재값 안전 보존, 정확한 HTTPS callback·PKCE·모바일 검증 후 별도 승인. 문제 시 발송 신규 요청을 멈추고 승인된 이전값 복원 |
| DB 후보 | private schema/RLS/service RPC 추가 | 격리 통합·백업·의존 함수/권한 검토 후 별도 승인. 실패 시 새 진입점을 차단하고 큐/감사 행을 보존. DROP/고객 데이터 삭제로 롤백하지 않음 |
| 서버 transport | 기존 서버의 secret 접근·메일 outbound | secret store/런타임 TLS465 지원·timeout·한도/반송·영구 budget·현재 권한 연결 검증, 별도 비밀 등록 승인. 중단 시 worker disable·scheduler 중지, 기존 SMTP 및 outbox/audit 보존 |
| 고객 UI 전환 | 익명 제작 신청에서 인증 신청으로 전환 | 실제 SDK/브라우저·390px·다중 기기/세션·정보 노출·회귀 검증, 별도 배포 승인. 이전 frontend artifact 복구, 새 큐는 보존하고 발송 중지 |
| 접수/완료 시험 | 인증 수신함 대상 승인된 안내 1건씩 | 각 발송 종류/건수·비용 상한 승인 후 개별 수행. queued/claimed/accepted/inbox 도착 시간을 나눠 기록. 실제 고객 대상 발송 승인과 분리 |

SMTP 이미 활성화된 상태를 이번 롤백에서 임의 OFF 하지 않는다. 기존 고객 데이터·신청·무료 계획·가격·입금 확인·별도 제작 승인·제작 상태 변경 없음. 신규 서비스/서버·결제·유료 AI·운영 배포·실제 고객 발송 **0**. 이번 추가 비용 0원. 향후 운영비/한도/전달 속도는 실제 사용량 및 기존 플랜 확인 전 확정하지 않는다.

남은 NO-GO: Supabase SMTP 한정 실제 수신, Auth URL/PKCE 운영 배치, 후보 DB 승인·적용, 영구 공유 quota, 보호 server transport, trusted completion authority/preview 저장 연결, 실제 세션/모바일 회귀, 기존 보안 경고/백업·복원 관문. 운영 자동 발송 완료로 보고하지 않는다.

공식 TLS 근거: [Google Gmail SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp). 전달 지연은 이번 거절 요청에서 측정 불가하며 SMTP 수락과 수신 시각을 분리해야 한다.
