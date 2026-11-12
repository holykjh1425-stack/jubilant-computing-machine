# SOLQ 실제 인증 이메일 1건 시험 결과

2026-11-12 KST. 사용자 명시 승인에 따라 지정 시험 수신함 `holykjh1425@gmail.com`에 한정해 기존 프로젝트 `elfacqmvygnwjlklqhiz`의 Auth 링크 인증 요청을 **1회** 실행했다. 기존 Gmail SMTP `ggwell06@gmail.com` 설정을 사용하며 재등록/비밀번호 조회·재발급/설정 저장을 하지 않았다.

## 확인 결과

| 항목 | 실제 확인 결과 |
|---|---|
| 요청 전 지정 주소 Auth 등록 | 0개. 정확한 주소 조건의 count/boolean만 조회 |
| 현재 공개 Auth settings | GET 200, email=true, disable_signup=false, mailer_autoconfirm=false, anonymous_users=false |
| 발송 요청 | POST /auth/v1/otp 1회, create_user=true. 가입과 인증 메일을 동일 요청으로 처리 |
| 시작/종료 | 2026-11-12 18:35:41.228 ~ 18:35:51.990 KST |
| 응답 시간 | 10.761초. HTTP 요청 응답 소요 시간이며 받은편지함 배달 시간 아님 |
| 응답 | HTTP 200, request_accepted=true, error_code=null |
| 요청 후 지정 주소 Auth 등록 | 1개. created_during_approved_test=true |
| 인증 발송 기록 | confirmation_sent_recorded=true |
| 이메일 인증 완료 | 조회 시점 false. 링크 소비/토큰 교환을 실행하지 않음 |
| SMTP 오류 | Auth 응답에 오류 없음. SMTP 내부 로그·TLS handshake를 별도 열람하지 않음 |
| 사용자 수신 | **미확인 — 사용자 확인 대기** |

원문 응답·인증 링크·토큰·사용자 UUID·비밀번호를 저장하거나 출력하지 않았다. 기존 사이트의 공개 publishable key는 메모리에서만 사용했고 보고서에 복사하지 않았다. 응답/네트워크 모호성을 이유로 자동 재시도하는 코드는 없으며 중복 실행 방지 표식으로 동일 시험의 2회 실행을 막았다. API redirect도 자동 추적하지 않았다.

## 보존·제한

- 이 요청 전후 다른 고객 Auth 목록/행은 조회하지 않았다. 기존 고객 신청·무료 계획·견적·입금·별도 제작 승인·제작 행의 직접 수정/삭제 명령 없음. 이번에는 기존 고객 전체 행 지문을 재조회하지 않았으므로 전체 데이터 무결성 재검증 PASS를 새로 주장하지 않는다.
- 승인된 시험 Auth 사용자 1개 생성 및 Auth 시스템의 해당 인증 발송 기록만 확인했다. 별도 SQL INSERT/UPDATE/DELETE/DDL 없음.
- SMTP/운영 Auth URL/템플릿/DB 구조 변경, 신규 서비스·비용·운영 배포·추가 메일 발송 없음. 기존 54+45+10 PASS 재실행 없음.
- 요청에 redirect override를 넣지 않아 기존 Auth 설정을 그대로 사용했다. 이전 실조회에서 Site URL은 localhost였으며 이번에 URL 설정을 수정하거나 다시 조회하지 않았다. **이번 검증은 발송·수신 확인에 한정되며 링크 클릭 후 SOLQ 로그인/신청 완료 검증이 아니다.** 수신 확인 시 인증 링크/코드는 보내지 않아도 된다. 링크 클릭은 이번 시험에 필요하지 않다.
- Auth 요청 수락 + 지정 사용자 생성 + confirmation_sent 기록은 확인했으나 받은편지함 도착·스팸 분류·수신 지연은 사용자 확인 전 미확인이다. 접수/완료 안내 자동 발송 연결은 별도 잔여 과제다.

증거: [비밀값 없는 시험 결과](../candidates/customer-platform-20261112/evidence/auth-email-single-live-test.json).

공식 경로 근거: [Passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless). signInWithOtp는 기본 링크 템플릿을 사용하고, 신규 생성이 허용되면 미등록 사용자를 가입시킬 수 있다. 이번에는 사용자 승인 범위의 주소 1개에만 적용했다.
