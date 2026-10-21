# NEXUS LABS 자동 실행 후속 작업 — 2026-10-22

사용자가 실제 관리자 로그인 후 전체 화면 검증을 이번 범위에서 제외하고 미완료 기능 진행을 요청했다. 제외한 검증을 통과로 표시하지 않는다.

## 구현과 영향

- 기존 작업 관리 구조·프로젝트 재사용. 고객 테이블·고객 데이터·기존 키·인증 설정은 변경하지 않는다.
- PostgreSQL의 비공개 무료 워커가 최대 8단계를 처리한다. 별도 VPS 없이 기존 Supabase Cron에서 1분마다 실행한다. 사람이 화면을 열어 둘 필요가 없다. 결과는 기존 작업·단계·이력 테이블에 기록하고 비공개 상태 1행에 최근 실행 시각·횟수·오류를 집계한다.
- pg_cron·pg_net 확장을 추가한다. pg_net 내부 HTTP 큐의 확장 기본 권한은 프로젝트 역할에서 축소되지 않는 것을 확인했다. 따라서 큐의 비밀성을 가정하지 않고, 비밀키 원문 대신 action·method·60초 만료시각에 결합된 HMAC 서명만 전송하도록 보강했다. 원문이 사용됐던 신규 워커 키도 폐기·교체했다. 재전송은 기존 전역 1회 예약으로 차단한다. 신규 공개 RPC는 service_role 전용 invoker이며 비공개 definer에 서버 역할 검사를 적용한다.
- 무료 워커는 결제·계약·실제 제작·납품을 실행하지 않으며 외부 에이전트 작업은 아직 차단한다. 내부 단계는 기존 JS 무료 엔진과 결과가 같음을 임시 PostgreSQL로 검증한다.
- Claude는 별도의 기계 인증 전용 함수에서 기존 `claude-connection-v1` 예약을 재사용한다. 기존 승인된 최소 연결 시험 1회만 가능하다. 고정 합성 문장, 출력 8토큰, thinking 비활성. 고객 정보나 지시문을 전송하지 않는다. 성공·실패·타임아웃·감사 기록 실패 모두 자동 재호출하지 않는다.
- 기계 인증 키는 DB 안에서 무작위 생성해 Vault에 암호화 저장하고, 비공개 스케줄러가 그 키로 서명한 유효시간 60초 요청만 고정된 기존 프로젝트의 worker URL로 전달한다. 비밀키 자체는 전달하지 않는다. 키 원문은 사용자·모델·저장소·작업 로그에 출력하지 않는다. 기존 Claude 키는 그대로 서버 메모리에서만 사용한다.
- 신규 `nexus-agent-worker`는 opaque 워커 자격증명을 자체 검증하므로 gateway verify_jwt=false로 배포한다. 일반 관리자 서버는 verify_jwt=true 유지한다. 기계 함수는 브라우저 요청·임의 prompt·다른 action을 거부한다. 공개 무인증 실행 경로가 아니다.
- 마이그레이션 자체로 Claude 시험을 시작하지 않는다. 함수 배포와 무료 검증 후, 기존 시험 기록이 없을 때만 비공개 test_requested를 한 번 설정한다. 한 번 dispatch된 요청은 자동 재전송하지 않는다.

## 운영 적용 상태

- 비공개 워커 구조 적용, 신규 기계 함수 v2 및 관리자 서버 v3 배포 완료.
- 실제 Cron이 1분마다 실행되는 기록 확인. 2026-10-22 06:00 KST 주기에 TEST 작업의 4단계를 한 번씩 처리하고 awaiting_approval에서 멈춤. 앞선 3단계 verified=true, human_review는 미승인 상태 유지. 무료 워커 오류 없음.
- 새 pg_net 확장의 설치 스키마를 extensions로 정리하고 비공개 상태 표의 명시적 거부 정책을 추가함. 이 작업은 새 HTTP 큐·응답이 비었고 시험 미시작인 것을 확인한 뒤 수행했으며 CASCADE는 사용하지 않음.
- 기계 함수의 인증 없는 실제 HTTP 요청은 401 worker_credential_required로 차단됨.
- 화면·웹 버튼을 사용하지 않고 TEST AUTO-20261022 내부 작업 1건을 등록하고 실제 예약 실행으로 처리 완료. 감사용 합성 작업은 고객 데이터와 별도로 보존.
- 기존 전역 Claude 시험 기록 0건 확인 후 기존 승인 범위의 합성 시험 1회 실행. 2026-10-22 06:00:05 KST에 provider_http_400 실패 기록. 토큰·청구금액은 미확인. 응답 원문은 비밀 노출을 방지하도록 저장하지 않았으므로 상세 원인을 단정하지 않음. 전역 시도 슬롯과 test_dispatched=true를 유지해 재호출 금지. 새로운 시도나 모델 변경은 수행하지 않음.
- Codex 로컬 사전 점검: installed=false, authenticated=false, execution_started=false.

## 실제 완료로 표시하지 않는 것

- Claude 연결 시험 성공과 고객 주문의 Claude 자동 제작은 서로 다르다. 시험 성공 후에도 고객 제작은 비활성이다. 운영 예산·인증 게이트·고객 데이터 전송 범위가 검증되기 전에 켜지 않는다.
- Codex는 공식 CLI/SDK 인터페이스가 있지만 이 환경에서 CLI와 전용 인증이 확인되지 않았다. API 잔액 0에 따라 API 키 실행으로 우회하지 않는다. `ops/codex-preflight.mjs`는 설치·로그인 방식만 읽고 네트워크 모델 호출이나 로그인을 하지 않는다. 별도 사용자 PC의 Codex 설치/인증을 이 환경의 인증으로 간주하지 않는다.
- Work의 외부 작업 시작·제어 API는 공식 문서 조사로 확보하지 못했다. 현재 대화 또는 다른 Work 창을 원격 자동 실행할 수 있다고 보고하지 않는다.
- 패스키 설정·실제 기기 등록·강제 인증은 미완료다. 현재 DB에는 패스키 관련 auth 테이블이 확인되지 않았다. 해당 프로젝트의 실제 지원 상태를 확인하기 전에 기존 로그인 설정을 바꾸지 않는다.
- 실제 관리자 로그인 후 화면 검증은 사용자 요청으로 제외. 기존 무료 흐름의 웹 API 인증 후 통합 검증도 제외 상태로 남긴다.

## 검증

무료 검사 22개 통과: 신규 worker HTTP 5개, SQL 워커 6개, 관련 기존 큐 11개. 기계 자격증명, 임의 요청 차단, 중복·동시 호출, 전역 1회 제한, 실패 과금 불명 재시도 금지, SQL/JS 결과 일치, 고객 보존, 역할 권한 검증. 모든 유료 제공자 통신은 모의로 수행했다.

실제 PostgreSQL에서 새 HMAC 서명 검증·원문 키 거부·만료 거부·위조 거부 검사가 통과했다. 이 검사는 제공자 호출 없이 수행했다. 신규 보안 advisors 항목은 해소됐으며 기존 접수/문의 및 유출 비밀번호 설정 관련 항목은 유지했다.

## 복구

`cron.unschedule('nexus-free-orchestrator')`로 신규 스케줄만 중지한다. 신규 worker 함수를 중지하고 UI 변경을 되돌릴 수 있다. 기존 고객·기존 Vault 키·전역 Claude 시도 기록은 삭제하지 않는다. 기록을 삭제해 유료 시험을 재활성화하지 않는다. 사용 중인 다른 작업에 영향을 주므로 확장을 통째로 제거하지 않는다.

공식 근거:
- https://supabase.com/docs/guides/cron/install
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://platform.claude.com/docs/en/api/messages/create
- https://platform.claude.com/docs/en/models/haiku-5-5/whats-new-haiku-5-5
- https://developers.openai.com/blog/codex-as-a-platform
- https://learn.chatgpt.com/docs/auth
- https://learn.chatgpt.com/docs/enterprise/work-admin-faq
