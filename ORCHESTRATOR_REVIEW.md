# NEXUS LABS 통합 오케스트레이터 — 운영 적용 전 검토

2026-10-21. **개발 구현·무료 검증 완료, 운영 배포 미실행. 전체 목표는 아직 미완료.**

## 실제 조사 결과

- 기존 저장소 main: `11a889c6480cdac333424e04af1bc54a43e1e776`.
- 기존 AI 서버 검토 브랜치 `codex/nexus-ai-server-completion`을 기반으로 재사용. 신규 계정·프로젝트 없음.
- 기존 Supabase `elfacqmvygnwjlklqhiz`: 정상, 고객 신청 3건. 신규 중앙 작업 테이블은 아직 없음.
- `nexus-ai` v1 ACTIVE / JWT 필수. health·plan·Claude 단발 연결시험을 지원하나 중앙 실행 큐가 아님.
- Vault 메타데이터에서 기존 Claude 키 이름 확인. 원문·비밀번호 조회 없음. 실제 키 유효성·잔액·모델 성공 여부는 이번 무료 조사로 확인하지 않음.
- 기존 Python OpenAI→Claude→OpenAI 초안 파이프라인도 확인. OpenAI가 필수이므로 잔액 0 조건에서 실행하지 않고 중앙 서버로 오인하지 않음.
- 기존 관리자 로그인 실패 보고를 확인. 재로그인 반복하지 않음. 실제 인증 후 운영 화면 확인은 미완료.

## 이번에 구현한 것

`orchestrator_jobs`, `orchestrator_tasks`, `orchestrator_events`에 지시·담당·상태·오류·시도 횟수·검증 결과·선후관계·이력을 기록한다. 현재 작업 하나는 요구사항 → 범위 → 메타데이터 검증 → 사람 검토의 네 단계다. 이 계획은 규칙 기반 초안이며 AI가 실제 고객 제작을 마친 결과가 아니다.

별도 `nexus-orchestrator` Edge Function은 관리자 신원과 admin_users 등록을 확인한다. 서버 전용 RPC가 원자적으로 작업을 배정하고, lease token과 만료 시간을 검사해 오래된 실행 결과를 거부한다. 선행 단계가 완료되고 verified=true일 때만 다음 단계가 가능하다. 동일 UUID 지시 재전송은 중복 생성되지 않고, 내용이 다르면 충돌로 거부한다.

내부 작업의 만료는 지연 후 재시도하고 최대 3회에서 멈춘다. 외부 실행 결과가 불명확하면 재시도하지 않는다. 영구 입력 오류는 실패로 남긴다. 재시도·완료·차단은 감사 이력에 기록한다. 유료 모델 fallback 없음.

기존 admin.html 안에 작업 등록, 담당 선택, 전체 상태, 오류, 결과, 이력, 연결 상태를 추가했다. 사용자 입력은 textContent로 출력한다. API 키·비밀번호 입력 필드는 새로 만들지 않았다. 기존 관리자·고객·문의 기능은 유지한다.

관리자 화면이 열려 있을 때 무료 큐를 15초마다 처리할 수 있다. 화면을 닫아도 실행하려면 `ops/`의 서버 워커와 systemd timer를 기존 서버에 설치해야 한다. 설치·상시 실행은 아직 하지 않았다. 워커는 고정된 기존 Supabase 주소에만 요청하고, 서버 환경의 service_role 키를 사용하며 이 키는 브라우저에 전달하지 않는다. 서비스 계정 `nexus`, `/srv/nexus-labs`, Node 경로, root 전용 `/etc/nexus-labs/worker.env`(권한 0600)는 설치 전 실제 서버에서 확인해야 한다. 워커는 tick만 호출할 수 있고 새 작업 등록은 거부된다.

## 연결 범위

| 대상 | 공식적으로 확인한 인터페이스 | 이번 상태 |
|---|---|---|
| 내부 무료 워커 | 신규 서버 + DB 작업 큐 | 코드·임시 PostgreSQL 검증 완료, 배포 대기 |
| Claude | Messages API, 기존 Vault 키와 nexus-ai | 기존 연결시험 경로 유지, 새 큐의 실제 Claude 제작은 미구현·비활성 |
| OpenAI | Responses API | 잔액 0에 따라 신규 큐 호출 경로 없음·차단 |
| Codex | SDK, exec, app-server | 인터페이스 확인, 전용 실행기·인증·예산 연결 미구현 |
| ChatGPT Work | 검증된 외부 원격 지휘 API를 이번 조사에서 확보하지 못함 | 연결 불가 사유 표시, 자동 실행으로 위장하지 않음 |

다른 ChatGPT 대화창·이미 진행 중인 Work 세션의 전체 작업 이력을 이 서버가 읽거나 지휘하는 기능은 없다. 단일 화면에서 관리할 수 있는 범위는 이 서버에 등록된 작업과 이후 실제 연결한 실행기다. Work의 외부 API가 없다는 단정이 아니라, 현재 검증 가능한 인터페이스가 없다는 조사 결과다.

## 패스키와 자격증명

사용자 요청의 목표는 관리자 본인 확인 → 자격증명 사용 권한 대조 → 서버에서 암호화된 키 사용 → 감사 기록이다. 패스키(WebAuthn)는 기기의 개인키로 challenge에 서명하고 서버의 공개키로 검증한다. 비밀번호 묶음이나 암호화 키를 패스키에 넣어 비교하는 방식이 아니다.

이번 코드는 Supabase의 공식 `registerPasskey` / `signInWithPasskey` 인터페이스를 사용하며 기존 2.118.0 클라이언트에서 실험 기능을 opt-in한다. 패스키 지원은 공식 문서상 experimental이다. 관리자 등록 확인 후 등록 버튼을 표시하고, 실패·취소·비활성 상태는 성공으로 처리하지 않는다.

아직 프로젝트의 패스키 설정을 읽거나 변경하지 않았고, 기기 등록·실제 로그인도 검증하지 않았다. 따라서 **패스키 강제 통과 및 모든 연결 자격증명의 사용 권한 게이트는 미구현**이다. 현재 기존 비밀번호 로그인도 유지된다. 패스키 버튼 추가를 전면 강제로 보고하지 않는다. 향후 실제 인증 증거와 세션 만료·취소를 서버에서 확인하는 게이트를 구현·검증하기 전에는 외부 실행이나 키 사용을 활성화하지 않는다.

권장 운영 설정안(승인 후 실제 배포 도메인 대조):

```json
{
  "passkey_enabled": true,
  "webauthn_rp_display_name": "NEXUS LABS",
  "webauthn_rp_id": "holykjh1425-stack.github.io",
  "webauthn_rp_origins": "https://holykjh1425-stack.github.io"
}
```

GitHub Pages의 같은 호스트 아래 다른 저장소도 동일 origin이므로 전용 도메인으로 이전할 계획이 있으면 기기 등록 전에 RP ID를 확정해야 한다. 변경 시 기존 패스키 재등록이 필요하다. 관리자 본인의 기기 확인은 사용자가 직접 해야 한다. 등록된 패스키가 다른 회사의 로그인까지 강제로 통과시키지는 않는다.

기존 Claude 키는 기존 Vault 저장과 서버 전용 조회 RPC를 유지한다. 신규 오케스트레이터는 Vault 원문을 읽지 않고 작업 데이터로 비밀을 전달하지 않는다. 간단한 비밀 패턴을 차단하지만 임의 문자열의 비밀 여부를 완벽하게 판별하는 시스템은 아니다. 사용자·에이전트가 비밀번호나 API 키를 지시문에 쓰면 안 된다. TLS 전송과 Vault 저장 암호화는 패스키 인증과 별도의 계층이다. 계정 비밀번호 일괄 수집·이전은 하지 않았다.

## 운영 변경 검토와 승인 범위

배포 후보 파일: 새 마이그레이션 1개, 신규 Edge Function, 관리자 화면 JS/HTML, 상시 워커 설치안.

- 신규 메타데이터 테이블 3개, 인덱스 2개, 비공개 스키마 및 서버 전용 RPC만 추가.
- 고객 applications·접수번호·admin_users·기존 RLS·기존 키·기존 nexus-ai 서버·기존 신청 데이터는 변경하지 않음.
- 신규 테이블 RLS 활성, 관리자 조회만 허용. 클라이언트 쓰기와 RPC 호출은 차단. RPC는 invoker 공개 래퍼 → 비공개 definer 구조이며 service_role 주장도 검사.
- 공개 배포·운영 DDL·패스키 인증 설정 변경·상시 워커 설치는 아직 하지 않음.
- 승인 요청은 **이 무료 관리 구조의 운영 적용·관리자 화면 배포**다. 유료 호출, 결제, 계약, 실제 고객 제작, 자동 납품은 포함하지 않는다.
- 패스키 설정은 현재 도메인·기존 등록 상태를 먼저 확인한 후 적용해야 한다. 인증 강제 적용은 별도 검증까지 미완료로 유지한다.

승인 후 순서: 고객 3건 지문 재확인 → 신규 DDL 적용 → RLS·RPC 권한과 advisors 검사 → 신규 함수 배포(JWT 필수) → 관리자 변경 배포 → 합성 지시로 무료 흐름 검증 → 운영 고객 지문 재대조. 공개 배포 브랜치는 GitHub Pages 설정을 읽고 확인한다. 기존 프로젝트와 요금제를 그대로 쓰며 새 서버 계약·초과 비용은 승인 범위가 아니다.

복구: 새 워커 timer 중지, 신규 함수 호출 중지, 관리자 파일 변경 되돌림. 새 감사 테이블은 보존하고 고객 데이터는 복구 대상으로 변경하지 않는다. 패스키 설정 변경 전 값을 확보하며 로그인 복구 수단을 유지한다. 신규 감사 기록 삭제로 재실행을 허용하지 않는다.

## 검증과 남은 일

`npm run test:orchestrator`: 신규 11개 통과. PGlite의 합성 고객 3건으로 보존·권한·큐 동작 검사. mock fetch로 실제 유료 네트워크 통신이 없음을 검사. `node tests/manual-review.cjs`: 변경된 기존 관리자 코드 회귀 검사 통과. 기존 완료된 고객 접수 테스트·Claude 유료 테스트는 반복하지 않음.

운영 고객 신청은 3건. 조사 시작 지문 `feb572fff533b9831500efb7c1b4d316`(전체 행 정렬 후 MD5, 내부 비교용). 운영 DDL·DML·고객 정보의 외부 AI 전송 없음. 실제 운영 인증 화면·API 통합·패스키 기기 등록·상시 워커·Claude 자동 제작·Codex 연결은 미완료다.

브라우저 시각 검증은 실행 환경에 Chromium이 없어 시작하지 못했고, 설치 시도도 다운로드 파일 손상으로 실패했다. PC·모바일 실제 렌더링과 패스키 기기 검증은 미완료이며, JS 구문 검사와 서버·DB 모의 검사로 대체 완료했다고 보고하지 않는다.

## 공식 근거

- Codex SDK / exec / app-server: https://developers.openai.com/blog/codex-as-a-platform
- OpenAI 실행 선택지: https://developers.openai.com/api/docs/guides/agents
- Claude Messages: https://platform.claude.com/docs/en/api/messages/create
- Supabase 패스키: https://supabase.com/docs/guides/auth/passkeys
- Supabase Vault: https://supabase.com/docs/guides/database/vault
- Supabase JWT: https://supabase.com/docs/guides/auth/jwt-fields
