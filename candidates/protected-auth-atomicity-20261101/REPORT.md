# SOLQ 보호된 인증·원자성 후속 검증 — 2026-11-01

**판정: 격리 후보 코드·신규 13개 합성 테스트 PASS / 실제 Work 보호 환경·실 관리자 로그인·실 PostgreSQL 원자 저장·전체 암호화 백업 및 격리 복원은 미완료. 운영 배포 금지.**

## 근거 및 변경 범위
- 기존 후보: `dev/solq-integrated-orchestration-20261101`의 `candidates/integrated-orchestration/REPORT.md` 및 `dev/solq-integration-preflight-20261101-automation`의 `candidates/integration-preflight-20261101/REPORT.md`를 먼저 읽었다. 기존 19+9 PASS 재실행 없음.
- 새 격리 브랜치 `dev/solq-protected-auth-atomicity-20261101-automation`만 작성. 기존 Work 세션 재개/생성/중단 없음. 운영 DB DML/DDL 0, RLS/cron/Edge/Sites/main 변경 0, 유료 Claude 0.
- 운영 DB SELECT 시작·종료 집계: applications **9**, ai_work_plans **6**, orchestrator_jobs **7**. 개인 식별 자료·고객 요청·비밀 값 반출 없음.
- 현재 실행기는 기존 Work 보호 환경이 아닌 별도의 Node v22.16.0 격리 컨테이너이다. `psql`, `pg_dump`, Docker 및 기존 Work 세션에 접근할 실행 도구/보호된 로그인 세션이 없다. GitHub/Supabase 연결 도구는 조회·코드 저장 가능하지만 Work 보호 브라우저 세션을 재개하지 못한다.

## 실제 운영 Auth/RLS/Edge 읽기 전용 조사
- `public.admin_users` 1명, `auth.users`의 해당 사용자와 연결 1명, 이메일 확인 1명. **이는 실제 로그인 성공이나 유효한 JWT 검증 결과가 아니다.**
- `admin_users`, `applications`, `ai_work_plans`, `orchestrator_jobs`, `production_jobs` 모두 RLS 활성. `admin_users` SELECT 정책은 `user_id = auth.uid()`; 신청·계획·작업 관리자 조회 정책은 `admin_users` 존재 검사를 포함한다. 실제 JWT의 허용/거부 호출 테스트는 미실행.
- `nexus-orchestrator` v7 플랫폼 `verify_jwt=true`; `nexus-agent-worker` v2 및 `nexus-production` v1은 `verify_jwt=false`지만 함수 코드에 별도 내부 인증 검사가 존재한다. **내부 인증 코드 존재만으로 실호출 통과 판정 금지.**
- `public.nexus_orchestrator_command`, `nexus_worker_command`, `nexus_production_command`의 카탈로그 권한은 anon/authenticated EXECUTE 없음, service_role EXECUTE 있음. cron private `run_cycle`, `tick`은 SECURITY DEFINER이며 공개 역할 EXECUTE 없음.
- Supabase 보안 Advisor 경고: 공개 호출 가능한 SECURITY DEFINER 함수 3개(`read_support_inquiry`, `submit_application`, `submit_support_inquiry`)와 유출 비밀번호 보호 비활성 1개. **취약점 악용 가능 판정이 아니라 추가 코드·접근 토큰 검사 대상**이다. 운영 정책 수정 없음.
  - https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
  - https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## 원자성·중복에 관한 신규 실제 카탈로그 근거
- `applications.receipt_number` UNIQUE, `ai_work_plans.application_id` UNIQUE 인덱스 존재.
- `orchestrator_jobs.idempotency_key` UNIQUE 존재. `orchestrator_jobs.application_id` 유일성 인덱스는 **`WHERE free_plan_id IS NOT NULL` 조건부**이다. 따라서 레거시 NULL 연결을 포함한 모든 작업에 대해 신청당 1건이 인덱스 하나로 보장되는 것은 아니다.
- 기존 보고에서 명시 연결 둘 다 NULL 5건(그중 과거 키 추적 4건·미해결 1건), 복수 작업 신청 그룹 2개. 자동 정리 금지.
- 현재 후보 `coordinator.mjs`의 트랜잭션은 주입형 `repository.transaction` 계약일 뿐 **실 Supabase PostgreSQL 저장 어댑터가 연결되지 않았다**. 동시 DB 쓰기·강제 실패 롤백·감사 원자성 검증 없음.

## 새 코드와 테스트
- `protected-contract.mjs`: 서버 측 Bearer JWT를 Supabase Auth `/auth/v1/user`로 확인하고, **같은 JWT의 RLS 범위**로 `admin_users`를 조회하며, 서버 소유 tenant 매핑이 없으면 무조건 거부하는 비배포 인증 후보. 브라우저 `role/userId/verifiedByServer` 주장 무시. 실제 프로젝트에는 tenant 컬럼/검증된 서버 매핑이 없어 현재 연결 금지.
- `inspectAtomicStorageReadiness`: 실제 형태의 UNIQUE 인덱스와 트랜잭션·감사 롤백·레거시 검토·백업 복원 증거를 검사하는 읽기 전용 판단기. 조건부 UNIQUE를 전체 UNIQUE로 오판하지 않음. 모든 플래그가 true여도 `writePermitted=false`로 고정.
- 새 `test.mjs`: Node `node --test` **13 PASS / 0 FAIL**, 모의 Auth 응답·RLS 행·tenant·인덱스 메타데이터만 사용. 실제 관리자 로그인·실 DB 쓰기·운영 API 호출 없음. `TEST_RESULTS.json`에 테스트 종류·SHA-256·한계 기록. 기존 PASS 재실행 없음.

## 백업·격리 복원
- 공식 Supabase 문서: Free 프로젝트는 자동 일일 백업 대상이 아니며 `supabase db dump` 수동 내보내기를 권장한다. `db dump`는 Supabase 관리형 스키마(auth, storage 등)를 기본적으로 제외할 수 있으므로 **Auth 포함 전체 복구 범위를 별도 확인**해야 한다.
- 운영 메타데이터: Storage 버킷 0, 객체 0, Vault 비밀 항목 **3개(값 조회 없음)**, Edge 4개. PostgreSQL 데이터·역할·RLS·Auth, Edge 코드/설정, Vault 비밀의 안전한 별도 보관/재구성, Storage 실제 파일 범위 점검 필요.
- 실제 전체 암호화 백업 파일·해시·격리 복원 성공 증거 **없음**. DB 비밀번호/보호된 백업 접속 경로와 기존 보호된 복원 환경 접근이 없어 실행 차단. 비밀번호 초기화, SSL 설정 변경, 신규 서버 생성, 비용 지출 없음.
- 공식 문서: https://supabase.com/docs/guides/platform/backups 및 https://supabase.com/docs/reference/cli/supabase-db-dump
- 지원 문의 `SU-533612`는 계정 연결 완료, 현재 Gmail에서 확인된 답장은 **2026-11-01 05:56 UTC 자동 접수 확인뿐**. 기술 답변 없음. `SU-526318`의 새 회신도 확인되지 않음. 지원 답변을 받았다고 주장하지 않는다.

## 차단 해소의 정확한 순서
1. 기존 Work **동일 세션**의 보호된 테스트 환경에 대한 실제 접근을 확보한다. 자동화 연결 도구는 Work 세션을 깨우거나 재개하지 못한다. 새 Work 세션은 생성하지 않는다.
2. 기존 비운영 인증 환경에서 유효 관리자 세션과 일반/무인증 세션으로 Auth·RLS·Edge 허용/거부를 실제 검증한다. 자격증명을 채팅이나 GitHub에 남기지 않는다.
3. 기존 비운영 PostgreSQL에서 실제 저장 어댑터를 단일 트랜잭션·잠금·중복 재호출·실패 롤백·감사 원자성까지 테스트한다. 레거시 충돌 검토 후에도 운영 변경은 하지 않는다.
4. 지원팀 회신 또는 기존 승인된 비밀 저장소에서 안전한 DB 접속 방법이 확인되면, **실제 전체 백업·암호화·무결성 검사·운영과 분리된 복원**을 실행한다. Auth/Storage/Vault/Edge 포함 범위와 누락을 명시한다.
5. 네 가지 실제 증거가 모두 통과하고 별도 사용자 배포 승인을 받기 전에는 main/운영 변경을 하지 않는다.

**완료:** GitHub 격리 후보 코드, 신규 합성 테스트 13 PASS, 운영 Auth/RLS/Edge/UNIQUE/보안 경고/백업 범위의 읽기 전용 조사.

**미완료:** 실제 Work 보호 환경 접근, 실제 관리자 JWT/권한 통합, 실 PostgreSQL 원자 저장, 전체 암호화 백업 및 격리 복원.

**현재 승인 필요:** 운영 변경 승인 요청 없음. 실제 인증/백업 단계는 기존 보호된 환경과 적법한 자격증명 접근이 확보되어야 한다.
