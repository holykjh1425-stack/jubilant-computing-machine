# SOLQ SMTP·Auth·보안 관문 실행 결과 — 2026-11-12 KST

**읽기 전용 조회 시도·공개 DNS 확인·개선 후보/검증 절차 작성 완료. 상세 SMTP 조회는 관리자 로그인 차단으로 미완료. 운영 전환 NO-GO 유지.**

기준: [작업지시서](SOLQ_LIVE_SMTP_AUTH_SECURITY_GATES_WORK_ORDER_20261112.md), 개발 브랜치 `dev/solq-customer-chat-pricing-20261112`, 시작 커밋 `58200933f458d2db2925f5dae604a7a419a9d4f0`. 기존 이메일 후보 `661cfd4`의 35 SQL+16 JS+3 회귀=54 PASS와 ATLAS 2026-11-12 04:38Z 보안 경고 7건 확인 결과를 재사용했다. 이를 새 실시간 PASS로 표시하지 않는다.

## 1. 실제 SMTP/Auth 조회 범위

Supabase connector에 SMTP/Auth 관리 config 읽기 기능이 없어 사용자 지시의 Dashboard 조회를 시도했다. `/dashboard/project/elfacqmvygnwjlklqhiz/auth/smtp`가 **Sign in | Supabase Dashboard**로 이동했다. 이 작업용 브라우저에는 인증된 관리자 세션이 없다. 로그인 방법 선택·비밀번호 입력·OTP 요청·설정 변경은 하지 않았으며, 현재 상태를 유지했다. 다른 설정 URL을 반복해서 열어 인증을 우회하지 않았다. SMTP 상세 조회에 필요한 남은 것은 관리자 로그인 세션이다. 비밀번호·OTP·서비스 키를 채팅으로 수집하지 않는다.

| 항목 | 확인 상태 | 근거/후속 확인 |
|---|---|---|
| Email provider 활성·이메일 확인 정책 | 이전 공개 settings 조회: email=true, disable_signup=false, mailer_autoconfirm=false | [기존 안전한 결과](../candidates/customer-platform-20261112/evidence/verified-email-readonly-audit.json). 이번에 재조회하지 않음 |
| Providers > Email의 secure email change, OTP 길이·유효시간, password 로그인 경로 | 미확인 | Dashboard 로그인 후 switch 표시만 조회. 토글·저장 금지 |
| SMTP 활성·제공자·From domain·포트 | 미확인 | 로그인 차단. SMTP username/password·API key는 읽기/복사/캡처 대상에서 제외 |
| Magic Link/OTP·접수 확인 템플릿 | 미확인 | 번호 변수/링크 방식·언어·민감정보 포함 여부만 기록. 테스트 발송 금지 |
| Auth Rate Limits·잔여량·계정 요금·기존 무료 한도 | 미확인 | 기본 문서 수치를 프로젝트 실값으로 사용하지 않음 |
| Site URL·redirect allowlist | 미확인 | 정확한 승인 도메인/경로와 wildcard 필요 여부 검토. redirect 변경 금지 |
| 실제 Auth 가입/OTP·REST 신청/메일 수신 E2E | 미실행 | 승인된 격리 환경·테스트 주소·발송량/비용 승인 필요 |

공식 [SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp)는 기본 발송 서비스를 고객 운영용으로 간주하지 않도록 설명한다. 이 사실만으로 SOLQ가 기본 SMTP를 사용한다고 단정하지 않았다. 실제 계정·제공자·요금·한도가 확인되지 않아 운영 발송 추가 비용 0원 여부는 **미확인**이다. Auth SMTP와 앱의 receipt outbox transport는 서로 다른 연결이며, SMTP가 설정되어도 접수 메일 전송기가 자동으로 완성되지 않는다.

## 2. 기존 메일 인프라·DNS

2026-11-12 Google Public DNS 및 Cloudflare DNS-over-HTTPS로 아래 공개 레코드만 조회했다. 실제 메일을 보내거나 DNS를 변경하지 않았다. 도메인 소유 확인용 TXT 등 무관한 토큰은 기록하지 않았다.

| 조회 | 두 resolver의 응답 | 제한 |
|---|---|---|
| solqtech.com TXT/SPF | status 0, Answer 0, SPF 확인 안 됨 | 현재 공개 resolver 관찰. 다른 발신 subdomain/제공자 부재의 증명은 아님 |
| solqtech.com MX | status 0, Answer 0 | 해당 root의 수신 레코드가 확인되지 않음. MX 부재만으로 외부 SMTP 발신 불가능 판정 불가 |
| _dmarc.solqtech.com TXT | status 3(NXDOMAIN), Answer 0 | 현재 해당 이름의 DMARC 확인 안 됨. 정책을 임의 추가하지 않음 |
| DKIM | 미확인 | 실제 From/Return-Path domain과 제공자 selector 불명. selector 추측·대량 조회 안 함 |

현재 브랜치의 docs/ops/supabase에서 제공자 이름·SMTP 참조 파일명을 검색했으나 승인된 발송 서비스 구성·청구 계약의 증거를 찾지 못했다. '메일 서비스 계정이 없다'는 결론은 아니다. 실제 sender domain이 root와 다를 수 있으므로 SMTP 확인 뒤 해당 도메인에서 SPF/DKIM/DMARC alignment와 발신 인증을 확인해야 한다. 기존 invoice/계약, 무료 quota·초과 단가, From domain verification이 아직 없다. 신규 가입/유료 API/계정 연결은 하지 않았다.

## 3. 보안 경고 7건별 개선 후보

근거는 작업지시서의 기존 운영 조회다. 새 advisor 호출은 생략했다. 7건은 동일 3개 함수의 역할별 노출 6건+Auth 설정 1건이다. 익명 API에 접근 가능하다는 사실만으로 취약점이나 침해를 확정하지 않는다. WARN의 제거와 애플리케이션 보안 증명은 서로 다르다.

| ID | 기존 WARN 대상 | 현재 기능·판단 | 개선 후보·종결 증거 |
|---|---|---|---|
| S01 | submit_application / anon | 서비스 신청, 이메일 인증 없는 receipt-only 경로 | 새 verified intake 운영 E2E·전환 승인 후에만 legacy anon+PUBLIC EXECUTE 철회. 즉시 철회 금지 |
| S02 | submit_application / authenticated | 로그인한 사용자도 legacy RPC에 임의 contact 입력 가능 | 인증 role 자체는 confirmed email/소유권 보장 아님. 기존 프런트 호출 제거 검증 후 authenticated 권한도 같이 철회. 새 서버 endpoint는 getUser+DB email/session 재검증 |
| S03 | submit_support_inquiry / anon | 공개 일반 문의 접수는 유지할 제품 요구 | 두 필수 동의·길이·64hex 키·hash 저장 유지. 서버/ingress 공유 제한, CAPTCHA/봇 방어, 본문·키 로그 차단, token 재사용 시 본문 충돌 거부 후보. direct RPC 우회도 막는 단일 ingress 경계 필요 |
| S04 | submit_support_inquiry / authenticated | 인증 고객도 같은 공개 문의 기능 이용 가능 | 역할별 제한을 우회하지 못하게 동일 남용 정책 적용. 관리자 답변 API는 별도 권한. 고객 역할에 직접 support table INSERT/UPDATE 부여 금지 |
| S05 | read_support_inquiry / anon | 문의 UUID+256bit bearer 확인키 hash 일치 시 제한 열 읽기 | 익명 조회 유지, 번호만 조회 금지. server 64hex 검증·read-only scope·균일 실패·시도 제한·no-store·키 유출 시 폐기/재발급 설계. 기존 키를 임의 만료시키지 않음 |
| S06 | read_support_inquiry / authenticated | 로그인 여부와 무관하게 해당 문의 확인키 필요 | 로그인만으로 전체 문의/타 고객 정보 조회 금지. 관리자 전체 조회와 답변 변경은 기존 admin_users RLS 경로로 분리 |
| S07 | leaked password protection disabled | 프로젝트 비밀번호 기반 Auth 보호 설정 | 기존 비밀번호 사용자/관리자 경로와 플랜·비용·영향 확인 후 별도 설정 승인. OTP 도입만으로 해결·예외 PASS 처리하지 않음 |

공식 remediation: [익명 definer 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [인증 사용자 definer 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [비밀번호 보호](https://supabase.com/docs/guides/auth/password-security). 마지막 기능은 공식 문서상 Pro 이상에 해당하므로 현 계정에서 비용 없이 가능한지는 별도 확인해야 한다. 업그레이드를 수행하지 않았다.

공개 문의 함수는 RLS를 단순 invoker로 바꾸면 기존 table GRANT/RLS 때문에 접수/조회가 막힐 수 있다. 권한 오류 해결을 위해 고객에게 support 전체 table 권한을 주지 않는다. 단기에는 좁은 definer+명시적 EXECUTE·빈 search_path·최소 출력·남용 방지의 위험 수용 검토, 장기에는 **익명 이용 가능한 trusted gateway + server-only DB RPC**로 전환하는 후보를 비교한다. 후자의 공개성은 웹 endpoint에 있고 DB 역할 anon의 EXECUTE는 없어도 된다. gateway 보호만 추가하고 직접 호출 가능한 legacy RPC를 남기면 우회 가능하므로 전환 순서를 검증해야 한다. 경고를 숨기려고 스키마만 옮기는 처리는 제안하지 않는다.

## 4. 소스 검토 결과와 미완료

- getUser가 현재 bearer를 서버 검증한 뒤 uid/exp/session_id를 확인하고, 저장 직전 DB의 verified email·세션·token deadline을 다시 확인한다. 이 설계는 코드로 확인했으며 실제 Auth 성공 증거는 기존 합성 54 PASS와 구분한다.
- 신규 신청은 서비스 전용 RPC에서 applications·case·submission·outbox를 하나의 트랜잭션으로 저장한다. `(account_id, request_id)` unique+동일 본문 fingerprint를 사용한다. 고객 입력 contact/email/uid를 신뢰하지 않는다. 원자 저장/동시성 결과는 기존 SQL 35 PASS 재사용.
- receipt outbox는 verified recipient snapshot과 claim/transport 직전 현재 이메일 일치를 확인한다. accepted는 provider 수락, 메일함 도착은 아님. failed만 3회 한도, timeout/lease 상실 unknown은 자동 재시도하지 않는다. 실제 provider idempotency/webhook/반송 대사 및 발송 중 이메일 변경 경쟁의 운영 정책은 미완료.
- support.js는 crypto.getRandomValues 32bytes, URL/localStorage 대신 메모리 pending, 조회 password input·autocomplete off, 출력 textContent 사용을 확인했다. 생성된 확인키는 고객 보관을 위해 readonly input에 보여 주며 이는 의도된 bearer 노출이다. 제3자 script/CSP·확장프로그램/화면 공유·로그 마스킹 위협 검토가 필요하다. 실제 키를 새로 만들거나 수집하지 않았다.
- support-schema.sql의 접수는 64hex, 조회는 length=64+hash 일치이며 조회의 hex 검증은 프런트에만 있다. 검토한 RPC 소스에는 분산 남용 제한·명시적 키 폐기 기능이 없다. 운영 perimeter 제한은 미확인이다. submit의 동일 token/다른 본문 충돌 검사는 후보에서 보완할 과제다.
- 현 신규 client의 실제 Auth event 구독/세션 보관·새로고침 후 request UUID 복구·status polling 제한, OTP gateway HTTP/ingress HMAC·CAPTCHA 연결은 미완료다. 기존 마케팅 홈페이지와 관리자·제작 승인 기능은 이번에 수정하지 않았다.

## 5. 운영 데이터 무변경 연결 검증 준비

테스트 절차와 승인 경계를 [연결 검증 계획](SOLQ_AUTH_REST_CONNECTION_VALIDATION_PLAN_20261112.md)에 분리했다. 이번에는 계획·코드 검토만 했으며 실제 customer account·JWT·OTP로 실험하지 않았다. production anon RPC에 '차단되는지 확인'하려고 POST하지 않는다. 실패 예상 요청도 실제 쓰기/메일을 일으킬 수 있다.

기존 54 PASS의 3개 로그가 commit 661cfd4와 byte-identical임을 확인했다. 테스트는 재실행하지 않았다. 새 SQL cutover 후보도 **미실행/미검증**이며 신규 PASS 숫자를 추가하지 않는다. [미적용 후보](../candidates/customer-platform-20261112/security-gates/legacy-intake-cutover.candidate.sql)는 새 경로 전환 뒤 legacy 신청 2 WARN의 최소권한 정리용이고, 공개 문의 4 WARN을 제거하지 않는다.

## 6. 차단 요인의 발생 원인·다음 승인

| 분류 | 과제 | 이메일 인증 추가와 관계 |
|---|---|---|
| 신규/확대 범위 | SMTP·OTP template·sender DNS·발송량/요금, verified UID 신청 연결, receipt outbox, 새 Auth/REST E2E·고지 | 이번 이메일 기능 운영화를 위해 추가 확인 필요 |
| 기존 문제의 전환 연관 | legacy 신청 익명/인증 EXECUTE, 직접 호출·남용 제한 | 기존에 존재. verified 새 경로 완성 후 안전하게 축소할 기회 |
| 기존 독립 보안 | 공개 문의의 bearer/남용 경계, password protection WARN | 이번 이메일 기능이 생성한 문제가 아님 |
| 기존 독립 배포 관문 | 전체 백업·격리 복원·RPO/RTO·롤백·보안 종결 | 이메일 기능과 무관하게 기존 NO-GO 유지 |

바로 필요한 입력은 **작업용 브라우저의 Supabase 관리자 로그인 세션**이다. 상세 설정 조회만 이어 하며 변경 승인을 뜻하지 않는다. 그 후에야 확인된 sender/SMTP·예상 비용 상한·안전한 테스트 환경·정확한 테스트 주소/발송 건수·신규 스키마/권한 변경과 롤백안을 구체화할 수 있다. 현재 불명확한 금액이나 포괄 운영 배포 승인을 요청하지 않는다.

승인은 분리한다: (1) 안전한 테스트 계정 생성/한정된 OTP·접수 메일 수신과 비용 상한 (2) 운영 DB/권한·Auth/SMTP/DNS 변경 (3) 발송기 활성화/모니터링 (4) 운영 사이트 배포. 각 단계 전에 해당 기존 관문을 확인한다. 이 문서는 어떤 변경도 승인하지 않는다.

이번 실제 메일·새 고객 알림·유료 AI·운영 DB/설정 변경·DNS 변경·계정 생성·운영 배포·신규 결제 **0**. 기존 서비스 청구액/실제 SMTP 추가 비용은 미확인이다. 코드/증거/보고만 개발 브랜치 및 이슈 #10에 저장한다.
