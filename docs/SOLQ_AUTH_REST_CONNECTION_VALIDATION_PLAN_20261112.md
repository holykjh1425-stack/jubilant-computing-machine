# SOLQ 실제 Auth/REST 연결 검증 계획 — 아직 실행하지 않음

기준 2026-11-12 KST. 대상 기존 프로젝트 `elfacqmvygnwjlklqhiz`, 개발 후보 661cfd4. 운영 데이터·Auth 설정·메일 전송을 바꾸지 않는 준비 단계다. 기존 합성 54 PASS 재사용. 실제 Auth/PostgREST E2E는 PASS 아님.

## 지금 허용된 단계 R0

1. 인증된 관리자 세션에서 Email provider, SMTP enable, From domain, OTP template 변수/길이/만료, Rate Limits, Site URL/redirect allowlist, 조직 플랜·발송 quota·단가를 읽는다. 저장/테스트 발송 버튼은 누르지 않는다.
2. 비밀 없는 결과만 선별 저장: bool/숫자/도메인·허용 경로/템플릿의 OTP 대 링크 판정/확인 시각. SMTP 암호·user credential·API 키·고객 주소·토큰 포함 화면/응답을 그대로 저장하지 않는다.
3. sender와 Return-Path가 확정되면 공개 SPF·지정 selector DKIM·DMARC alignment를 조회한다. DNS 추가/수정 금지. 초과 과금이 없다는 근거가 없으면 미확인.
4. 기존 SQL와 역할 snapshot·실제 트리거/자동 실행기 목록을 **메타데이터만** 확인하는 후속 범위를 준비한다. 외부 호출 trigger가 있으면 격리 복제 시 비활성/미복제한다. production row INSERT/롤백 시험은 하지 않는다. 롤백할 DML도 실제 트리거/알림을 이미 일으킬 수 있다.

현재 SMTP 화면은 로그인 차단. 다른 R0 항목도 로그인 이후에 확인 가능하며 추측해서 채우지 않는다.

## E1 — 환경·수신·비용 승인 전 사전 조건

- 기존 로컬 리소스/무료 격리 환경을 우선 검토하되 새 Supabase project/branch는 만들지 않는다. 유료 branch 생성 없이 가능한지 사전 비용 확인.
- 실제 운영 고객 데이터를 복제하지 않은 합성 A/B, 관리자 계정과 전용 테스트 DB. 메일은 사용자 지정 테스트 수신함 A/B만. public repo에는 주소·JWT·메일 원문·확인키 기록 금지.
- Cron, 제작 워커, 알림 transport, 결제·AI provider는 비활성. 고정된 SMTP 테스트 transport만 별도 허용. 운영 프로젝트로 향하는 쓰기 URL은 allowlist에서 제외하고 harness가 시작 시 endpoint를 검증한다.
- 현재는 실제 발송 승인 **0건**. 향후 승인안은 정상 A/B OTP 각 1건+접수 각 1건, 만료/재전송/이메일 변경 테스트에 필요한 추가 건수를 별도 산정하여 **합계 상한과 재발송 분량까지** 확정해야 한다. 4건만으로 모든 이메일 edge case를 검증했다고 하지 않는다. 가격 미확인 상태에서 수량만으로 비용 0원 보장 금지.
- SMTP 인증 메일과 앱 receipt 발송의 제공자/템플릿/과금·전송 국가·신원 저장/쿠키 정책을 각각 확정한다. shouldCreateUser=true로 신규 계정을 만드는 것도 명시 승인 대상.

## E2 — 승인된 격리 환경에서만 실행할 시나리오

| ID | 테스트 | 성공 판정·증거 |
|---|---|---|
| A01 | A/B OTP 요청·번호 검증 | 허용 수신함에만 실제 도착. provider request id와 수량만 기록, OTP/JWT 미기록 |
| A02 | 잘못된/재사용/만료 번호 | 세션 미생성·미검증 계정 신청 차단. 같은 OTP 실험은 provider가 보장한 격리 환경에서만 |
| A03 | native rate limit/직접 Auth endpoint/동시 요청 | gateway 우회도 native/perimeter 한도 적용. 추가 메일이 발생할 수 있으므로 전체 발송 상한 내 수행 |
| A04 | getUser·기한·session_id | 서명된 실제 token의 uid 일치, 만료/철회 세션으로 새 읽기/쓰기 차단. 토큰 문자열 대신 결과·시각 기록 |
| A05 | 계정 전환·이메일 변경·logout | 이전 폼·시안·응답 제거, 새 email 확인 전 제출 거부. 변경 알림 발생 여부도 승인된 수량에 포함 |
| R01 | 직접 legacy RPC/새 server RPC | 새 경로 배포 전 legacy 권한 철회 금지. 승인된 cutover 후 anon/authenticated의 legacy EXECUTE 차단; 새 trusted ingress만 정상 |
| R02 | 정상 A 신청 | applications 원래 필드/received, verified contact·UID case, submission/outbox 1 transaction. status와 receipt 대조 |
| R03 | B의 A request/case/preview 접근 | 실제 REST로 A/B 분리, 내용/식별자 노출 0. anon/admin도 역할별 기대 권한 확인 |
| R04 | 동일 id 20 동시·다른 본문·유실 응답 | 1 application/1 outbox, 충돌 409급 명확 오류, status 재조회로 재신청 없음. 네트워크 실패를 저장 실패로 오판하지 않음 |
| M01 | 메일 수신자·최소 내용 | 실제 recipient가 verified email, 본문/OTP/proof/JWT/민감 query 0. 실제 받은 메일 확인은 accepted와 구분 |
| M02 | 전송 실패·timeout·stale lease | 확실한 미수락만 3회 한도/backoff. unknown 자동 재전송 0. 중복 provider key 대사 증거 |
| M03 | 이메일 변경·반송 | claim/전송 직전 수신처 불일치 취소. provider 반송/webhook signature·idempotency·현재 상태 대사 |
| S01 | 공개 일반 문의/조회 | 로그인 없이 동의 후 접수, ID+key만 자기 문의, 틀린 key 균일 빈 응답·남용 제한. 문의 raw key 미기록 |
| G01 | 기존 기능·승인 | 무료 계획·견적·입금 확인·별도 제작 승인 상태 불변, 유료/자동 제작/실고객 알림 0 |
| G02 | 로그·데이터 보존·롤백 | 기존 보존 증거와 변경 범위 대조, 임의 삭제/30일 자동삭제 없음, 실제 변경안별 롤백 연습 |

R01-R04도 운영 프로젝트에서 실행하지 않는다. 기존 생산 DB에 이미 합성 행이 있다는 이유로 테스트 INSERT를 허용하지 않는다. 실제 REST 레벨의 거절 요청 또한 부수효과 가능성을 검토한 격리 환경에서만 실행한다.

## 증거 형식·중단·승인

작업 ID/환경 식별자/commit/실행 시각/기대·실제 결과/발송 count/provider acceptance·수신 구분/추가 과금 유무/마스킹 점검/다음 조치. raw Authorization·Cookie·SMTP credential·OTP·확인키·고객본문을 파일/이슈에 저장하지 않는다. 보안 advisor는 승인된 환경의 후보 SQL에 대해 별도 실행하고 운영의 기존 7 WARN과 구분한다.

예상 외 recipient·메일 수량·쓰기 대상·과금·실제 고객·자동 실행이 발견되면 즉시 중단하고 기능을 비활성화한다. 미확인 값을 PASS로 바꾸지 않는다. 기존 백업·격리 복원·RPO/RTO·보안·롤백 관문 해소 및 별도 운영 승인 전 활성화 금지.
