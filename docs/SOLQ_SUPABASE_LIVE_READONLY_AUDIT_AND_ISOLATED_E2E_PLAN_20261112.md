# SOLQ — 실제 Supabase 읽기 전용 보안 진단 및 격리 연결 검증 준비

일자 2026-11-12. 프로젝트 `elfacqmvygnwjlklqhiz`. 운영 변경 없음.

## 실제 확인
- Supabase Security Advisor: WARN 7 findings, three groups.
  - anon 실행 가능한 SECURITY DEFINER: `public.read_support_inquiry`, `public.submit_application`, `public.submit_support_inquiry` 각 1건.
  - authenticated 실행 가능한 동일 SECURITY DEFINER 3건.
  - Auth leaked password protection disabled 1건.
- `public.applications`, `public.admin_users`, `public.ai_work_plans`: RLS enabled=true. 이것만으로 정책 안전성 보장되지 않음.
- 이전 읽기 전용 조회에서 신규 `solq_customer_*` 및 `solq_customer_private` 테이블은 0개.
- 기존 `admin_users` SELECT는 자기 user_id만, `applications`는 관리자 SELECT/UPDATE 및 공개 INSERT 정책.

## 판단
- WARN 7건은 7개의 독립적인 함수가 아니라 **동일 3개 함수의 역할별 노출 6건 + Auth 설정 1건**. 외부에 공개된 고객 접수 RPC를 무조건 REVOKE하면 신청 기능 중단 가능. 기존 호출 경로·입력 검증·레이트리밋·토큰 검사·출력 민감정보를 먼저 정적/격리 감사.
- 실제 Supabase Auth 고객 A/B 및 PostgREST E2E는 **미실행**. 인증 세션·테스트 계정·독립 DB 환경이 준비되지 않은 상태에서 운영 DB에 시험 INSERT/DDL/계정 생성 금지.

## 격리 연결 검증 실행계획 (CORE/SENTINEL/GUARD)
1. 실제 운영 RPC 세 함수의 **함수 정의·권한·호출자**를 읽기 전용으로 점검. 공개 기능이 필요한지 분류하고, 권한 축소 후보를 개발 브랜치에 작성. 운영에 즉시 REVOKE 금지.
2. 실제 Supabase Auth 설정 및 세션 검증 경로를 비밀키 없이 확인. 기존 운영 사용자의 JWT/OTP/비밀번호를 수집하거나 사용하지 않는다.
3. 기존 격리 PostgreSQL 17.11 테스트를 재사용하여 `auth.uid()` 및 PostgREST의 anon/authenticated role switching, 고객 A/B의 SELECT/INSERT/UPDATE/DELETE/EXECUTE, 토큰 만료·철회, 다른 고객 preview 접근을 검증.
4. 가능하면 **추가 과금 없는 격리 환경**에서 합성 사용자만 사용하여 실제 Auth·PostgREST HTTP E2E 검증. 환경·요금·운영 영향 확인 전 신규 Supabase 프로젝트/클라우드 서비스 생성 금지.
5. 신규 고객 인증 연계 후보 SQL은 운영에 적용하지 않는다. 백업·격리 복원, 보안 경고 처리, 롤백·RPO/RTO 확인 후 승인 요청.

## 종료 조건
실행 명령·PASS/FAIL·재현 로그(비밀키/고객정보 제거)·보안 위험·비용·운영 변경 승인 필요 여부를 GitHub 이슈 #10에 보고. NO-GO 유지.

## 공식 참고
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
