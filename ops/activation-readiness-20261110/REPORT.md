# SOLQ 알림 운영 활성화 차단 해소 — 후속 보고

일자: 2026-11-10 KST. 기존 `4ba33fd` 작업 연속. 운영 변경·실제 발송·복원·추가 결제 0.

## 1. 12개 연결과 7개 PASS의 의미

**12는 테스트 항목 수가 아니라 독립 PostgreSQL 연결 수다. 검증 항목은 7개이며 모두 PASS다. '나머지 5개 미통과 항목'은 없다.**

기존 증거: [구현 ef825f97](https://github.com/holykjh1425-stack/jubilant-computing-machine/commit/ef825f97ea2c1d48973afde203595e36b9a6de8c), [보고 4ba33fd](https://github.com/holykjh1425-stack/jubilant-computing-machine/commit/4ba33fd6a1594310378938e10c6e00c5f9352d7f), [CI 42737253473](https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/42737253473), `../notifications/evidence/ci-native.json`.

|검증 항목|확인한 결과|
|---|---|
|1. 동일 토큰으로 12개 연결 동시 신청|신청은 정확히 1건, 같은 접수번호 반환|
|2. 12개 연결의 동시 선점·발송 시도 상한|시험 상한 5건에서 5개 선점, 나머지 7개는 daily_limit로 차단. 차단은 정상 결과|
|3. 선점한 5개 작업의 식별자·lease token|모두 서로 다름|
|4. 동일 작업을 2개 연결이 동시에 완료|1개만 성공, 다른 완료는 stale lease 거부|
|5. 일일 상한 도달 중 lease 만료|진행 중 4건을 uncertain으로 전환|
|6. 만료된 소유자의 사후 완료|거부|
|7. 트랜잭션 중 연결 종료|미확정 선점은 rollback, 다른 연결이 같은 작업을 새 token으로 회수|

7개 검사에는 12개 연결의 경쟁 결과가 함께 반영된다. 별도 '5개 결과'가 누락된 구조가 아니다. 기존 21개 자동시험·7개 native 검사·37개 재구성 검사·브라우저 시험은 재실행하지 않고 근거를 재사용했다. 이번에는 새 서버리스 wrapper의 변경부만 시험한다.

## 2. 추가 서버 없는 실행 경로

추천 후보: **기존 Supabase pg_cron → pg_net → 전용 dispatch Edge 함수 → 기존 notification RPC → Gmail HTTPS API**.

실조회한 전제:

- 기존 조직 NEXUS LABS는 Pro. PostgreSQL 17.11, pg_cron/pg_net/Vault 설치.
- 기존 무료 계획/제작 capture cron 2개가 매분 활성. 중단·교체하지 않았다.
- 운영 Edge 함수 4개 유지. 알림 RPC/outbox 및 dispatch 함수는 미설치. 알림용으로 조회한 Vault 이름은 없음. 이는 전체 Secrets 값이나 OAuth 프로젝트를 조회했다는 뜻이 아니다.
- 공개 문서상 cron+pg_net의 주기 Edge 호출이 지원되며 Vault 보관이 권장된다.

이번 추가물:

- `supabase/functions/solq-notification-dispatch`: 전용 dispatch key로만 접근하는 서버 간 endpoint. 브라우저 Origin 요청을 거부하고, 호출자가 수신자·예산·업무 승인 값을 전달할 수 없다.
- 기본 enabled=false 및 명시적 승인 설정 필수. OAuth 설정이 없으면 큐 접근 전 중단한다. 한 호출에 1건만 처리하며 무제한 루프/새 서버를 사용하지 않는다.
- 검증된 기존 worker의 바이트 동일 `_shared` mirror를 사용한다. 새 mirror 검사가 원본과의 차이를 막는다. 기존 worker 로직은 변경하지 않았다.
- `schedule-candidate.sql`: 5분 주기의 검토용 템플릿. 실행하지 않았다. 실제 전환 시 전용 endpoint만 gateway JWT 검증 대신 자체 dispatch 인증을 사용하도록 검토하고, 공개 접수 함수 설정과 혼동하지 않는다. 전용 key는 기존 service_role·worker key와 분리한다.
- 신규 Node 변경부 9개 PASS. Deno entry point와 runtime의 네트워크 차단 시험은 별도 CI 증거로 확정한다. 이는 hosted Edge에서 Gmail로 보낸 실발송 증거가 아니다.

|경로|추가 유료 서버|판정|
|---|---:|---|
|기존 Supabase cron+Edge|불필요|기반 확인·후보 구현. OAuth/스키마/보안/사용량/승인 후 운영 가능|
|GitHub Actions 예약 worker|불필요(현재 공개 저장소)|기존 heartbeat의 최대 약 9.97시간 공백 때문에 고객 알림의 유일한 실행기로 채택하지 않음. 검증·감시 용도로 유지|
|기존 PC 독립 worker|불필요|이미 있는 run.mjs 재사용 가능. PC 전원/네트워크/보호 Secrets/스케줄러의 실제 상태를 현재 확인할 수 없어 상시성 미검증|

5분 간격은 30일 8,640회, 31일 8,928회 dispatch 호출이다. Pro 포함량은 월 200만 Edge 호출이고 초과분은 100만 회당 USD 2다. 포함량은 전체 사용과 합산되므로 잔여량/과금 설정 확인 전 '운영비 무조건 0원'으로 확정하지 않는다. 2분 lease보다 긴 간격이며 겹침에도 기존 원자 선점이 적용된다. 요청 timeout 후보 85초는 HTTP 최대 단계(큐 RPC 3회×12초+OAuth10초+Gmail20초=66초)보다 길다. 실제 hosted CPU/지연과 네트워크 장애는 승인된 시험에서 확인해야 한다.

외부 SMTP 25/587 포트 대신 HTTPS 443의 Gmail REST를 사용한다. 기존 Pro 비용은 변경하지 않았고 이번 실제 추가 지출은 0원이다.

## 3. Gmail OAuth 활성화 조건

권장: 기존에 소유한 Google Cloud 프로젝트의 Web application OAuth client를 이용한 Authorization Code + offline access. 프로젝트 존재/권한은 아직 확인하지 않았으며 새 프로젝트·클라이언트·동의 권한을 임의 생성하지 않았다. Web 방식의 정확한 HTTPS callback과 state/CSRF 검증은 인증 준비 단계에서 확정해야 한다. Gmail 연결 토큰을 추출하거나 ChatGPT 연결 권한을 서버 자격증명으로 재사용하지 않는다.

|항목|설정/운영 원칙|현재 상태|
|---|---|---|
|최소 scope|`https://www.googleapis.com/auth/gmail.send`만. read/modify/compose/전체메일/주소록 권한 불필요|후보 API는 send만 사용|
|사용자 동의|소유자가 공식 Google 화면에서 발신 계정으로 직접 동의. callback state 검증, auth code는 서버에서 한 번 교환|미실행|
|오프라인 토큰|`access_type=offline`; 최초 refresh token 수령 확인. 동의가 있었어도 refresh token이 생략될 수 있어 재동의 조건 점검|미확인|
|보관|client secret·refresh token은 Supabase Edge Secrets, dispatch key는 Edge Secrets와 Vault에 별도 보관. 로그·프런트·GitHub·이 보고서에 값 기록 금지|실제 값 조회/설정 0|
|자동 갱신|기존 token source가 각 발송 전 refresh token으로 새 access token 발급. access token은 메모리만 사용|새 wrapper의 합성 갱신 시험 PASS; 실토큰 갱신 미검증|
|갱신 실패|invalid_grant/철회/비밀번호 변경/정책 차단 시 auth_unavailable로 중단하고 소유자 재인증 필요. 무한 재시도/자동 권한 확대 없음|합성 철회 시험 PASS|
|발신자|설정한 From은 실제 동의한 계정 또는 승인된 alias여야 함. 관리자 수신 주소도 소유자 확인 후 고정|미확정; 임의 계정 선택 안 함|
|상시성|동의 화면 Testing 상태의 외부 앱은 Gmail scope refresh token이 일반적으로 7일 만료. 운영 상태·검증 적용 여부 확인|Google Cloud 상태 미조회|

`gmail.send`는 sensitive scope지만 restricted scope는 아니다. 개인 소수 사용/조직 내부 사용 등 OAuth 검증 예외는 Google 공식 조건에 따라 판단한다. SOLQ의 사업용 운용이 개인용 예외에 해당한다고 자동 판정하지 않는다. 개인 Gmail 계정은 Workspace의 Internal-only 앱 옵션과 구분한다. 유료 Workspace 가입은 필요 조건으로 두지 않았다.

발송 제한/비용:

- Gmail API 현재 문서: 신규 적용 quota는 분당 프로젝트 120만 units, 사용자·프로젝트당 6,000 units. `messages.send`는 100 units. 기존 프로젝트는 과거 quota를 유지할 수 있으므로 실제 Console 수치를 확인한다.
- 개인 Gmail 자체 발송 제한은 하루 500개 초과/메일당 500명 초과 등이며 API quota와 별개다. 기존 사용자 발송도 합산되고 수신 거부/반송·스팸 제한이 더 먼저 걸릴 수 있다.
- 후보의 일일 시도 상한 50이면 send 시도 5,000 quota units/day. 한 번 호출에 1건, retry 포함이다. 5분 간격 처리 용량은 하루 288건이지만 DB 상한 50이 먼저 적용된다.
- 표준 Gmail API 사용은 추가 비용 없음. 현재 문서의 일일 billing threshold는 프로젝트 8천만 quota units이며 향후 초과 과금 예정 안내가 있으므로 운영 전 실제 quota/청구 조건 재확인. 이번 설계 규모에서 할당량 확대나 카드 등록은 필요하다고 확인되지 않았다.
- 서비스 계정 단독으로 개인 Gmail 사서함 권한을 얻을 수 있다고 가정하지 않는다. Workspace domain-wide delegation을 개인 Gmail에 적용하지 않는다.

## 4. PC·Docker 백업/복원 차단

현재 Work에는 사용자 Windows PC의 실행 경로가 없다. 과거 PostgreSQL17·Docker29·C드라이브 여유공간 확인은 과거 증거이며 현재 상태 PASS로 재표시하지 않는다. 신규 restore는 실행하지 않았다.

|차단|근거/해결 절차|이번 결과|
|---|---|---|
|보호된 실제 백업 실물|기존 Backup-Encrypted.ps1은 승인·보안 조건 확인 전 중단, DB+roles 암호화 스트림만 수행하도록 작성됨. 완전성 보조 항목 별도 필요|기존 코드 점검. 실제 dump/키 읽기 0|
|첫 Docker 초기화 실패|기존 기록의 /run/secrets/pg_password 부재. 파일 경로/마운트/권한과 실제 이미지 entrypoint 요구 불일치|현재 container 상태 미조회. 비밀번호를 채팅으로 요구하지 않음|
|두 번째 readonly chmod 실패|readonly root를 지키면서 entrypoint가 쓰려는 PGDATA·socket·temp 경로의 writable volume/uid 준비가 필요|root 보호를 끄는 해결책을 적용하지 않음|
|Supabase 호환성|일반 postgres:17만으로 Vault·pg_cron·pg_net·관리 역할·Auth 호환성이 완성되지 않음. 기존 Supabase 호환 이미지 버전/확장 대조 필요|기존 PGlite 재구성을 실제 운영 백업 복원이라고 부르지 않음|
|복원 중 자동 실행|network none은 외부 송신을 막지만 로컬 cron SQL 변경은 막지 않음. 서버 시작 전 cron.launch_active_jobs=off와 외부 worker 비기동·host port 없음·Docker socket 마운트 없음을 검증해야 함|절차 보완. 설정/실제 복원 미실행|
|민감한 복원 데이터|신규 독립 PGDATA만 사용, 원본 암호문 read-only, 네트워크 none, 기존 volume 재사용 금지, restart=no, 암호화된 host backing 확인. tmpfs도 swap에 남을 수 있으므로 메모리만으로 암호화 조건을 충족했다고 하지 않음|실제 이미지/volume/BitLocker 상태 미확인|
|완전성·RPO/RTO|DB/roles/Auth/Vault와 별도 플랫폼 보조자료 범위 및 SHA-256을 확인. 실제 복원 후 행·권한·확장·무발송·예약 차단·소요시간 증거 필요|현재 미완료|

새 `PC-ReadOnly-Preflight.ps1`은 도구 버전, 백업 폴더 존재·reparse·현재 사용자 ACL 표식, BitLocker 상태, 기존 named container의 상태/network/readonly/restart/mount 목적지 메타데이터만 조회한다. container env/secret 원본/키는 읽지 않고 start/dump/restore를 하지 않는다. Windows PowerShell의 한글 경로 처리를 위해 UTF-8 BOM으로 보관했다. 현재 Windows/PowerShell 실행기가 없어 이 스크립트 실행 PASS는 주장하지 않는다.

승인 후 복원 절차는 별도 실행안으로 확정한다. 사전 순서: 읽기 전용 PC 점검 → 보호 저장·암호화·복호화 책임자·백업 범위 확인 → 호환 이미지와 쓰기 경로/uid 확인 → 네트워크·cron 선차단 검증 → 구체 대상·백업 해시·중단/정리 조건 검토 및 승인 → 독립 대상 복원. 현재는 이 중 실제 PC 점검 결과가 없는 상태다. 유료 Restore-to-New-Project는 대안으로 실행하지 않는다.

## 5. 보안 경고 7건과 실인증/RLS

실제 Advisor는 WARN 7건(공개 definer 3×anon/authenticated, password 1)을 유지한다. 아래 위험 평가는 워커의 검토 우선순위이며 확인된 침해/취약점 악용을 뜻하지 않는다.

|번호|경고 대상|영향/보완 요인|자체 위험·조치|
|---|---|---|---|
|1|anon submit_application definer|공개 쓰기·남용, postgres 권한 범위 큼. 길이/서비스/동의 검증·고정 search_path 있음|중간, P1. 기존 최소권한 owner+private definer/public invoker 후보 재사용. 공개 REST INSERT의 남용 경계도 별도 점검|
|2|authenticated submit_application definer|같은 함수의 인증 역할 노출. admin 권한을 뜻하지 않음|중간, P1. #1과 같은 코드 수정 범위이나 경고는 별도|
|3|anon submit_support_inquiry definer|공개 문의 INSERT. 64hex token hash·양쪽 동의·길이 검증 있음|중간, P1. 최소권한 소유자/호출 경계·남용 제한 확인|
|4|authenticated submit_support_inquiry definer|#3의 인증 역할 노출|중간, P1. 같은 후보 및 실제 역할 회귀|
|5|anon read_support_inquiry definer|문의 내용/답변 노출 영향은 높음. UUID+64자리 token hash 일치 시에만 읽는 capability 경계, 동적 SQL 없음|중간, P1(기밀성 영향 높음). token 비노출·wrong-token 거부·최소권한 확인. 임의 조회 가능하다고 확정하지 않음|
|6|authenticated read_support_inquiry definer|#5의 인증 역할 노출. 인증됐다고 전체 문의를 허용하지는 않음|중간, P1. capability 경계 유지|
|7|유출 비밀번호 보호 OFF|재사용/유출 비밀번호 위험에 대한 예방 통제 미설정. 현재 관리자 침해 증거 아님|중간, P1. 기존 Pro에서 설정 가능 여부·기존 로그인 영향 확인 후 별도 Auth 설정 승인. 무조건 요금제 업그레이드 필요하다고 하지 않음|

현재 세 함수는 postgres 소유/SECURITY DEFINER, search_path=''이고 역할 EXECUTE 권한이 있다. 기존 `security-candidate.sql`의 dedicated NOLOGIN/NOBYPASSRLS owner 및 public invoker 개선은 격리 37개 검사 근거를 재사용한다. 운영에 적용하거나 공개 함수 권한을 일괄 철회하지 않았다. API 고장 없이 최소권한 개선을 반영하려면 실제 정책/권한·소유권·롤백 영향 검토가 필요하다.

실인증/RLS 차단 원인:

- 기존 관리자 신청·무료 계획의 실제 사용자 조회 PASS는 11월6일 마감 증거 e4616c4와 사용자 확인 기록을 승계한다. 오래된 '로그인 대기' 문서만 보고 모두 미검증이라고 되돌리지 않는다.
- 현재 확인한 관리자 등록은 1명이고 Auth session 메타데이터는 15건이다. 이는 Work가 사용할 수 있는 보호된 관리자 브라우저 세션/JWT를 갖췄다는 뜻이 아니다. session token을 DB에서 추출하지 않았다.
- 새 알림 테이블/Edge가 운영에 미설치라 새 알림 RLS의 실환경 endpoint 자체가 아직 없다. 후보 SQL의 일반 사용자 거부는 기존 PASS, 새 dispatcher 인증은 이번 변경부 PASS로 구분한다.
- 실제 ordinary-user 계정의 보유·소유자 동의도 확인되지 않았다. 새 계정을 만들거나 비밀번호/OTP를 수집하지 않았다. 기존 보호된 실관리자/테스트 사용자 세션을 준비한 뒤 승인된 비운영 native 환경에서 조회만 시험하는 것이 다음 단계다.

## 6. 알림톡·SMS와 무료/유료 업무 분리

기존 조사 이후 SOLQ 채널/계약/등록 번호·승인 템플릿의 새 증거는 없다. 이는 부재 확정이 아니라 미확인이다. 계정 생성·카드·충전·템플릿 제출·실발송은 하지 않았다.

|채널|필수 조건|확인된 표준 요금(VAT 별도)|남은 조건|
|---|---|---|---|
|SENS SMS|기존/신규 계약 확인, 발신번호 사전 승인, 명의/위임·통신서비스 이용증명원, API 비밀|월50건 무료, 초과9원/건|실제 적용 계정의 계약·잔여 무료량·지출 상한 미확인|
|SENS 알림톡|비즈니스 인증 채널·공식 연동·정보성 템플릿 승인·적법한 수신번호|7.5원/건, 무료 구간 없음|SOLQ 채널/권한·계약·템플릿 미확인|
|SOLAPI API|채널/템플릿 또는 등록 발신번호, API 인증·계약/충전 조건|SMS18원, 알림톡13원; 기본 API 월 기본료 무료|무료 제공량·실계약 미확인. 유료 앱/플랜 선택 안 함|

카카오의 정보성 알림톡은 승인 템플릿을 쓰며 광고를 섞지 않는다. 채널 친구 추가 여부와 적법한 전화번호 수집/개인정보 고지는 별개다. 현재 신청 폼은 이메일을 받으므로 SMS/알림톡을 위해 전화번호 수집 목적·수탁자·보관·동의 범위를 추가 검토해야 한다. SMS 대체발송은 승인된 발신번호와 비용 승인 이후 사용하며 uncertain 이메일을 무조건 문자로 다시 보내지 않는다.

무료: 기존 규칙 기반 6단계 계획·관리자 조회·알림 큐 처리 준비. Gmail 한도/기존 Pro 포함량 범위가 전제다.

유료 AI 제작: 견적 동의+실제 입금 확인+고객별 별도 제작 승인+승인된 provider/예산 상한을 모두 유지한다. 현재 provider 비활성/승인 호출0, 실제 제작 시도0. dispatcher는 기존 제작/예산 RPC를 호출할 수 없고 p_action은 reconcile/claim/finish만 고정한다. 고객별 승인 대신 전체 자동 실행 스위치를 켜지 않았다.

## 7. 완료 기준과 GO/NO-GO

|완료 기준|판정·증거|
|---|---|
|신규 신청→접수번호→대기열→관리자 조회|기존 격리 21개/브라우저 PASS 재사용. 운영 신규 알림 기능은 미설치|
|계좌 클릭→이벤트→대기열|기존 capability/중복/RLS/상태 보존 PASS 재사용|
|발송 실패·재시도·중복 방지|기존 21+native7 재사용; 새 서버리스의 OAuth 철회·429/5xx·ack 실패·한 번 처리 변경부9 PASS|
|별도 유료 서버 없는 실행|기존 플랫폼 기반 확인, wrapper·schedule 후보 준비. Deno CI와 실제 hosted 전환/지연은 구분|
|보안 차단 근거|실제 경고·함수·정책 메타데이터 확인, 7건 분류 및 기존 개선 후보 재사용. 운영 경고는 미해소|
|복원 차단 근거|비밀번호 경로/readonly 쓰기 경로/플랫폼 확장/자동 실행 선차단 문제 명시. 실제 PC 상태·백업 실물·복원은 미완료|
|운영 배포/실제 고객 발송|NO-GO. GUARD 독립 승인과 별도 사용자 승인 전 미실행|

해소된 항목: 검사 수 오해, 별도 서버 필요 여부의 기술 경로, 서버리스 실행 wrapper, OAuth/토큰 실패 처리 준비.

남은 구체 조치: (a) 소유자가 기존 Google Cloud 프로젝트/발신 계정/승인된 callback을 확인하고 보호된 OAuth/Secrets를 준비, (b) 기존 Pro Usage 잔여량·과금 상한 확인, (c) PC 읽기 전용 점검 결과와 보호된 백업·격리 복원 실행안 승인, (d) 기존 보안 후보의 실인증 회귀·운영 적용/위험 수용 결정. 준비 후 변경 목록·수신 대상·횟수·비용 한도를 갖춘 활성화 승인안을 제시한다.

## 공식 근거

- [Supabase cron→Edge](https://supabase.com/docs/guides/functions/schedule-functions), [Edge 요금](https://supabase.com/docs/guides/functions/pricing), [실행 제한](https://supabase.com/docs/guides/functions/limits), [Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Google 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [scope](https://developers.google.com/workspace/gmail/api/auth/scopes), [token 만료](https://developers.google.com/identity/protocols/oauth2), [검증 예외](https://support.google.com/cloud/answer/13464323), [API quota/비용](https://developers.google.com/workspace/gmail/api/reference/quota), [개인 Gmail 제한](https://support.google.com/mail/answer/22839?hl=ko)
- [pg_cron의 launch_active_jobs](https://github.com/citusdata/pg_cron), [Docker readonly](https://docs.docker.com/reference/cli/docker/container/run/), [tmpfs와 swap](https://docs.docker.com/engine/storage/tmpfs)
- [Ncloud 요금](https://www.ncloud.com/charge/region/ko), [발신번호 서류](https://www.ncloud.com/support/faq/all/2048), [카카오 공식 가이드](https://kakaobusiness.gitbook.io/main/ad/infotalk), [SOLAPI 요금](https://solapi.com/pricing)
