# SOLQ 격리 PostgreSQL 시작 오류 해결 및 실제 통합 검증

2026-11-01 / 기준3d19808311da4359d434b89d050e3f8c6ff9dec0 / dev/solq-environment-recovery-20261101

**DB 시작 오류 해결. 실제 격리 Supabase 구성요소 통합33 PASS / 0 FAIL. 운영 반영 보류.**

## 1. 원인 확인

진단 실행 https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41294756827

기존 실패 로그는 CLI가 정리한 뒤 컨테이너를 조회해 목록이 비어 있었다. 이번에는 CLI 시작 중 Docker 상태·PostgreSQL 로그·포트·실제 SQL을 관측했다.

| 구분 | 실제 증거 | 판정 |
|---|---|---|
| 컨테이너 시작 | running, 이후healthy | PASS |
| PostgreSQL 초기화 | 17.11, ready to accept connections | PASS |
| 실행 권한/DB 내부 SQL | docker exec를 통한 SELECT1 성공 | PASS |
| DB TCP 리슨 | listen_addresses=*, port5432, 내부IP TCP성공 | PASS |
| 호스트 포트 연결 | HostConfig에54322→5432 설정은 있지만 NetworkSettings.Ports={},127.0.0.1:54322 TCP실패 | FAIL |

따라서 관측된 장애는 이 실행기의 내부 Docker 네트워크에서 **설정된 호스트 게시 포트가 실제 활성 경로가 되지 않은 것**과 CLI의 호스트loopback 접속 경로 불일치다. DB 초기화 실패·비밀번호 오류·운영 RLS 문제로 분류하지 않는다. 모든 Docker 버전의 internal 네트워크가 같다고 일반화하지 않는다.

## 2. 최소 수정 및 실제 DB 연결

공식 CLI v2.122.0 소스에서 지원을 확인한 환경 설정 사용:

- SUPABASE_SERVICES_HOSTNAME: 임시 내부DB 별칭
- SUPABASE_DB_PORT: 컨테이너 실제 포트5432
- SUPABASE_API_EXTERNAL_URL: 임시 내부Kong 별칭:8000

이 실행 네트워크에만 연결된 예상 이름의 컨테이너를 inspect하고, private IP를 확인한 뒤 **일회용 GitHub 실행기의 /etc/hosts에 .invalid 별칭만 임시 추가**한다. 연결은 실제 컨테이너IP로 직접 간다. 외부DNS·포트포워딩 프록시·외부리스너·Docker데몬/방화벽/CLI바이너리 변경 없음. 사용자PC의hosts나Docker는 건드리지 않는다. 정리 단계에서 별칭과 임시스택을 제거한다.

근거 소스:
- https://github.com/supabase/cli/blob/v2.122.0/apps/cli/src/command-internal/hostname.ts
- https://github.com/supabase/cli/blob/v2.122.0/apps/cli/src/command-internal/local-config-values.ts
- https://github.com/supabase/cli/blob/v2.122.0/apps/cli/src/command-internal/db-bootstrap/start-database.ts

수정검증 실행 https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41295008631

18:54:18 KST CLI_START_EXIT0, REAL_LOCAL_POSTGRES select1=true/version17.11.18:54:20 KST 정리완료. DB/스택 시작 및 실제 SQL연결 PASS. 포트를 외부에 개방하지 않았다.

이미 성공한 CLI설치·체크섬·네트워크 기능 검사는 새성과로 집계하지 않았다. 과거 일회용 실행기는 제거돼 새GitHub실행기마다 같은 고정CLI의 재준비와 다운로드무결성 확인은 필요했다. 기존100/32독립DB검증 및19/13합성테스트,이전비용통제33개를 다시 실행하지 않았다.

## 3. 실제 Auth/JWT/RLS/Edge/PostgreSQL 통합

최종실행: https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41295597041
Job124815672195 / 실행소스 fa6c130a8d2e1710032c1d493d6d6fb9fde67169
완료결과2026-11-01 19:02:46 KST: **신규33 PASS / 0 FAIL**.

테스트는 Node모의Auth·메모리DB가 아니다. 실제 로컬Supabase Auth,PostgREST,Deno Edge,PostgreSQL17.11을 연결했다. 데이터와 사용자만 합성이고,Claude주석만 모의다.

- 외부메일을 보내지 않는 공식 로컬Auth admin/generate_link→verify로 사용자2명의일회용로그인과실제JWT발급/검증.
- 새 비밀번호 필드/생성기·새API키발급 요청 없음. 기존운영토큰/키/비밀값의 추출·복사·재사용 없음. CLI로컬개발설정의 키는 메모리에서만 사용하며 출력/파일저장/공개아티팩트 업로드 없음.
- 같은JWT의 admin_users 회원 조회와 실제RLS: 관리자허용,일반사용자/비로그인차단. 위조user_metadata is_admin/role 주장은 권한을 주지 않음.
- 실제Edge가 무효JWT/비로그인401,인증된비관리자403,무료계획승인누락409를 반환.
- 승인된합성신청은 실제Edge→Auth→PostgREST RPC→DB저장. 고유한계획/작업ID조회,6단계저장,awaiting_approval확인,재요청결과재사용.
- 작업INSERT에의도적실패주입:Edge409,그전계획INSERT까지롤백해대상계획/작업0건확인.
- 실패원인제거후실제인증된Edge동시요청8건:응답ID한쌍,최초생성1회/나머지재사용. 최종합성신청2건의계획2/작업2건일치.
- 두로컬세션로그아웃요청성공. 임시스택·네트워크·별칭정리성공. 로그아웃만으로기발급access JWT가즉시무효라는보장은하지않으며,검증서버자체를제거했다.

전체항목과범위는results.json에있다.

**범위 한계:** 이 결과는 public.admin_users와solq_local_* 격리스키마,solq-local-plan 검증함수의실제통합이다. 운영관리자본인로그인,운영nexus-orchestrator v7/견적API/기존운영고객행의통합을통과한것이아니다. 새coordinator.mjs의주입형repository전체와운영후보SQL에대한최종저장어댑터검증도별도로남는다. 격리완료를운영정상화완료로보고하지않는다.

## 4. 검증도구 오류와 해결

최초신규통합실행41295365514는마지막집계의 sql() 호출에두인자를넘긴TypeError로종료됐다. 서버오류가아니다.해당호출을수정하고단계별비밀정보없는PASS기록을추가한뒤최종실행41295597041에서전체33항목및정리성공을확인했다. 수정후최종실행만완료증거로사용한다. CLI시작실패를그대로반복한것이아니라진단→원인별연결수정→새통합→검증도구수정으로구분했다.

## 5. SU-533612 / 백업

연결된Gmail의실제스레드를조회했다. 발송14:51:05 KST,수신된공식메일은14:56:09 KST자동접수1건뿐이다. 기술답변은없다. 사용자의기존NEXUS LABS계정연결완료기록을유지하고중복문의/계정연결/인증을하지않았다. 기존회신확인자동화를변경하지않았다.

운영DB접속자격증명미확보,SSL강제OFF,Temporary access미확인기록유지. 비밀번호초기화·SSL변경·새키/Temporary access토큰발급없음. 공식접근방법·안전성미확정이므로전체운영백업0회·운영백업의격리복원0회. 이번합성DB생성을운영복원이라고표시하지않는다.

## 6. 보존 및 배포

운영SELECT18:49:18~19:04:01 KST: 신청9·계획6·작업7. 세테이블전체내용지문과RLS정책지문은이전기록및전후모두동일. 기존미연결/중복기록수정·삭제없음. main은c4e64b774fa216cee02d4bbad85c9fd7ad05fdee유지. 운영DDL/DML/RLS/SSL/Vault/Edge/Sites변경0.유료API/Claude0회,$0. 실제고객발송/제작/청구0.

변경은기존dev/solq-environment-recovery-20261101의후보/격리CI/증거파일뿐이다. 원상복구는해당후보워크플로실행중지및임시환경정리로끝나며운영DBdown migration은없다. 실제운영배포는하지않았다.

## 7. 미완료와 승인

- 공식백업기술답변및허용된안전한운영DB접속방법확정.
- 전체암호화백업·무결성·실제운영백업의격리복원.
- 기존운영자료와최종저장어댑터/견적·입금·별도제작승인후보의실제통합및중복이력호환성검토.
- 모든필수증거완료후별도운영배포승인확인.

현재새비용/계정/키/설정변경승인은요청하지않는다. 지원답변이비밀번호/SSL/토큰/권한/비용변경을요구하면그행동만별도승인받는다. 안전조건미충족인운영배포는계속보류한다.
