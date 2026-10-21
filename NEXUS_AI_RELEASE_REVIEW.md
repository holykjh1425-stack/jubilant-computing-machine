# NEXUS LABS AI 서버 적용 검토 — 2026-10-21

상태: 사용자 승인 후 운영 DB 신규 구조 적용 및 `nexus-ai` Edge Function v1 배포 완료. 유료 호출 미실행. 소스는 검토용 브랜치에 보존.

## 승인 후 실행 결과

- 신규 마이그레이션 적용 성공. Edge Function `nexus-ai`는 ACTIVE, `verify_jwt=true`.
- 운영 DB에서 키 조회 RPC는 anon/authenticated 실행 불가, service_role 실행 가능 확인.
- 트랜잭션 내 service_role 권한으로 기존 Vault 키 접근 성공 여부만 확인하고 롤백. 키 원문은 출력하지 않음.
- 실제 함수 HTTP 요청에서 인증 없는 접근은 401로 차단됨.
- 운영 고객 3건의 전체 행 지문은 작업 전후 동일. 고객 행 수정·삭제 없음.
- `ai_connection_runs` 0건, `ai_work_plans` 0건. Claude 실제 호출 0회, 비용 $0. OpenAI 호출 없음.
- 승인 후 등록된 관리자 계정을 안내하고 보안 로그인 1회 진행했으나 화면에 로그인 실패 표시. 이전 승인 전 시도 포함 총 2회이며 추가 반복하지 않음.
- 관리자 등록 계정은 이메일 인증 완료, 비밀번호 설정 있음, 정지 상태 아님. 입력 정보 불일치 여부 등 정확한 로그인 실패 원인은 아직 미확정.
- 유효한 관리자 인증을 확보하지 못해 인증 후 `health`·`live_test`, 고객 목록·접수번호·상태·모바일 실제 화면 검증은 미완료.
- 보안 advisors에서 신규 AI 객체 관련 경고는 없음. 기존 공개 접수/문의 SECURITY DEFINER 함수와 유출 비밀번호 보호 설정의 경고는 이번 변경 대상에서 제외하고 유지.
- 실제 고객 제작 자동 실행은 계속 비활성. 최종 상태: 추가 작업 필요.

## 적용 전 확인된 누락

- 기존 프로젝트 `elfacqmvygnwjlklqhiz`에 배포된 Edge Function이 없음.
- 현재 기본 브랜치에는 AI 서버 코드·작업용 DB 구조가 없음.
- 서버가 Vault의 기존 키를 사용하는 연결 함수가 없음.
- 기존 접수 기능·모의 테스트는 재실행하지 않음.

## 사용자가 승인한 변경 범위

1. `supabase/migrations/20261021121716_nexus_ai_server.sql`을 기존 DB에 적용.
2. 기존 Supabase의 `nexus-ai` Edge Function 신규 배포. `verify_jwt=true` 유지.
3. 로그인한 기존 관리자 계정으로 `health`를 먼저 호출.
4. health 성공일 때만 `live_test`를 1회 호출. 고객 데이터는 전송하지 않음.

새 서버 계약·프로젝트·유료 서비스는 필요하지 않음. 기존 Supabase 요금제의 사용량을 소비하며, 초과 요금이나 요금제 변경은 승인 범위에 포함하지 않음.

## 영향 검토

새 테이블 `ai_connection_runs`, `ai_work_plans`, 비공개 스키마 `nexus_ai_private`, 서버 전용 RPC 2개와 비공개 키 조회 함수 1개만 추가. 고객 테이블·기존 행·기존 권한·트리거는 변경하지 않음. 신규 테이블은 RLS 적용, 일반 클라이언트 쓰기 금지, 관리자 조회만 허용.

복호화 키는 기존 `nexus_labs_claude_api_key`를 서버에서 조회할 때만 메모리에 존재. `ANTHROPIC_API_KEY`라는 다른 Vault 항목은 사용·변경하지 않음. 비공개 definer 함수에 빈 search_path와 service_role 검사 적용. 공개 RPC는 invoker이고 EXECUTE 권한은 service_role에만 부여. 키는 HTTP 응답·로그·작업 계획에 포함하지 않음.

기존 고객 3건에 대한 UPDATE·DELETE·상태 변경·외부 AI 전송 없음. 무료 `plan` 명령은 신청의 ID·접수번호·상태·서비스 유형을 읽고 별도 내부 계획만 저장함. 현재 기존 관리자 페이지의 상태 변경을 AI 호출에 연결하는 트리거는 추가하지 않음.

## 제공하는 서버 동작과 한계

- `health`: 관리자 권한, 키 접근, 신규 DB 구조의 접근을 확인. 유료 호출 없음.
- `live_test`: 명시적 확인 문자열이 있을 때만 합성 문장으로 Claude 1회 호출.
- `plan`: 6단계 작업 계획을 내부 DB에 저장. 유료 호출 없음.
- 실제 고객 작업의 유료 자동 제작·결제·계약·납품은 비활성. 이번 요청의 1회 유료 테스트 제한에 맞춰 구현하며, 운영 자동 제작은 별도 예산·실행 승인 및 추가 구현이 필요함. OpenAI 호출 코드 없음.

이 브랜치 적용만으로 전체 고객 제작 자동화가 운영 가능해졌다고 보고해서는 안 됨.

## 1회 호출 제한과 비용

PostgreSQL의 유일 키 `claude-connection-v1`을 먼저 예약하고 호출. 동시 요청·재호출·실패·시간 초과·감사 기록 실패 모두 슬롯을 되돌리지 않음. 추가 유료 재시도·다른 모델 fallback 없음. 네트워크 실패는 과금 여부 미확인으로 기록하고 멈춤.

최소 테스트: `claude-haiku-5-5`, `Reply only OK.`, 출력 상한 8토큰, thinking 비활성. 입력/출력 토큰 사용량으로 비용 추정치를 기록하며 청구 금액으로 단정하지 않음. 고정된 짧은 입력과 출력 8토큰 제한으로 $5보다 훨씬 작은 호출. 권한·모델·잔액 문제가 나도 다른 호출을 추가하지 않음.

공식 근거(2026-10-21 확인):

- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/models/haiku-5-5/whats-new-haiku-5-5
- https://platform.claude.com/docs/en/api/messages/create
- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/guides/database/vault

## 검증과 재개 절차

`npm ci --ignore-scripts` 후 `npm run test:ai`. 신규 서버·SQL 권한 검증 16개 통과(실패 0). 서버 테스트의 모든 통신은 가짜 fetch로 대체하고, SQL 테스트는 메모리 내 PostgreSQL(PGlite)의 합성 고객·키만 사용. 운영 Supabase의 동작이나 Edge 런타임 통합 검증을 대체하지 않음.

운영 적용은 승인 후: 기존 고객 보존 지문 확인 → 신규 DDL 적용 → advisors 확인 → 함수 배포 → 유효한 관리자 세션으로 health → 성공일 때만 live_test → 호출 기록 확인 → 고객 보존 지문 대조. 이미 test 슬롯이 있다면 Claude 호출을 실행하지 않음.

관리자 화면: 승인 전후 보안 로그인 각 1회 시도, 총 2회. 화면에 `로그인 실패 · 계정과 관리자 등록을 확인해 주세요.` 표시. 추가 반복은 하지 않음. 따라서 실제 신청 3건·접수번호·상태의 로그인 후 화면과 모바일 검증은 미완료. 이 보고서는 DB 접근을 관리자 화면 검증 성공으로 대체하지 않음.

롤백: 함수 호출을 중지하고 함수 배포를 해제. 신규 실행 기록은 감사 목적으로 보존하며 테스트 슬롯을 삭제하여 유료 테스트를 재활성화하지 않음. 기존 고객 데이터는 롤백 대상 아님.
