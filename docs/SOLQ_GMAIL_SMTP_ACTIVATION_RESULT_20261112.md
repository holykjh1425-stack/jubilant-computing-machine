# SOLQ Gmail SMTP 저장·활성화 결과 — 2026-11-12 KST

사용자 최종 명령 '저장 활성화한다'에 따라 기존 프로젝트 elfacqmvygnwjlklqhiz의 Authentication → Emails → SMTP Settings에서 Save changes를 1회 실행했다. 관리자 로그인은 Continue with ChatGPT / 사용자 지정 junghwak754@gmail.com으로 진행했다. 발신 Google 계정 및 비밀번호 보관 계정과 구분한다.

## 실제 저장 확인

| 항목 | 저장 후 확인 결과 |
|---|---|
| 프로젝트 | NEXUS LABS / elfacqmvygnwjlklqhiz / main Production |
| Custom SMTP | ON. 새로고침 후 aria-checked=true 유지 |
| Sender Email | ggwell06@gmail.com — 저장 후 UI 화면으로 확인 |
| Sender Name | SOLQ — 새로고침 후 확인 |
| Host / Port | smtp.gmail.com / 465 — 새로고침 후 확인 |
| 암호화 방식 | 465는 Google 공식 implicit SSL/TLS 포트. 실제 연결/TLS handshake 시험은 미실행 |
| Username | ggwell06@gmail.com — 저장 후 UI 화면으로 확인 |
| SMTP Password | 사용자가 직접 입력. 저장 후 'Stored password is hidden. Enter a new password to replace it.' 안내 확인. 원문 조회·기록·캡처 없음 |
| 발송 성공 | 미확인 — 실제 시험/고객 메일 발송 없음 |

수락/전달성/TLS 검증 PASS로 확대하지 않는다. 저장 버튼이 저장 뒤에도 활성으로 표시됐으나 중복 클릭하지 않았다. 새로고침 및 저장된 비밀번호 숨김 안내로 유지 상태를 확인했다.

비밀정보 없는 화면 증거는 비밀번호 영역을 제외하고 캡처했다. SMTP 이메일/사용자 입력값의 DOM 비교는 도구의 가림 처리로 검증에 사용할 수 없어 비밀번호 영역과 분리한 렌더링 화면에서 확인했다. 비밀번호 원문·길이·문자열 비교·hash·복구키·토큰·세션 query는 기록하지 않는다.

## 범위와 잔여 차단

- 이번 승인으로 운영 SMTP 설정만 저장·활성화했다. 현재/향후 발생하는 Supabase Auth 메일은 Gmail SMTP를 사용할 수 있다. 외부 Auth 요청에 의한 발송까지 차단됐다고 주장하지 않는다.
- 에이전트가 발송/OTP/가입/비밀번호 재설정/초대/시험 메일 API를 호출한 횟수 0. 고객 수신함 조회·운영 데이터 변경·Redirect URL 변경·유료 개통·배포·스케줄러 변경 없음.
- Supabase 화면은 Gmail을 개인용 공급자로 판정하며 transactional 메일 전달성에 영향이 있을 수 있다고 경고한다. 경고 미해결.
- 저장 전 UI 및 공식 문서상 custom SMTP 활성 시 30 emails/h 초기 한도 안내. 저장 후 프로젝트의 정확한 잔여 quota/청구 금액은 별도 확인하지 않았다. 개인 Gmail 공식 안내의 일 500개 초과 제한은 보장량/SLA가 아니다.
- 이번 추가 구매·결제 0. 신규 서비스 가입 없음. 향후 계정/프로젝트 전체 사용 비용을 0원으로 확정하지 않는다.
- 접수/제작/수정 메일 transport는 별도 서버 경로다. Auth SMTP 활성화가 기존 개발 후보 배포 또는 해당 자동 안내 기능 연결 완료를 뜻하지 않는다.
- 기존 54 PASS와 신규 45 PASS 재사용. 신규 실메일/운영 통합 테스트 없음. 기존 소스/고객 데이터/Android 업로드 키/보안 폴더/비밀번호 관리자 항목 변경 없음.
- 기존 Site URL localhost 및 redirect allowlist, 실제 프런트/서버 연결, 보안 경고 7건·백업/복원/RPO/RTO 등 미종결 상태를 유지한다. 운영 사이트 배포 NO-GO.

## 다음 단계의 별도 승인

1. 테스트 전용 수신함, 종류, 최대 건수/재전송 및 비용 상한을 정한 SMTP 시험 발송.
2. 운영 Auth Site URL / 정확한 redirect 변경과 링크 인증 연결, 기존 후보 DB migration 및 배포.
3. 고객 자동 안내/운영 워커 활성화.

롤백 후보: 별도 승인 후 이 프로젝트의 Custom SMTP를 OFF로 저장해 기존 Supabase 기본 메일 경로로 복귀한다. 기존 기본 서비스는 운영용 전달성/수신자 제약이 있으므로 정상 고객 발송 복구를 보장하지 않는다. Google 앱 비밀번호 폐기는 별도 사용자 승인·수행이며 이번에 실행하지 않았다.

공식 확인 자료:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/kb/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y
- https://developers.google.com/workspace/gmail/imap/imap-smtp
- https://support.google.com/mail/answer/22839?hl=ko
