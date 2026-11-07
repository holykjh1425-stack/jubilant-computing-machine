# SOLQ 인증 성공 이후 잔여 통합 검증

## 보존하는 실제 인증 결과

2026-10-27 사용자가 본인 PC에서 로컬 로그인 도구를 실행하고 화면 결과를 직접 전달했다. 이 증거의 출처는 사용자 보고이며, 워커가 직접 로그인하거나 스크린샷/토큰을 확보한 결과가 아니다.

- 실제 인증 성공, 관리자 권한 확인 성공, PostgREST 읽기 전용 조회 성공.
- applications9 / ai_work_plans6 / orchestrator_jobs7.
- Edge capabilities 연결 확인 실패/미검증.
- 해당 세션의 종료 요청 성공. 로그아웃 요청이 이미 발급된 access token의 즉시 무효화를 보장한다는 뜻은 아니다.

위 PASS를 재검증하지 않았다. 비밀번호 재입력/로그인 반복/세션 토큰 추출을 요청하지 않았다. 기존 SQL16/client5/native 독립32연결 PASS도 재사용한다. 새 승인 API는 운영에 호출하지 않았다.

## CORS 원인과 인증 오류의 구분

운영 nexus-orchestrator v7의 실제 handler 원본을 읽기 전용으로 확인했다. 허용 Origin은 다음 네 개다.

- https://holykjh1425-stack.github.io
- https://nexus-labs.lemonyglade2048.chatgpt.site
- https://solqtech.com
- https://www.solqtech.com

file:// 로 연 로컬 HTML의 브라우저 Origin은 문자열 null이다. 핸들러는 null을 허용하지 않고 origin_denied403을 반환한다. 이 검사는 OPTIONS 처리 및 /auth/v1/user 인증 검사보다 먼저 수행된다. 허용되지 않은 Origin에는 다른 허용 Origin의 Access-Control-Allow-Origin을 반환하므로 브라우저는 응답 내용도 차단한다. 따라서 로컬 화면의 일반 연결 실패 메시지는 이 CORS 구조로 설명 가능하며, 관리자 비밀번호 오류의 증거가 아니다. 사용자의 브라우저 네트워크 원본 로그는 수집하지 않았으므로 그 개별 실패 요청의 게이트웨이/HTTP 상태까지 직접 증명한 것은 아니다.

실제 HTTP 진단에서 OPTIONS + Origin:null은 403/다른 허용 Origin의 ACAO, OPTIONS + Origin:https://solqtech.com은 204/동일 Origin의 ACAO를 반환했다. 인증정보 없이 사전 요청만 수행했다. 이 증거는 cors-preflight-20261027.json에 별도로 기록하며 실제 관리자 JWT/Edge capabilities 양의 통합 PASS를 의미하지 않는다. 허용 Origin 헤더를 진단용 요청에 명시하는 것과 실제 해당 Origin에서 페이지를 실행하는 것은 다르다. 서비스 키/가짜 JWT/Origin 위장으로 운영 PASS를 만들지 않는다.

## 정책을 변경하지 않는 가능한 경로

1. 허용된 기존 SOLQ Origin의 안전한 인증·조회 전용 경로에서 capabilities를 호출하면 기존 CORS와 맞는다. 다만 현재 운영 admin.html은 자동 생성 위험이 있고, 준비된 새 로그인 파일은 그 Origin에 배포되지 않았다. 파일을 허용 Origin으로 간주하거나 위험한 admin을 여는 대안은 사용하지 않는다.
2. 기존 Python 읽기 전용 확인 도구의 비브라우저 HTTPS 요청은 브라우저 CORS 제한을 받지 않으며, 실제 handler는 Origin 헤더가 없는 요청도 기존 실제 사용자/관리자 인증을 통과하면 capabilities를 반환한다. 그러나 인증 성공 파일의 세션은 종료 요청됐고 토큰은 저장하지 않았으므로 이번 세션을 도구로 옮겨 재사용할 수 없다. 이는 준비된 후속 경로이며 현재 Edge 인증 검증 완료가 아니다. 재로그인은 요청하지 않는다.
3. 실제 비운영 Auth/PostgREST/Edge 환경이 연결돼야 새 승인 API까지 통합 검증할 수 있다. 앞선 프로젝트 조회에서 연결 가능한 개발 브랜치가 없었고 기존 UI 환경은 mock이다. 새 서버/유료 서비스/운영 CORS 변경 없이 사용할 수 있는 실제 비운영 백엔드는 아직 미확보다.

현재 단계의 정확한 판정: 실제 인증·관리자·PostgREST PASS(사용자 제공 증거), CORS 원인 확인, Edge authenticated capabilities 미검증, 새 승인 API 격리 PASS 유지/운영 미적용.

## 백업 준비와 필요한 사용자 조치

기존 수동 백업 계획을 재사용하고 운영 데이터 반출/백업/복원을 실행하지 않았다. 현재 PATH에는 gpg만 있고 pg_dump/pg_restore/docker/supabase는 없으며, 기존 /tmp/solq-native-pg 및 /tmp/solq-isolated-runtime 경로도 없다. 도구 존재만으로 암호화 키나 보호 복원 환경을 확보했다고 판정하지 않는다. 확정이 필요한 자원은 다음과 같다. 비밀번호·개인키·복구문구는 채팅으로 받지 않는다.

- 기존 암호화 저장 공간의 경로/소유자/접근 대상/보관기간/별도 암호화 복사본 위치.
- 기존 공개 수신키의 지문과 별도 복호화 키 보관 담당자/복구 가능성. 현재 Work에는 재사용할 키 관리 경로가 확인되지 않았다.
- Supabase 공식 Connect 경로로 사용할 Direct 또는 Session pooler와 보호된 기존 DB 자격증명 입력 수단. Owner 브라우저 로그인이나 MCP SQL 권한은 pg_dump 자격증명이 아니다.
- 기존 PostgreSQL17/Supabase 호환 비운영 복원 대상의 위치와 접근 방법, 외부 네트워크/SMTP/워커/cron 차단 상태. 과거 제거한 합성 CI 컨테이너와 mock UI는 실제 고객 백업 복원 대상이 아니다.
- Vault 비밀 복구 의존성과 DB 밖 Edge/Auth/Storage 설정·파일의 포함 범위. 부분 백업을 전체라고 명명하지 않는다.

위 자원의 준비 여부/접근 경로만 먼저 확인하면 된다. 암호화·복호화 합성 시험, 저부하 전체 논리 export 및 격리 복원의 실행 승인은 목적지·범위·비용·권한·위험을 확정한 뒤 별도로 받는다. 비용을 0원으로 보장하거나 고객 백업을 GitHub/공개 CI/일반 첨부로 보내지 않는다.

## 보존과 다음 단계

이번 작업은 원본 코드 조회와 자격증명 없는 CORS 사전 요청, 로컬 문서/도구 준비 상태 점검뿐이다. 운영 DB 읽기 PASS를 반복하기 위한 SQL도 실행하지 않았다. 마지막 사용자 검증 건수9/6/7을 기준으로 유지하며, 이번 점검에서 운영 행 변경은 수행하지 않았다. 기존 중복 기록/DB/RLS/권한/main/배포22는 변경하지 않았다.

추가 로그인 요청은 없다. 우선 위 백업 저장소/키/보안 연결/복원 자원의 준비 여부와 기존 비운영 백엔드 접근 경로만 필요하다. 모든 필수 조건이 갖춰지기 전 운영 SQL/main 병합/배포/새 신청/유료 실행 승인을 요청하거나 수행하지 않는다.
