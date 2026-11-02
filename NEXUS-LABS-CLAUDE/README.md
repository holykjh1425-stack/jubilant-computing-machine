# NEXUS LABS — Claude 연동 개발 모듈

## 상태 (2026-10-21)

- 기존 정적 홈페이지·고객 접수·Supabase 관리자 파일을 검토했습니다.
- 이 폴더만 추가합니다. 운영 DB, 홈페이지, WordPress, 입금 상태는 변경하지 않았습니다.
- OpenAI 계획 → Claude 초안 → OpenAI 검토 → 관리자 승인 대기 구조입니다.
- Python 3.11 이상, 표준 라이브러리만 사용합니다. 서버에서 실행하는 CLI입니다.
- 실제 Google 로그인, Claude 키 발급·비밀 저장, OpenAI 키 설정, 유료 API 연결 검증은 미완료입니다.
- 기본 실제 호출 OFF, 비용 한도 0, 모델 미선택입니다. 모의 테스트 성공은 실제 연결 성공을 뜻하지 않습니다.

## 보존과 연결 경계

기존 app.js는 submit_application RPC로 접수하고, admin.js는 Supabase 로그인 후 신청 조회·상태 변경을 수행합니다. 이 개발 모듈은 고객 접수에 자동 연결하지 않았습니다. GitHub Pages는 Python 서버를 실행할 수 없습니다. API 키를 config.js나 HTML에 넣어 해결하지 마세요.

첫 단계에서는 운영자가 식별 정보를 제거한 작업 명세를 서버 CLI에 제출합니다. 다음 단계에서 별도 백엔드를 배포하고 Supabase JWT 검증·admin_users 권한 확인을 구현한 뒤 기존 관리자 화면에 연결할 수 있습니다. 그 전에는 고객 정보를 자동 전송하지 않습니다.

## 비밀 저장소

키 이름: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Claude 키 표시 이름은 `NEXUS-LABS-CLAUDE`로 발급합니다. 기존 키 목록/워크스페이스를 먼저 확인하고 중복 발급하지 않습니다.

서버의 전용 secret manager에 넣고 서비스 실행 시 환경 변수로만 주입합니다. 예: 호스팅의 암호화된 Secret 설정 또는 OS 보안 저장소. 저장 위치는 서버 선택 후 확정해야 합니다. 이 프로젝트에는 실제 키 저장소가 아직 연결되지 않았습니다. `.env.example`은 비밀 없는 설정 설명이며 프로그램은 .env를 읽지 않습니다. 키를 채팅, GitHub Secrets가 아닌 저장소 파일, 커밋, Library, 명령 인수에 넣지 않습니다. API 응답 오류 본문·헤더도 기록하지 않습니다.

## 비용 설정

서버 관리자가 모델 ID와 해당 모델의 현재 입력·출력 단가를 확인하고 승인된 예산을 설정해야 합니다. 예산 단위는 micro-USD (1달러 = 1,000,000). 정수 토큰 단가는 올림합니다. 예: 1M 토큰당 3달러이면 토큰당 3 micro-USD, 0.15달러이면 1 micro-USD로 보수적으로 설정합니다. 이 예시는 실제 모델 가격표가 아닙니다.

환경 설정 항목은 `.env.example`을 참고하세요. 확인 후 `NEXUS_PRICING_VERIFIED=true`, 승인된 예산과 모델을 설정하고 `NEXUS_LIVE_ENABLED=true`로 켭니다.

매 호출 직전 SQLite 트랜잭션으로 월별·작업별 예산을 검사하고 최대 출력 1,024토큰 및 입력 바이트 기반 보수적 비용을 예약합니다. 실패·타임아웃도 예약 비용을 유지합니다. 자동 재시도/대체 모델 호출은 없습니다. 사용량이 추정액을 넘으면 추가 호출을 영구 차단하고 운영자 점검을 요구합니다. 예약액과 실제 청구액은 다릅니다. 제공사 토큰 계산·가격 변경·이 키를 사용하는 다른 프로그램의 비용까지 보장하는 청구 상한은 아니므로, 전용 키와 제공사 계정의 지출 제한도 설정해야 합니다. 월 구분은 UTC입니다.

## 실행 (서버 관리자 전용)

```bash
python3 NEXUS-LABS-CLAUDE/orchestrator.py status
python3 NEXUS-LABS-CLAUDE/orchestrator.py submit --task-file /private/anonymized-task.txt --idempotency-key sample-001
python3 NEXUS-LABS-CLAUDE/orchestrator.py run JOB_ID
python3 NEXUS-LABS-CLAUDE/orchestrator.py show JOB_ID
python3 NEXUS-LABS-CLAUDE/orchestrator.py events JOB_ID
python3 NEXUS-LABS-CLAUDE/orchestrator.py decide JOB_ID --sha256 RESULT_HASH --actor owner --decision approved
```

`--state /private/path`로 외부 상태 저장 경로를 지정할 수 있습니다. 기본 `~/.local/state/nexus-labs-claude`, 디렉터리 0700·DB 0600입니다. 저장소 안에는 상태를 만들 수 없습니다. 상태에는 작업 명세·최종 초안이 포함되므로 정적 웹 루트 밖의 암호화 디스크/볼륨에 두고 백업·보존 기간을 관리하세요. 테스트는 임시 DB를 사용합니다.

승인은 최종 결과 해시에 묶이고 대기 상태에서 1회만 가능합니다. OS 계정 접근 권한이 관리자 인증 경계입니다. 고객이나 모델에 이 CLI 실행 권한을 주지 마세요. 웹용 관리자 인증은 후속 작업입니다. 승인 기록은 로컬 DB에 보존되며 변조 방지 외부 감사 저장소는 아직 없습니다.

`approved`는 초안 검토 승인입니다. 결제·크레딧 구매·계약·배포를 실행하는 도구는 제공하지 않습니다. 해당 행동은 건별 사용자 승인과 별도 실행 절차가 필요합니다. 모델이 실행 지시를 출력해도 문자열일 뿐 실행되지 않습니다.

같은 idempotency key/작업은 같은 작업 ID를 반환합니다. 다른 내용에 같은 key를 쓰면 차단됩니다. 실행 중 또는 실행 완료 작업은 다시 실행할 수 없습니다. 장애로 running 상태가 남으면 운영자가 제공사 요청/청구를 확인한 후 별도 작업 생성 여부를 판단해야 합니다.

## 검증

```bash
python3 -m unittest discover -s NEXUS-LABS-CLAUDE -v
```

네트워크 호출 없이 모의 제공사와 실제 요청 생성 코드를 검증합니다. 비용 차단, 중복/재실행 방지, 실패 예약 유지, 재시작 후 상태 보존, 해시에 묶인 승인, 제공사 요청 형식·오류 분류 등을 포함합니다.

## 남은 작업

1. 사용자가 선택한 Google 계정으로 콘솔 로그인/기존 계정 확인.
2. NEXUS LABS 전용 키 발급 및 선택된 비밀 저장소에 보관 (키 값은 공개하지 않음).
3. OpenAI 키·모델·단가·월/작업 예산 확정, 제공사 지출 제한 설정.
4. 개인정보 없는 짧은 작업 1건으로 실제 연결 검증 및 사용량 확인.
5. 사용자가 배포를 승인한 후 서버·관리자 웹 인증·접수 연결·운영 점검 진행.

## 공식 문서 (2026-10-21 확인)

- OpenAI Responses/text: https://developers.openai.com/api/docs/guides/text
- Claude Messages: https://platform.claude.com/docs/en/api/messages/create
