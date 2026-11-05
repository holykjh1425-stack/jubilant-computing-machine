# SOLQ 보안 경고 7건 사전 검토 — 2026-11-05 10:12 KST

범위: Supabase 운영 프로젝트 elfacqmvygnwjlklqhiz의 읽기 전용 Advisor 및 pg_proc 조회. 고객 행 조회, 운영 설정 변경, 배포 없음.

## 확인
- 보안 Advisor WARN 7건: 공개 SECURITY DEFINER 함수 3개 × anon/authenticated 2역할 = 6건; Auth 유출 비밀번호 보호 비활성 1건.
- 함수 3개의 소유자는 postgres, SECURITY DEFINER=true, anon/authenticated EXECUTE=true.
- public.submit_application: 신청서 입력 검증 후 applications INSERT, receipt_number 반환. 공개 신청 흐름이므로 즉시 REVOKE/SECURITY INVOKER 전환 시 장애 가능.
- public.submit_support_inquiry: 입력·동의·64자리 토큰 검증, 토큰 해시 저장, 문의 INSERT. 공개 문의 흐름이므로 즉시 권한 제거 시 장애 가능.
- public.read_support_inquiry: 문의 ID와 64자리 접근 토큰의 해시 비교 후 해당 문의 답변 반환. 공개 조회 경로이며 토큰 보호·남용 제한 검증 필요.
- 함수 코드에 search_path=''가 설정되어 있으며 객체가 스키마 한정되어 있음. 이 사실만으로 안전하다고 단정할 수 없음.
- 비밀번호 유출 보호는 비활성. 설정 변경을 수행할 수 있는 인증 관리 도구 및 실제 로그인 영향 확인 필요.

## 처리 판단
- 현재 경고 7건은 미해결. 경고 수를 0으로 만드는 목적의 일괄 권한 박탈 금지. 공개 고객 신청/문의 장애 및 RLS 우회 경계가 충돌함.
- 우선 비운영 환경에서 공개 함수별 인증·토큰 검증, 남용 방지, 최소권한 구조를 시험하고 관리자 인증/백업 복원 관문을 통과한 뒤 운영 반영.
- 비밀번호 보호 활성화는 Auth 설정 접근·로그인 영향 검토 및 운영 변경 승인 후 수행.
- 운영 설정 변경, SQL DDL, 고객 데이터 변경, 유료 작업, 재검증 PASS 주장 없음.

## 근거
- https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security

판정: 사전 조사 완료 / 경고 해소 미완료 / 운영 NO-GO.
