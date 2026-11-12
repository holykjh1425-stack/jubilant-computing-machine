# SOLQ 지정 수신함 SMTP 시험 요청 결과 — 2026-11-12 KST

사용자 지시: holykjh1425@gmail.com으로 발송 테스트. 수신 대상 1개 / 요청 1회 / 자동 재시도 없음.

## 실행과 결과

- 기존 운영 SMTP ON은 14bd489의 저장·새로고침 확인 증거 재사용.
- SMTP 설정 화면에는 직접 시험 발송 버튼이 없었다.
- Supabase Auth Users 화면 진입은 자동 승인 검토에서 고객 인증 데이터 접근 범위가 불필요하다는 이유로 거절됐다. 고객 목록을 열거나 다른 경로로 목록을 조회하지 않았다.
- 더 좁은 경로로 기존 사이트의 publishable key를 메모리에서만 사용해 /auth/v1/otp에 지정 주소 및 create_user=false 요청 1회 실행. service_role/관리자 토큰/SMTP 비밀을 조회하거나 사용하지 않았다.
- **HTTP 422 / errorCode otp_disabled / requestAccepted=false**.
- 새 계정 생성·기존 비밀번호 변경·인증 링크 소비·로그인 검증·Redirect/SMTP/Auth 설정 변경·고객/운영 DB 행 수정·유료 개통·배포 없음.
- 이 요청은 일반 임의 제목 메일이 아니라 현 Auth 링크 템플릿을 통한 인증 메일 발송 경로의 시험이었다. 신규 가입은 명시적으로 금지(create_user=false)했다.
- 요청이 Auth 오류로 거절됐으므로 SMTP 송신·수신 성공 PASS 아님. 해당 주소의 미등록 여부와 OTP 경로 정책 중 어느 원인인지는 이번 제한된 응답만으로 확정하지 않는다. SMTP 앱 비밀번호 오류로 해석하지 않는다.
- 실제 수신 확인 없음. 발송 성공 0건 확인, 성공 여부 모호한 SMTP 요청을 반복하지 않았다.
- 기존 54/45 PASS 재실행 없음. 추가 구매·결제 0.

## 다음 실행에 필요한 한정 범위

지정 주소만을 대상으로 기존 Auth 등록/발송 가능 경로를 확인하는 읽기 전용 조회 또는 테스트 Auth 계정 생성이 필요한 경우 별도 사용자 승인 필요. 다른 고객 목록 조회, 초대/비밀번호 재설정/계정 신규 생성으로 임의 대체하지 않는다. 계정 생성은 메일 발송 승인에 포함됐다고 가정하지 않는다.

SMTP ON 상태는 유지하며 이 실패를 이유로 운영 설정을 자동 변경·롤백하지 않는다. 실수신/TLS/전달성은 미검증이다.

공식 참조:
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/guides/auth/debugging/error-codes
- https://github.com/supabase/auth/blob/master/README.md
