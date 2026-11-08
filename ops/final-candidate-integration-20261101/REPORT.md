# SOLQ 잔여 운영 후보 통합 및 백업 차단 확인

2026-11-01 KST / 기준 dc7a7eec9692f76abecbff6940b2fa4ca3de1544
브랜치 dev/solq-environment-recovery-20261101

## 판정

운영 반영 보류. 기존33 PASS는 재실행하지 않았다. 이번에는 기존 견적·입금 SQL와 Edge 후보의 실제 로컬 서버 연결이라는 남은 경계를 검증했다. 전체 운영 백업과 그 파일의 격리 복원은 완료되지 않았다.

## 예약 작업 결과 승계

기존 자동화의 기록된 실행과 해당 실행의 최신 결과를 함께 대조했다. 새 예약이나 별도 워커를 만들거나 기존 작업을 실행·변경하지 않았다.

- N01: 2026-11-01 19:00 발행, https://blog.naver.com/holy00735/224460524135 공개 확인. 19:17~19:18 관측에서 글 누적 조회0·공감0·댓글0, 블로그 전체 방문수 미확인. https://solqtech.com/workflow-guide 연결 정상. 예약 성공을 공개 성공으로 대체하지 않고 실제 공개 확인 결과를 재사용했다. 상담·매출 귀속 근거 없음.
- WordPress 일일 작업: 19:50 완료 결과에서 두 상담 링크의 solqtech.com 변경 상태, 블로그 누적5회/3명·홈페이지10회/4명, 테스트 제외 신청 후보/미답변 문의0을 보고했다. 이번 작업에서는 WordPress 글/댓글/통계를 재처리하거나 누적 합산하지 않았다.
- 지원 회신 확인: 20:36 기록상 완료, 새 결과 본문 없음. 별도로 Gmail의 SU-533612 스레드와 티켓 검색을 읽어 공식 기술 회신이 없는 것을 확인했다. 기존 발송1건·자동 접수1건만 있다. 계정 연결 완료는 사용자 기록을 유지하며 다시 인증하지 않았다.

## 실제 후보 통합의 범위

기존 고정 CLI 2.122.0과 검증된 내부 서비스 연결 수정안을 재사용했다. 일회용 GitHub 표준 실행기의 내부 Docker 네트워크만 사용한다. 기존 Windows Docker나 운영 Supabase에 후보 코드를 실행하지 않는다. CLI 다운로드 무결성/시작 준비는 새 실행기에 필요한 선행 작업이며 이전 PASS의 새 성과로 집계하지 않는다.

다음 기존 원본을 수정 없이 사용했다.

- supabase/functions/solq-quote-evidence/handler.mjs
- ops/free-plan-automation/quote-evidence.sql
- ops/admin-integration-candidate/quote-deposit-guard.sql
- ops/free-plan-automation/production-gates.sql

합성 의존 테이블 fixture를 준비하고 기존 production_core의 테이블·정책 부분, automation.sql의 동의 원장 DDL 부분을 그대로 가져왔다. 운영 전체 스키마 복제나 백업 복원은 아니다. 실제 Auth 로그인 JWT로 기존 Edge 후보가 Auth→admin_users→PostgREST RPC→실제 PostgreSQL을 호출했다. 관리자 여부를 user_metadata로 허용하지 않는다. 로컬 Auth 선행 준비는 이전33 검증의 재집계 대상이 아니다.

첫 실행 https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41303479816 은28 PASS로 완료·정리됐다. 이 실행의 수동 신청 상태 변경은 SQL fixture 준비였다. 그 범위 한계를 보완하기 위해, 마지막 수동 상태 변경을 기존 관리자 후보와 같은 **실제 JWT PostgREST PATCH/CAS**로 교체하고, 운영에서 읽기 전용으로 확인한 관리자 UPDATE RLS 조건과 정식 solq_approve_production RPC 이름을 사용한 후속 실행을 준비했다. 이전33 테스트는 어느 실행에서도 호출하지 않는다. 최초28과 후속 결과를 독립 성공 건수로 더하지 않는다.

최종 실행 https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41303790420
Job124839953572 / 소스77c1356ae906d5970373c541903317b951ca465c
**30 PASS / 0 FAIL**. 기존33은 재사용, 최초28은 범위 보완 전 기록으로만 보존하며 합산하지 않는다. 최종 results.json/evidence.json에 실제 실행 결과·후보 원본 해시·개별항목·정리 성공을 기록했다. 이 두 실행에서 후보 SQL/Edge 제품 코드는 수정하지 않고 검증 범위만 보완했다.

검증 대상: 비관리자/비로그인/미허용 Origin 차단, 읽기 전용 목록, 견적 발행·동의 버전/금액 일치, 동의 저장과 제작작업 연결의 원자성, 실패 주입 롤백,4개 실제 동시 요청의 동의1건 저장, 입금 알림/은행 수동 확인/제작 승인 분리, 수동 확인 상태 PATCH의 RLS, 별도 승인·반복 승인 동일 작업 재사용, 실제 제작 미실행, 비관리자 원장 접근 차단, 타 신청 보존.

### 수동 입금 확인의 두 기록

quote-panel.js가 이미 명시한 흐름과 실제 SQL을 대조했다.

1. 은행 원장 대조 후 solq_deposit_confirmations 저장.
2. 기존 목록에서 입금 확인 상태(deposit_confirmed)를 명시적으로 저장.
3. 목록에서 별도 제작 승인(solq_approve_production).

수동 확인 원장 저장만으로 신청 상태나 제작 승인이 자동 변경되지 않는 것은 현재 후보의 의도된 동작이다. 기존 패널에도 이 순서가 안내돼 있어 이를 연결 오류로 단정하거나 자동 승인으로 바꾸지 않았다. 고객 알림/증거만으로 다음 단계가 실행되지 않는 것을 검증한다. 승인 후에도 작업은 queued/attempt_count0이며 제공자 호출·제작 실행은 없다.

## 운영 호환성 및 한계

운영 카탈로그의 읽기 전용 사전 점검에서 per-application 무료 작업 유일 인덱스가 있고, FK로 연결된 free_plan_id/application_id 중복 그룹은 각각0이다. 새 issued_quotes/deposit_evidence/deposit_confirmations 원장3개는 운영에 없다. 과거 NULL 연결·논리 중복은 이 검사와 별개이며 삭제·변경하지 않았다. 위 결과만으로 현재 전체 스키마·트리거·권한·이력과 후보의 완전 호환을 보장하지 않는다.

남은 통합 범위:
- 실제 운영 백업을 복원한 보호 환경에서 모든 기존 트리거/권한/과거 중복과 최종 후보를 함께 적용·검증.
- 기존 운영 관리자 본인의 실제 로그인 및 최종 브라우저 패널까지의 통합. 이번 사용자는 합성 로컬 신원이다.
- coordinator.mjs의 주입형 repository는 실제 운영용 저장 어댑터가 아직 연결되지 않은 별도 후보다. 이 코드를 이번 배포 대상에 포함하지 않으며 기존 무료 서버 워커와 병렬 생성자로 켜지 않는다.

## 전체 암호화 백업·복원

SU-533612는 기술 회신 대기다. 기존 DB 비밀번호는 확보되지 않았고 재설정·SSL 변경·Temporary access 활성화/토큰 발급 승인은 없다. 기존 공개키 준비 및 Windows 도구 확인 기록은 재사용한다. Work에는 Windows 보안 입력·암호화 저장소·USB·보호된 복원 대상에 직접 접근할 경로가 없다. 공개 GitHub CI의 합성 테스트 환경을 실제 고객 자료 복원 대상으로 사용하지 않는다.

공식 문서의 현재 확인 사항:
- 일반 CLI 논리 백업은 Direct 또는 Session pooler 접속과 DB 자격증명을 요구한다. Management API는 기존 DB 비밀번호를 돌려주지 않는다.
- DB 백업만으로 Storage 객체 본문은 보존되지 않는다. Auth/Storage 사용자 정의 정책·트리거, 역할/권한, Edge/설정 및 Vault 복구 의존성은 범위별 검증이 필요하다.
- Vault/열 암호화는 일반 SQL 덤프와 다른 암호화 루트 키 복원 의존성이 있으므로 기존 Vault 값이나 루트 키를 열람·추출하지 않고 지원팀의 승인된 보호 경로를 먼저 확정해야 한다.

자료:
https://supabase.com/docs/guides/platform/backups
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration

현재 연결 도구의 SELECT 결과는 암호화된 pg_dump 스트림이 아니며, 고객 행을 채팅/공개 저장소에 내보내 완전 백업이라고 표시하지 않는다. 실제 백업0회·운영 백업 격리 복원0회다. 재설정 없이 가능한 공식 경로가 확인되지 않은 상태를 ‘원천적으로 불가능’이라고 단정하지 않는다. 백업 실행 자체는 이미 지시됐으므로 같은 승인을 반복 요청하지 않는다. 새 자격증명/설정/비밀키 취급이나 비용 변경이 필요한 경우에만 구체적 방법을 확보한 후 별도 승인한다.

## 보존과 배포 조건

preservation.json: 같은 SQL/집계 방법의 전후 신청9·계획6·작업7 및 세 테이블 전체 내용 지문·RLS 정책 지문 일치. 공개 보고에는 고객 행을 넣지 않았다. 다른 방식의 예전 해시와 직접 비교하지 않는다.

main 확인값8be798c876d4afcf54934a1816ea464f2999a15d는 직전 보고의c4e64b7과 다르다. 기존 WordPress 예약 작업이 프로젝트 문서를 갱신한 최신 상태와 구분한다. 이번 작업 시작/종료 main은 동일하며 이번 워커는 main을 수정·병합하지 않는다. Sites28·운영 DB/RLS/Edge/Vault/SSL/비밀번호 변경0. 유료 API/Claude0회,$0. 고객 발송·청구·실제 제작0.

이번 변경은 개발 브랜치의 격리 CI/fixture/검증 코드·증거 문서뿐이다. 임시 스택·네트워크·hosts 별칭은 작업 종료 시 정리한다. 후보를 철회하려면 새 CI 실행을 중단하고 이 후보 파일만 제외하면 되며 운영 down migration이나 고객 행 정리는 필요 없다.

배포는 전체 암호화 백업·무결성·보호된 실제 복원, 최종 전체 운영 후보 통합, 별도 명시 운영 배포 승인 확인을 모두 충족한 뒤에만 진행한다. 현재는 배포 승인을 요청할 준비가 완료되지 않았고 운영 적용을 하지 않았다.
