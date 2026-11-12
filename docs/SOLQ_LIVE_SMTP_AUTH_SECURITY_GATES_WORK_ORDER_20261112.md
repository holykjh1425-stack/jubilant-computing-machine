# SOLQ COMMAND — 실제 SMTP·Auth 조회 및 운영 차단 요인 해소 지시 (2026-11-12)

ATLAS 읽기 전용 확인 결과에 근거. 기존 개발 브랜치 dev/solq-customer-chat-pricing-20261112, 이슈 #10, 이메일 인증 후보 커밋 661cfd4를 사용한다. 운영 변경/실제 이메일 발송/유료 결제 승인 없음.

## 이미 확인된 사실 — 반복 점검 금지
- Supabase 프로젝트 elfacqmvygnwjlklqhiz ACTIVE_HEALTHY; 2026-11-12 04:38Z advisor 7 WARN.
- 3개 SECURITY DEFINER 함수가 anon 및 authenticated 실행 가능: public.submit_application, public.submit_support_inquiry, public.read_support_inquiry. 동일 3개 함수가 역할별로 6 WARN, Auth leaked password protection disabled 1 WARN.
- submit_application은 이메일 인증 없이 개인정보 동의·입력 검증 후 applications에 저장. 기존 접수 중단 방지를 위해 즉시 REVOKE 금지.
- submit_support_inquiry는 동의/길이/64자리 토큰 형식 검증 후 해시 저장; read_support_inquiry는 ID와 토큰 해시 일치 시 제한된 열 조회. 외부 직접 API 호출 가능 자체는 취약점 확정이 아니며 스팸/남용/토큰 관리 및 개인정보 정책을 별도 점검.
- verified-email 후보 격리 검증 35 SQL +16 JS +3 회귀 =54 PASS(워커 보고); 기존 검증 증거 재사용.
- 공식 문서: https://supabase.com/docs/guides/auth/auth-smtp . Supabase 기본 SMTP는 팀 이메일 중심 비운영용; 일반 고객 발송은 custom SMTP 검토 필요.

## 워커 작업 순서
1. Supabase Dashboard의 Auth > Providers > Email, Auth > SMTP, Email Templates, Rate Limits, URL Configuration 및 이메일 확인 정책을 **읽기 전용**으로 확인. 비밀키·SMTP 암호·토큰은 기록·출력 금지. 활성/미활성, 발신 도메인, 한도, 비용, 템플릿, redirect allowlist만 기록. 조회 불가 시 미확인 명시.
2. 기존 발송 인프라/도메인 DNS SPF·DKIM·DMARC 및 이메일 발송 서비스 사용 여부를 비밀정보 노출 없이 조사. 무료 한도와 실제 비용을 확인하되 신규 계정/서버/유료 API 생성 금지.
3. 실제 Supabase Auth/REST에 필요한 통합 검증 시나리오와 테스트 계정·메일 발송 승인 범위를 작성. 실제 OTP 발송/계정 생성/운영 DB 쓰기는 승인 전 금지. 후보 코드의 getUser, verified email, 신청 UID 결합, 트랜잭션, outbox 중복 방지, 이메일 수신자 일치, 세션 만료·전환, 실패 재시도를 소스 수준에서 점검.
4. 보안 7 WARN을 3개 함수의 익명/인증 역할별 6건과 Auth 비밀번호 보호 1건으로 분류. 공개 문의 유지 정책을 반영하여 최소권한·남용 방지·비밀 토큰 보호·관리자 경로 분리를 설계. 운영 함수 변경 없이 dev 브랜치 수정안/마이그레이션 후보만 작성.
5. 기존 백업/격리 복원/롤백/RPO/RTO 미완료를 별도 기존 배포 관문으로 유지. 이메일 인증 추가 때문에 생긴 차단 요인과 무관한 기존 문제를 혼동하지 않는다.
6. 비용 0원·기존 데이터 보존·고객 알림 0건 유지. 실제 실행한 조회와 합성 검증만 PASS 표시. 결과를 이슈 #10 및 개발 브랜치에 기록하고 운영 적용에 필요한 승인 목록을 보고.

## STOP 조건
운영 DB DDL/DML, RLS/GRANT 변경, Auth 설정·SMTP 변경, 신규 메일 전송, 외부 전송, 운영 배포, 과금 발생, 기존 데이터 삭제는 별도 명시 승인 없이는 중단.
