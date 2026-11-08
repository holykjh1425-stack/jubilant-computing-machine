# SOLQ 초기 스키마 누락 진단 — 2026-11-05

## 읽기 전용으로 확인한 증거
- 운영 Supabase 마이그레이션 11건 (20261018033557 secure_application_receipt_rpc부터 20261026045157 solq_automatic_free_plans_and_quote_gate까지).
- GitHub dev/solq-independent-runner-20261102의 supabase/migrations 디렉터리에는 SQL 파일 7개, 최초 파일 20261021121716_nexus_ai_server.sql.
- 첫 GitHub SQL은 public.admin_users 참조 정책과 public.ai_work_plans 테이블을 포함하며, 초기 운영 테이블 생성 스크립트가 선행돼야 재현 가능.
- 삭제한 격리 브랜치는 MIGRATIONS_FAILED, public 테이블 0개, 대상 함수 3개 중 1개만 확인. 실제 SQL 오류 문장은 확보하지 못함.
- GitHub 파일 이름/타임스탬프와 운영 마이그레이션 이력이 일치하지 않으므로 기존 SQL을 그대로 신규 브랜치에 적용하는 것은 안전하지 않음.

## 해결 작업 순서
1. 운영 pg_catalog 및 information_schema의 스키마 메타데이터만 읽어 전체 객체/의존성/권한/RLS/트리거/함수 목록을 추출. 운영 고객 행 및 비밀키 값은 읽거나 저장하지 않음.
2. 20261018~20261021 누락된 기초 DDL을 확인 가능한 근거로 재구성하고 GitHub 비운영 브랜치에 별도 baseline SQL로 저장. 기존 마이그레이션 이력 위조/수정 금지.
3. 비용 없는 로컬 PostgreSQL 격리 환경에서 baseline → 후속 마이그레이션을 순서대로 적용하고 스키마 비교·공개 RPC 회귀 테스트.
4. 그 뒤에만 비용 승인 범위 내 Supabase 격리 브랜치 재생성 고려. 보안 수정 검증 전 운영 적용 금지.

## 판단
초기 스키마 불일치 확인. 정확한 실패 SQL은 미확인. 복구 SQL 작성·실행과 전체 재현 PASS는 미완료. 운영 데이터/설정 변경 없음.
