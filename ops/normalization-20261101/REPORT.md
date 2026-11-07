# SOLQ 운영 정상화 후속 실행 결과 — 2026-11-01

최종 판정: **운영 반영 보류**. 운영 정상화 완료로 판정하지 않는다.

## 홈페이지 변경과 장애의 관계

버전 27→28의 Sites 소스 커밋 `0de001e`→`ab4d34c830669e69b57f0689588eb6a24b41f91e`를 비교했다. 변경 파일은 `dist/index.html`, `dist/solq-design.css`뿐이다. 로봇 SVG/장면 제거와 화면 배치 CSS 변경이며 신청서 및 API 코드는 변경하지 않았다. `app.js`, `api.js`, `admin.js`, `free-workflow.js`, `config.js`, `deposit.js`의 변경 전후 바이트가 모두 같다. `robot-change-comparison.json`에 기록했다.

따라서 확인한 관리자 자동 생성 및 미배포 견적 통합 문제의 원인은 로봇 제거가 아니다. 과거부터 존재하던 관리자 생성 호출과 서버 후보 미적용이 각각 원인이다. 이 결과는 다른 모든 장애 가능성을 배제하는 종단간 실거래 성공 증거가 아니다.

## 기존 운영과 후보의 차이

- 버전 28 관리자에는 `processNew()`가 무료 계획/작업을 생성하고, 30초 타이머가 이를 호출한다. 신청 카드 렌더링 중 특정 생성일 이후 신청에 대해서도 자동 생성한다. 조회를 위한 관리자 로그인을 이번에 수행하지 않았다.
- 기존 수정 후보는 위 자동 호출을 제거했지만, `approval-gate.sql`이 서버 `nexus_production_private.free_cycle()`도 no-op으로 바꾼다. 최신 지시의 '기존 승인된 무료 자동 처리 경로 유지'와 충돌하므로 이번 배포 후보에서 이 SQL을 제외한다. 기존 후보 전체를 그대로 적용하지 않는다.
- 운영 DB의 free_cycle 함수는 현재 존재하고, 규칙 기반 6단계 계획·연결 작업·단계 결과를 저장한다. 무료 실행은 paid_calls=0, 유료 제작은 별도 승인 대기다. free_cycle을 호출하는 private tick 함수 및 활성 cron 두 개를 읽기 전용으로 확인했다. free_cycle 문자열이 cron 명령에 직접 없다는 이유로 스케줄이 없다고 판정하지 않았다. 실제 워커를 수동 호출하지 않았다.

## 이번에 완성한 변경 후보

기존 개발 브랜치의 검증된 관리자·견적 후보를 재사용하고, 이 폴더의 admin.html/admin.js만 덮어쓰는 변형안을 작성했다.

1. 관리자 로그인·조회·새로고침·카드 선택·30초 신규 알림은 계획/작업 생성 RPC를 호출하지 않는다.
2. 미배포 solq_free_generation RPC와 free-generation.js 의존성을 제거했다. 관리자 무료 계획 영역은 저장된 서버 자동 처리 결과의 조회만 제공한다.
3. 기존 서버 자동 처리 함수·cron·권한·정책을 변경하지 않는다. 서버가 아직 생성하지 않은 경우에는 '서버 처리 대기'를 표시하며 브라우저에서 대신 생성하지 않는다.
4. 연결 오류·자료 불일치 때 생성하거나 자동 재시도하지 않는다. 명시적인 재조회는 허용하며, 동시에 누르는 재조회는 한 번의 조회로 합친다. 세션이 바뀌거나 카드가 제거되면 이전 결과를 사용하지 않는다.
5. 견적 동의·입금 증거·수동 확인 패널은 기존 후보를 유지한다. 무료 계획 조회와 유료 제작 승인 경로를 섞지 않는다.

`manifest.json`의 관리자 overlay 9개를 버전 28 복사본에 조립했다. 그 외 기존 파일 30개가 바이트 단위로 유지된다. index·신청·정책·하단 디자인·API 원본을 수정하지 않았다. 실제 Sites 소스 체크아웃은 clean 상태다. staging-dist는 비공개 로컬 파일이며 공개/비공개 사이트 배포 자체를 수행하지 않았다.

## 검증 결과

신규 `readonly-controls.test.mjs`: **7 PASS**. 합성 VM 컴포넌트 검증이며 실제 브라우저·Supabase Auth·Edge·DB 검증을 뜻하지 않는다.

- 카드 구성/선택은 조회만 예약
- 기존 계획과 작업의 재조회
- 중복 클릭·동시 조회 합치기
- 연결 실패 시 자동 재시도 없음
- 명시적 재조회로 오류 복구
- 세션 변경·카드 분리 후 요청 차단
- 생성/쓰기 인터페이스 및 미배포 generation 의존성 제거

관리자 JS 구문 검사 PASS. 기존 독립 PostgreSQL 동시성 32개 및 100개, 기존 견적·입금·제작 승인 격리 결과는 재사용했고 재실행하지 않았다. 이번 변경은 DB 동시성 로직을 바꾸지 않았다.

## 무료 계획 생성 및 고객 제공 경로

운영 조회 기준 신청9·계획6·작업7·견적 수락0이다. 자동 처리 실행 기록 2건은 awaiting_approval 상태다. 운영 데이터를 추가하거나 상태 변경하지 않았다. 기존 6단계 저장 형식 및 무료 규칙 처리 방식은 유지한다.

현재 고객 신청 화면은 신청 저장과 접수번호 표시를 담당한다. 고객에게 계획이 자동 전달되는 기능을 확인한 것은 아니다. 관리자 조회 후 검토·개별 안내가 필요하며, 이번에는 실제 고객 발송을 하지 않았다. 고객 전달 성공으로 판정하지 않는다.

## 견적·입금·제작 통합의 운영 미완료

운영에는 solq_quote_acceptances만 있으며 수락 기록은 0건이다. 후보의 solq_issued_quotes, solq_deposit_evidence, solq_deposit_confirmations와 solq-quote-evidence Edge API는 운영 미적용이다. 운영 Edge 목록은 nexus-ai(v4), nexus-orchestrator(v7), nexus-agent-worker(v2), nexus-production(v1)이다.

기존 후보는 관리자가 실제 외부 동의 증거를 검토해 신청·발행 견적 버전·금액에 연결하고, 실제 은행 확인 기록 및 별도 제작 승인을 요구한다. 미배포 새 API를 운영에 호출하지 않았다. 실제 고객 동의·입금·제작 단계의 운영 통합은 **미검증**이다.

## 인증·보안 점검

과거 사용자 PC의 실제 로그인·관리자 권한·PostgREST PASS 증거는 유지한다. 당시 Edge capabilities 실패/미검증을 운영 PASS로 바꾸지 않는다. 현재 Work에 재사용 가능한 실제 앱 관리자 세션이 없으므로 이번 실제 Auth→Edge 통합은 수행하지 않았다. SQL 연결 도구의 권한을 앱 인증으로 대신하지 않았다.

신청·계획·작업 테이블 RLS 활성 확인. 보안 Advisor의 공개 SECURITY DEFINER RPC 경고 3건, 인증 역할 SECURITY DEFINER RPC 경고 3건, 유출 비밀번호 보호 경고 1건을 읽었다. 공개 접수/지원 RPC의 의도된 공개 여부와 내부 검증을 평가해야 하므로 경고만으로 침해나 무권한 접근 성공을 단정하지 않는다. 보안 설정을 완화하거나 권한을 임의 회수하지 않았다.

공식 점검 안내:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

현재 로그 창에서는 postgres/pgbouncer 로그만 제공됐다. 앱/Edge 로그가 없다는 이유로 오류가 없다고 판정하지 않는다.

## 백업·복원: 승인과 실행 가능성을 구분

이번 지시로 전체 백업·암호화·복원 검증은 승인됐다. 다시 승인을 요구하는 것이 차단 원인이 아니다.

현재 Work에는 pg_dump, pg_restore, psql, Docker, Supabase CLI가 없고, 사용자 Windows PC의 기존 도구·C:\SOLQ_보안백업·C:\SOLQ_public_key·보호된 DB 연결에 직접 접근할 수 없다. 기존 USB 개인키를 읽지 않았다. 연결 도구에는 스트리밍 전체 덤프/암호화/격리 복원 실행 기능이 노출되어 있지 않다. 임의로 SQL SELECT 행을 모아 전체 백업이라고 부르지 않는다.

따라서 실제 전체 백업0회, 이번 복원0회. 기존 Windows 합성 11 PASS는 재사용하며, 실제 운영 백업·복원으로 인정하지 않는다. 공식 백업·복원 문서와 기존 스크립트는 재사용한다. DB 역할·스키마·데이터·RLS·함수·트리거뿐 아니라 Storage 원본 파일·Edge 코드/의존성·설정·Vault 복구 의존성을 별도로 포함해야 한다.

백업 공식 문서: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## 남은 차단 원인과 최소 해결 조치

| 차단 | 필요한 실행 조건 |
|---|---|
| 실제 Auth→PostgREST→Edge→RLS 통합 | 기존 보호된 비운영 Supabase 환경과 사용자 직접 인증 세션을 사용할 수 있는 실행 경로. 채팅으로 비밀번호·JWT를 보내지 않음 |
| 최신 전체 암호화 백업 | 사용자 PC에서 기존 검증 스크립트를 실행할 수 있는 로컬 경로, 공식 CA verify-full 연결, 검증된 공개키 및 보호된 저장 경로 준비 |
| 실제 암호화 백업 복원 | 기존 비운영 PG/Supabase 환경을 운영과 분리하고 워커·SMTP·웹훅·외부 AI 송신을 차단한 복원 대상. 운영 키 재사용 금지 |
| 새 견적·입금 API 운영 연결 | 위 검증 후 기존 SQL 3개와 Edge 후보 및 관리자 묶음의 일관된 적용. approval-gate.sql은 이번 경로에서 제외 |

새 서버·유료 서비스나 새 프로젝트를 만들지 않았다. 기존 승인 범위의 실행 조건이 확보되면 동일한 승인 질문 없이 이어갈 수 있다. 범위 밖 설정 변경이나 추가 비용은 별도 승인 대상이다.

## 적용과 원상복구 원칙

운영 반영 전 full backup/isolated restore와 실제 Auth/Edge/RLS가 모두 PASS여야 한다. SQL은 link-guard → quote-evidence → quote-deposit-guard 순으로 격리 검증한다. 현재 승인된 자동 free_cycle은 보존한다. 후보 Edge 배포 후 관리자 overlay 9개와 이 폴더의 override 2개를 버전 28 위에 조립한다. 홈페이지 전체 교체·과거 사이트 재배포 금지.

실패 시 신규 쓰기 경로를 중지하고 안전한 조회 전용 관리자 상태를 유지한다. 위험한 예전 자동 생성 관리자 파일로 무조건 복귀하지 않는다. DB 증거·컬럼·고객 행을 파괴적으로 삭제하지 않는다. 실제 제작·청구·고객 발송은 하지 않는다.

현재 운영 유지: https://solqtech.com / Sites **28**. GitHub main·운영 DB·RLS·Edge·Vault 변경0, 유료 API0, 신규 서버0. 신규 작업은 기존 개발 브랜치의 이 후보 폴더에만 저장한다.
