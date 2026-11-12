# SOLQ 운영 발신 이메일 연결 준비 — 2026-11-12 KST

사용자 지정 발신 주소 **ggwell06@gmail.com**. 기존 프로젝트 `elfacqmvygnwjlklqhiz`, 기존 브랜치 `dev/solq-customer-chat-pricing-20261112`를 사용한다. [발신자 지정](SOLQ_CUSTOMER_EMAIL_SENDER_GGWELL06_20261112.md), [기존 SMTP 조사](SOLQ_LIVE_SMTP_AUTH_SECURITY_GATES_RESULT_20261112.md), [이메일 신청 지시](SOLQ_VERIFIED_EMAIL_APPLICATION_WORK_ORDER_20261112.md)를 확인했다.

**발신자 후보 준비 완료 / 실제 연결·계정 보안 확인·시험/고객 발송 미실행 / 운영 NO-GO.** [후보 설정](../candidates/customer-platform-20261112/verified-email/sender-profile.candidate.json)은 문서용이며 어떤 transport도 만들거나 실행하지 않는다. 이메일 주소 지정은 SMTP 등록 완료를 의미하지 않는다.

## 1. Supabase 관리자 로그인과 현재 상태

기존 SMTP 설정 탭은 여전히 Supabase 로그인 화면이다. 사용자의 '로그인이 필요하면 안전한 화면 제공' 지시에 따라 browser secure sign-in 선택 화면(GitHub/ChatGPT/SSO/email-password)을 제공했으나 로그인은 완료되지 않았다. 재시도·자동 계정 선택·계정 생성·설정 저장은 하지 않았다. SMTP 활성·현재 발신 주소/이름·템플릿·실한도/요금은 여전히 미확인이다. 기존 public settings의 email=true / mailer_autoconfirm=false 및 54 PASS는 과거 확인 증거로 재사용한다.

후속 사용자 질문에 대해 기존 기록을 확인했다. 2026-11-01 사용자가 '챗지피티로 로그인됨'을 확인했고, 11-10 기록에도 ChatGPT 인증으로 기존 NEXUS LABS 조직·프로젝트 접근 성공이 있다. 기존 성공 방식은 **Continue with ChatGPT**다. 현재 로그인 성공·올바른 프로젝트 접근은 다시 확인해야 한다. 고객 발신 주소를 Supabase 관리자 로그인 이메일로 바꾸거나 자동 연결하지 않는다. 로그인 식별자/Owner의 과거 기록이 여러 개이므로 이 문서는 특정 이메일과 현재 관리자 계정의 일치를 새로 확정하지 않는다.

로그인 후 읽을 항목: SMTP enable/provider/port/From address·name, Email provider·확인 정책, OTP/매직링크 템플릿·길이/기한, Rate Limits, Site URL/redirect allowlist, 현재 플랜/잔여 quota/요금. 비밀 입력값은 읽거나 출력하지 않고 수정·테스트 버튼은 누르지 않는다. 로그인 및 읽기 승인은 SMTP 변경·credential 등록 승인이 아니다.

## 2. Gmail SMTP 기술적 연결 가능성

**일반 기술상 연결 가능한 후보**다. Google 공식 문서는 smtp.gmail.com의 587 STARTTLS 및 465 implicit TLS, OAuth 2.0 기반 SMTP 인증을 설명한다. Supabase custom SMTP 문서는 SMTP host/port/user/password 설정을 제공한다. 그러나 현 계정의 보안 정책·비밀정보와 실제 Supabase UI를 확인하지 않았으므로 ggwell06 계정으로 연결이 성공한다고 보장하거나 PASS 처리하지 않는다.

| 설정 후보 | 값·조건 |
|---|---|
| From | ggwell06@gmail.com |
| From display name | SOLQ (제안값, 미등록) |
| Reply-To | ggwell06@gmail.com (지원 여부/실제 헤더 확인 필요) |
| Host/port | smtp.gmail.com / 587 |
| TLS | STARTTLS 필수·인증서 검증 유지. 465 implicit TLS는 실제 UI/제공자 지원 확인 시 대안 |
| Username | ggwell06@gmail.com |
| Password | 미생성·미등록·미수집. 일반 계정 비밀번호를 코드/채팅에 넣지 않음 |
| Auth/receipt/completion | 동일 From을 목표로 하되 각 transport에서 실제 헤더·정책 검증 필요 |

앱 비밀번호 방식은 Google 계정의 2단계 인증이 전제다. 보안 키만 사용하는 설정, 조직 정책, Advanced Protection 등에 따라 생성 옵션이 없을 수 있다. 현재 계정의 2단계 인증·보호 설정·앱 비밀번호 가용성은 **미확인**이다. Google은 지원되는 경우 OAuth/Google 로그인 방식을 우선 안내한다. Supabase 기본 SMTP 화면에서 OAuth token 갱신까지 지원되는지는 미확인이고, 일회성 access token을 password 필드에 넣는 방식은 제안하지 않는다. 기존 OAuth 구성이 없다면 새 Google 프로젝트/앱 등록은 이번 범위 밖이다.

필요한 사용자 절차(아직 미실행):
1. 기존 Google 계정 ggwell06의 소유자 인증 및 현재 보안 상태를 안전한 화면에서 확인한다. Gmail 로그인과 Supabase 로그인을 혼동하지 않는다.
2. 2단계 인증 변경이나 SOLQ 전용 앱 비밀번호 생성이 필요하면 변경 범위·접근 위험·폐기 방법을 먼저 보고하고 별도 승인을 받는다. 새 비밀정보 생성은 사용자가 보호 화면에서 직접 수행한다.
3. 승인 이후에만 새 비밀을 Supabase의 보호된 SMTP credential 입력/기존 승인된 서버 secret 저장소에 직접 등록한다. GitHub·이슈·채팅·로그·캡처에 값을 기록하지 않는다. 모델이 값을 복사/중계하지 않는다.
4. 승인된 합성 수신함·건수/요금 상한으로 TLS/인증·From/Reply-To·스팸함·반송을 검증한다. 승인 전에는 SMTP AUTH 연결 시험도 하지 않는다.
5. 향후 Google 비밀번호 변경으로 앱 비밀번호가 폐기될 수 있으므로 중단/재인증·폐기 절차를 운영 장부에 남긴다. 기존 설정을 약화하거나 2단계 인증을 끄지 않는다.

**Gmail 주소 사용 시 DNS 구분:** From 도메인은 gmail.com이다. 사용자가 gmail.com의 SPF/DKIM/DMARC를 직접 수정하는 것은 아니다. 앞선 solqtech.com 루트 DNS 미확인은 ggwell06@gmail.com 발송을 직접 차단하는 증거가 아니다. 향후 From을 @solqtech.com으로 바꿀 때만 해당 발신 도메인 검증/DNS 정합성을 별도로 검토한다. 실제 수신 헤더에서 Google 인증/alignment를 확인해야 한다.

## 3. 발송 한도·예상 비용

Google 개인 Gmail 안내는 하루 500개를 넘는 발송 또는 한 메일 500명 초과 수신자에서 제한 오류가 날 수 있다고 설명한다. 이는 ggwell06의 실잔여량·운영 SLA·500건 보장이나 업무 자동화 안전 한도를 뜻하지 않는다. 정상 사용자 발신·다른 앱·OTP·접수·완료·수정 메일이 동일 계정 제한을 함께 사용할 수 있다. 반송/남용 탐지로 더 일찍 차단될 수도 있다.

Supabase 기본 SMTP 제한과 custom SMTP 적용 후 Auth 제한도 별도다. 현 프로젝트의 Rate Limits·동시 처리 제한·quota·SMTP 요금·계정 상태는 미확인이다. Auth SMTP만 등록해도 receipt/completion 서버 메일러가 자동 연결되지는 않는다.

운영량 계산(가정): 신규 신청 N명의 OTP+접수 약 2N, 제작 완료 C건, 수정 완료 R건, 재인증/재전송 F건이면 총 **2N+C+R+F**건에 개인 발신을 더한다. 수신자 1명 기준의 planning 식이며 actual invoice나 provider rate 보장이 아니다. 비용은 현재 SMTP/기존 요금 근거를 확인한 뒤 산정한다. 새 유료 서비스 가입·Google Workspace 구매·서버·SMTP relay 구매는 하지 않는다. **이번 추가 결제·실제 메일 0**이며 향후 운영 비용을 0원으로 확정하지 않는다.

공식 근거(2026-11-12 확인):
- [Google Gmail SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp)
- [Google 앱 비밀번호](https://support.google.com/accounts/answer/185833?hl=ko)
- [Gmail 한도](https://support.google.com/mail/answer/22839?hl=ko)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## 4. 고객 흐름·메일별 연결 준비

**이메일 인증 → 신청서 작성 → 저장·접수번호 발급 → 접수 메일 outbox → 무료 계획·견적 → 견적 동의 → 입금 확인 → 별도 제작 승인 → 인증된 채팅에서 일정 안내 → 검증된 제작 완료 → 완료 메일 outbox.**

| 메일 | 기존 후보 상태 | 실행 전 추가 조건 |
|---|---|---|
| 이메일 인증 | OTP gateway/6자리 UI·합성 검증. 실제 provider 미연결 | Supabase custom SMTP·OTP template·가입/발송 승인·실제 계정 확인 |
| 접수번호·접수 안내 | 원자 application/case/submission/outbox·중복/상한3회/unknown 분리 구현 | 기존 승인된 서버 transport 연결·verified recipient·실제 SMTP 수신 검증 |
| 제작 완료 | 발신자/이벤트 설계만. 완료 이벤트 outbox/transport 미구현 | 서버의 실제 검증 완료 상태·계약/승인/고객 소유권 확인, (application, version, event) 중복키·민감정보 없는 안내 |
| 수정 완료 | 발신자/이벤트 설계만. 자동 발송 없음 | 승인된 수정 범위·버전·검증 완료, 고객별 recipient·동일 버전 중복 방지 |

제작 일정은 견적 동의·실제 입금 확인·별도 제작 승인 이후에만 서버가 확정해 채팅에 안내한다. 입금 전 임의 날짜·확정 완료일을 발송하지 않는다. 실패/초안 생성/worker가 주장한 완료를 실제 완료로 취급하지 않는다. 검증·고객 접근이 통과된 결과와 실제 공개 배포 완료도 구분한다. 완료 메일에는 신청서 본문·OTP·bearer·확인키·비밀 query·고객 개인정보를 넣지 않는다. 수신자는 발신자 ggwell06이 아니라 해당 고객의 확인된 이메일이다.

## 5. 실제 연결·시험 발송 전에 필요한 별도 승인

| 승인 | 구체화할 범위 | 현재 |
|---|---|---|
| Google 보안/비밀 | 필요한 경우에만 2단계 인증 설정 및 SOLQ 전용 앱 비밀번호 1개 생성·보호 등록·폐기 | 미승인/미실행 |
| Supabase Auth SMTP | 현재 설정 안전 snapshot → host/port/TLS/From/name/credential 변경, OTP 템플릿·Rate Limits·정확한 redirect, 롤백 | 미승인/미실행 |
| 서버 메일러 | 기존 서버 권한·secret 저장·global Gmail quota와 outbox 연결, 신규 서버/자동 실행 없음 | 미승인/미실행 |
| 한정 시험 | 전용 테스트 recipient A/B·OTP/접수/완료 종류별 정확한 건수·재전송 포함 상한·비용 상한 | 승인 0건 |
| 실제 고객 활성화 | 기존 보안·백업/격리 복원/RPO/RTO·롤백 종결과 별도 배포/고객 발송 승인 | NO-GO |

현재 실제 변경 전 snapshot을 읽을 관리자 로그인도 완료되지 않았으므로 비용/현재 설정을 모른 채 포괄 변경 승인을 요청하지 않는다. Google 보안 설정 변경과 비밀 등록은 단순 발신 주소 지정 승인으로 대체하지 않는다. 로그인은 기존 Continue with ChatGPT 성공 기록을 바탕으로 사용자가 안전한 화면에서 선택할 수 있다.

기존 보안 경고 7건은 미해결 상태로 유지한다. 이메일 인증 54 PASS는 재사용하고 반복 실행하지 않았다. 이번 후보는 설정/준비 문서뿐이므로 새 기능 통합·전송 성공 PASS를 추가하지 않는다. 운영 데이터/기존 신청/가격·무료 계획·관리자 승인 기능을 변경하지 않았다. 새 서버·서비스·비밀·계정·발송·결제·운영 배포 0.
