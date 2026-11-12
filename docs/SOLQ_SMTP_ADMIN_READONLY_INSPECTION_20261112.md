# SOLQ SMTP 관리자 실조회 결과 — 2026-11-12

대상: elfacqmvygnwjlklqhiz / NEXUS LABS / 개발 브랜치 dev/solq-customer-chat-pricing-20261112.
조회 종료 기록: 2026-11-12 05:49 UTC. 조회 전용. 실제 발송·설정 저장·DB 변경·배포·결제 없음.

## 확인된 현재 사실

| 항목 | 실제 UI 확인 결과 | 판정 |
|---|---|---|
| 관리자 접속 | Continue with ChatGPT 로그인 후 사용자 선택 계정으로 대상 프로젝트 접근 성공 | PASS(대시보드 접근만) |
| 조직/브랜치 | NEXUS LABS Pro / main Production | 확인 |
| Custom SMTP | Toggle SMTP = 0, Save changes disabled | 비활성 확인 |
| 현재 발송 서비스 | Templates 화면에 built-in email service 사용 및 production apps 용도가 아니라는 경고 | 확인 |
| 발신 주소·이름·SMTP 서버 | SMTP가 꺼져 필드 미표시. 토글을 바꾸지 않음 | 미확인 |
| 이메일 가입/확인 | Email Enabled, Allow new users to sign up ON, Confirm email ON | 확인 |
| 가입 확인 템플릿 | subject: Confirm your email address. 본문은 ConfirmationURL 링크 | 확인 |
| Magic link or OTP 템플릿 | subject: Your sign-in link. 본문은 ConfirmationURL 링크; Token 숫자 출력 없음 | OTP 후보와 불일치 / NO-GO |
| Auth 시간당 이메일 한도 | disabled 필드, 도구 출력에서 값이 가려짐. 복구/우회 시도 없음 | 미확인 |
| 동일 사용자 최소 간격 | 60초 표시. UI 설명상 Custom SMTP 설정 시 적용 | 확인(현재 적용된 발송 능력 아님) |
| Site URL | http://localhost:3000 | 운영 연결 NO-GO |
| Redirect URLs | No Redirect URLs | 운영 연결 NO-GO |
| 요금 | 조직 Pro 표시만 확인. 실제 청구/잔여량/계약·Gmail 계정별 비용은 조회하지 않음 | 미확인 |

대시보드 접속 PASS는 SOLQ 고객/관리자 Auth·RLS 운영 연결 PASS가 아니다.
이 문서는 이전 연결 준비 문서의 '관리자 로그인 차단·SMTP 미조회'를 현재 실조회 결과로 보완한다. 이전 문서와 증거는 삭제/덮어쓰기하지 않는다.
ggwell06@gmail.com은 고객용 발신자 후보이며 Supabase 관리자 계정과 구분한다. Gmail Custom SMTP 활성 연결은 현재 확인되지 않았고 비활성 상태다. 숨겨진 과거 설정의 존재/부재는 단정하지 않는다.

## 발송 경로와 기존 증거

| 종류 | 경로 | 준비/실제 상태 |
|---|---|---|
| 인증 메일 | Supabase Auth → 현재 built-in, 승인 후 Custom SMTP 후보 | 현재 링크 템플릿. 6자리 OTP 후보 적용·실수신 미검증 |
| 신청 접수 | 기존 trusted server → 원자 신청/접수번호/outbox 후보 → 별도 SMTP transport | 합성 검증만. 실제 transport 미연결 |
| 제작 완료·수정 완료 | 검증된 완료 이벤트 → 고객 소유권/승인 확인 → 별도 outbox/transport | 이벤트 연결/실발송 미구현 |

Auth SMTP 등록만으로 접수·완료 메일러가 연결되지 않는다. 접수번호 발급은 신청 저장 직후이며 메일 수신 여부와 별개다.
기존 54 PASS(35 SQL + 16 JS + 3 scoped Auth regression)를 재사용했다. 관련 로그: candidates/customer-platform-20261112/evidence/verified-email-sql.txt, verified-email-js.txt, verified-email-auth-regression.txt.
기존 verified-email/README.md가 숫자 OTP와 실제 템플릿 승인 필요를 명시한다. 테스트 재실행·운영 고객 조회·이메일 전송 시험은 하지 않았다.

## Gmail 연결 조건·비용

기술 후보: From/username ggwell06@gmail.com, 표시명 SOLQ(제안), smtp.gmail.com:587 STARTTLS 필수·인증서 검증 유지(465 implicit TLS 대안).
Google 앱 비밀번호 방식이면 2단계 인증과 앱 비밀번호 생성 가용성이 필요하다. 현재 계정 소유권/2단계 인증/정책/앱 비밀번호 가용성은 미확인이다. Google은 지원되는 경우 OAuth/Google 로그인 방식을 권장한다. Supabase SMTP UI에서 OAuth 갱신 지원은 확인하지 않았다. 일반 비밀번호·단기 OAuth 토큰을 임의 입력하지 않는다.
개인 Gmail 공식 안내는 하루 500개 초과 또는 단일 메일 수신자 500명 초과 시 제한 오류가 날 수 있음을 설명한다. 이는 해당 계정의 보장 용량·잔여 quota·SLA가 아니다. 다른 메일 및 재전송도 공동 한도에 포함될 수 있다.
이번 추가 결제 0원, 실제 메일 0건. 향후 운영비는 실제 계정/사용량 확인 전 확정 불가. 신규 Workspace·유료 SMTP·서버 가입하지 않음.

공식 자료(같은 날 확인):
- https://supabase.com/docs/guides/auth/auth-smtp
- https://developers.google.com/workspace/gmail/imap/imap-smtp
- https://support.google.com/accounts/answer/185833?hl=ko
- https://support.google.com/mail/answer/22839?hl=ko

## 차단 요인과 다음 승인 범위

1. Google 계정 소유자가 보안 상태·앱 비밀번호 가용성을 안전한 화면에서 확인. 보안 변경/새 credential 생성은 별도 승인 및 사용자 직접 수행. 비밀은 채팅·GitHub·로그에 기록하지 않음.
2. 별도 승인 후에만 From/name/host/port/TLS/보호 credential 등록 및 Custom SMTP 활성화. 변경 전 실제 설정 보존, 롤백은 Custom SMTP 비활성 및 승인 전 설정 복원. built-in 복귀는 고객 발송 허용을 뜻하지 않음.
3. OTP 방식이면 signup 및 magic-link 템플릿 모두 Token 숫자 코드와 정책/길이/만료 정합성 확인. 운영 URL·정확한 allowlist·Auth 한도 변경은 별도 승인 필요. 광범위 wildcard 금지.
4. 전용 테스트 수신함·메일 종류·최대 건수·재전송/요금 상한을 정해 한정 시험 발송 승인 필요. 현재 승인 건수 0.
5. 접수 transport와 제작/수정 완료 이벤트는 독립 개발·격리 검증 필요. 자동 실행 및 실제 고객 활성화 별도 승인.
6. 기존 보안 경고 7건 및 백업/격리 복원/RPO/RTO/롤백 차단은 미종결. 재검사 없이 기존 증거 상태 유지. 운영 배포 NO-GO.

## 읽기 전용 증거 URL

- https://supabase.com/dashboard/project/elfacqmvygnwjlklqhiz/auth/smtp
- https://supabase.com/dashboard/project/elfacqmvygnwjlklqhiz/auth/templates
- https://supabase.com/dashboard/project/elfacqmvygnwjlklqhiz/auth/templates/confirm-sign-up
- https://supabase.com/dashboard/project/elfacqmvygnwjlklqhiz/auth/templates/magic-link-or-otp
- https://supabase.com/dashboard/project/elfacqmvygnwjlklqhiz/auth/providers
- https://supabase.com/dashboard/project/elfacqmvygnwjlklqhiz/auth/rate-limits
- https://supabase.com/dashboard/project/elfacqmvygnwjlklqhiz/auth/url-configuration

위 URL은 권한 있는 관리자 로그인 후 볼 수 있는 설정 화면이다. 공개 저장소에는 비밀정보·고객 데이터·인증 세션 값을 넣지 않았다. UI 현재값 관찰을 기록한 것으로 SMTP 연결/TLS/실제 수신 성공 증거는 아니다.
