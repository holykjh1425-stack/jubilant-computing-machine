# SOLQ 운영 연결 사전점검 후보 — 2026-11-01

**판정: 코드·격리 테스트 완료 / 운영 반영 금지.** 기존 Work 세션을 재개하거나 새 Work 세션을 만들지 않았다. 이 브랜치는 기존 `dev/solq-integrated-orchestration-20261101` 커밋 `eefd2f9947b820006f5092b9be46df1442010be2`에서 별도 분기했다. GitHub main·기존 후보·운영 Supabase·Edge·cron·Sites를 변경하지 않았다.

## 이번 실제 수행

- GitHub 기존 통합 조정기 `coordinator.mjs`, `test.mjs`, `REPORT.md`, 보존 기록을 읽고 기존 19 PASS를 재실행하지 않았다.
- Supabase에서 **SELECT 및 메타데이터 조회만** 실행했다. 운영 확인 집계: 신청 9, 무료 계획 6, 오케스트레이터 작업 7, 제작 원장 6(입금 대기 5·취소 1), 견적 동의 0. 활성 cron 2개는 매분 예약되어 있고 최근 60분의 cron 기록은 각각 60건 succeeded. **cron 성공은 Edge 호출·무료 계획 완성의 통합 성공 증거가 아니다.**
- 명시적 `application_id`/`free_plan_id`가 모두 NULL인 작업 5개 중 과거 `idempotency_key=plan.id`로 추적 가능한 것 4개, 추적 불가 1개. 직접·계획·과거 키로 해석한 결과 작업이 둘 이상 연결되는 신청 그룹 2개, 추가 작업 2개. 과거 보고의 '미연결 4/중복 1쌍'과는 **정의가 달라** 서로 같은 집계로 간주하지 않는다. 운영 자료 삭제·재연결·중복 정리 없음.
- 실제 `public.applications` 컬럼은 `id,receipt_number,description,...`이며 후보 조정기의 `tenantId,receipt,brief`와 직접 호환되지 않는다. `tenant_id` 컬럼도 없다. **클라이언트가 주장한 tenantId나 verifiedByServer 값을 신뢰하여 연결하면 안 된다.** 서버 소유 스코프 매핑과 실제 Auth/RLS 통합이 선행되어야 한다.
- `nexus-orchestrator` v7 JWT 검사 활성, `nexus-agent-worker` v2와 `nexus-production` v1은 플랫폼 `verify_jwt=false`. 두 함수에는 내부 인증 분기 코드가 존재하나, 이 사실만으로 실제 런타임 인증·권한 검증 PASS로 판정할 수 없다. `public.nexus_*_command` 3개는 anon/authenticated EXECUTE 없음, service_role EXECUTE 있음(카탈로그 기준). 별도 보호된 호출 테스트 필요.
- `solq_quote_acceptances` 테이블은 있으나 현재 0행. `solq_deposit_confirmations` 테이블은 확인되지 않았으며, 기존 `production_jobs.payment_observed_at`만으로 새 조정기 제작 승인 조건을 충족했다고 간주하지 않는다.

## 새 후보 코드

- `legacy-link-audit.mjs`: 명시 링크/계획 링크/과거 idempotency 키를 충돌 검사하며 **집계만 반환**한다. 중복·미연결을 자동 수정하지 않고, UUID/개인정보를 결과에 노출하지 않는다.
- `inspectSchemaContract`: 실제 컬럼 차이, 서버 tenant 매핑 부재, JWT 비활성 함수의 내부 인증 검토, Auth/RLS·원자 저장·암호화 백업/복원·과거 링크 검토 미완료를 표시한다. **입력 플래그가 전부 true여도 deploymentPermitted=false**로 고정한다. 승인 수단이 아닌 진단 도구다.
- `READONLY_DIAGNOSTICS.sql`: 운영 데이터 값을 출력하지 않는 집계·카탈로그 SELECT. 이번 실행한 질의와 같은 구조이며, 운영 변경 SQL은 없다.
- `test.mjs`: 기존 오케스트레이터 19개 테스트와 다른 신규 9개 합성 fixture 검증. 로컬 Node `node --test`에서 **9 PASS/0 FAIL**. 원격 GitHub에 업로드된 코드 자체를 재조회한 후 별도 순수 함수 스모크 검증 **3 PASS**. 실제 PostgreSQL 트랜잭션·JWT·RLS·Edge 호출 검증은 **미수행**.

## 남은 차단 조건

1. Supabase 전체 암호화 백업·무결성·보호된 격리 복원 성공 증거 없음. 지원팀 회신 대기와 별개로 운영 배포 금지.
2. 기존 운영 신청에는 tenant 컬럼이 없어 서버 소유 스코프/필드 매핑 설계와 검증이 필요. 브라우저 JSON에서 신원·권한을 가져오면 안 됨.
3. 원자적 저장 어댑터·실제 Auth/admin_users/RLS·Edge 인증 경계·견적/입금/별도 제작 승인 원장 통합 미검증.
4. 과거 미연결 1건과 중복 그룹 2개에 대한 비식별 관리자 검토 필요. 새 UNIQUE 제약을 곧바로 적용하면 안 됨.

**다음 안전 단계:** 보호된 기존 비운영 환경에서 실제 인증/저장 어댑터를 연결하고, 운영 자료와 격리된 테스트 데이터를 사용해 인증 거부·원자성·중복·복구를 검증한다. 백업 복원 검증과 사용자 별도 배포 승인 전에는 운영 반영·유료 Claude·실제 제작을 실행하지 않는다.

**변경 범위:** 새 GitHub 격리 브랜치의 후보 파일만. 운영 DB DML/DDL 0, Edge 배포 0, cron 변경 0, main 변경 0, Sites 배포 0, 유료 API 호출 0.
