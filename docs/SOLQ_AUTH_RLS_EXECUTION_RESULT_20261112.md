# SOLQ 인증·RLS·다중 세션 실행 결과 — 2026-11-12 KST

**격리 보완 검증 PASS / 운영 전환 NO-GO.** [실행 지시서](SOLQ_AUTH_RLS_WORKER_EXECUTION_ORDER_20261112.md)의 순서로 기존 `907ef0615337d10b1c286c2ea8bc0055af9ae795`에서 이어 수행했다. 실제 고객 행, Auth 사용자·세션, 운영 DDL/권한/정책은 변경하지 않았다.

## 1. 실행 및 증거

| 순서 | 수행 결과 | 증거·범위 |
|---|---|---|
| 기존 증거 재사용 | 커밋 21b116b의 49 PASS 로그와 기존 14개 파일 보존 증거 유지. 전체 49개 재실행 없음 | [기존 로그](../candidates/customer-platform-20261112/evidence/integration-tests.txt) |
| 운영 메타데이터 감사 | 고객 행 없이 pg_policies·GRANT·RLS 활성 여부·신규 테이블 수·security advisors만 조회. admin_users 본인 SELECT, applications 관리자 SELECT/UPDATE 및 동의한 신규 INSERT 정책 확인. 신규 고객 테이블 0 | [메타데이터 요약](../candidates/customer-platform-20261112/evidence/metadata-audit.json) |
| 코드 보완 | exact-token getUser, 만료·실제 session_id 존재/계정 결합 확인 후보, 인증 이벤트의 UI 비공개 데이터 제거, 익명 신청 receipt-only 연결 거부 유지 | [신규 인증 후보](../candidates/customer-platform-20261112/security/server-authenticator.mjs), [저장소](../candidates/customer-platform-20261112/security/customer-repository.mjs) |
| RLS 보완 | 6개 신규 테이블에 restrictive 세션 관문. 기존 소유권·관리자 정책과 AND 결합. 기존 admin_users/applications/Auth 정책·권한 무변경 | [미적용 SQL 후보](../candidates/customer-platform-20261112/security/session-hardening.candidate.sql) |
| 증명 보완 | 계정+세션 결합 v2, 기본/상한 5분, hash-only, 원자 소비+바인딩. 기존 세션 미결합 v1 RPC는 service_role에서도 실행 철회하는 후보 | 같은 SQL 및 [서버 저장 어댑터](../candidates/customer-platform-20261112/security/enrollment-lifecycle.mjs) |
| 실제 PostgreSQL 다중 세션 | **43 PASS / 0 FAIL**, PostgreSQL 17.11, 실행 전체 75개 서로 다른 backend PID, 동시 그룹당 20개 독립 연결 | [원문](../candidates/customer-platform-20261112/evidence/native-multisession.txt), [재현 코드](../candidates/customer-platform-20261112/security/native-multisession.py) |
| 새 JS 보안 검증 | **9 PASS / 0 FAIL**, Auth 서버·세션 조회 경계는 모의 의존성으로 검증 | [원문](../candidates/customer-platform-20261112/evidence/session-hardening-tests.txt) |
| 영향 범위 회귀 | 기존 중 변경 영향이 있는 어댑터·발급 경로만 **5 PASS / 0 FAIL** | [원문](../candidates/customer-platform-20261112/evidence/changed-adapter-regression.txt) |

43개 SQL 검증에는 실제 복제 정책하의 관리자 예외·A/B 격리, 익명·만료·타 세션·익명 가입 사용자 차단, SELECT/INSERT/UPDATE/DELETE/TRUNCATE, 동의 철회 후 쓰기 차단, 타 고객 validated 시안·own draft 비노출이 포함된다. 원래 합성 applications/admin 행·GRANT·정책의 전후 일치를 확인했다. 실제 운영 행의 지문을 새로 조회했다는 뜻은 아니다.

20개 동시 증명 교환은 새 case 바인딩 1건만 성공했다. 같은 계정의 다른 정상 세션, 다른 계정·접수번호·만료·폐기 세션은 교환 거부. 바인딩 충돌 시 소비 상태가 롤백되며, 다른 트랜잭션의 lock 대기와 rollback 후 성공도 확인했다. 20개 동시 메시지는 12건 성공·8건 속도 제한. 20개 워커 claim은 100 예산/60 예약 상한에서 1건만 예약했고, 입금만 확인 시 실행 차단·stale lease 거부·실행 중 제작 승인 철회 시 완료 공개 차단을 확인했다. 실제 AI를 실행하지 않았다.

## 2. 격리 조건과 재현

Debian 공식 PostgreSQL 17.11 패키지를 임시 경로에 추출해 사용했다(신규 서버 구매·클라우드 프로젝트 생성 없음). 각 실행이 빈 임시 DB 클러스터를 만들고 합성 행만 삽입하며 종료 시 프로세스를 중지한다. TCP 127.0.0.1:55439만 수신, unix socket 비활성, 전용 합성 DB/로컬 역할만 trust. 외부 host는 reject. 설치 확장은 plpgsql 하나, preload·Cron·pg_net·외부 AI/알림 코드 없음. SQL·parameter 에러 로그를 비활성화했다. 운영 URL·비밀번호·service key·실제 JWT는 사용하지 않았다. 테스트 종료 후 임시 클러스터는 제거된다.

필수: PostgreSQL 17 bin 및 Python `psycopg[binary]==3.2.13`. 테스트 URL을 인자로 받지 않으며 고정 loopback 전용이다.

```bash
python candidates/customer-platform-20261112/security/native-multisession.py /absolute/postgresql/17/bin
node --test candidates/customer-platform-20261112/security/session-hardening.test.mjs
node --test --test-name-pattern='repository default|account changes|production issuer|receipt|proof issuer|existing required' candidates/customer-platform-20261112/security/customer-security.test.mjs candidates/customer-platform-20261112/security/enrollment.test.mjs
```

네이티브 DB는 운영의 **정책 식·API 역할 테이블 권한·RLS flag를 복제**했다. 전체 Supabase 스키마, Auth 서버, PostgREST, 모든 기존 트리거/함수 및 배포 설정을 복제한 것은 아니다. 운영과 같은 권한 식이 동작함을 확인한 범위로 한정한다. 여러 backend 연결 검증을 이전 PGlite 단일 연결 결과와 구분했다.

## 3. 세션·프리뷰 보안 판단

getUser가 성공해도 철회된 세션의 access JWT가 만료 전 남을 수 있으므로 후보 세션 관문은 auth.sessions와 해당 계정을 확인한다. 클라이언트는 own boolean RPC가 false/오류면 차단한다. 서버는 `createServerAuthenticator`의 정확한 bearer 검증 후 고정 parameterized SQL seam으로 session을 조회한다. 토큰을 로컬 decode하는 행위 자체를 서명 검증으로 취급하지 않는다. user_metadata는 권한 근거로 사용하지 않는다. Auth 이벤트는 비동기로 UI의 비공개 메시지·시안·버전·동의 상태를 제거하고 늦은 응답을 무효화한다.

RLS의 작은 비공개 SECURITY DEFINER 함수 2개는 보호된 auth.users/auth.sessions를 읽기 위해 필요하다. 고객에게 Auth 테이블 SELECT를 주는 대안은 사용하지 않았다. 함수는 빈 search_path·고정 SQL·제한된 EXECUTE를 사용한다. 고객 함수는 auth.uid/JWT와 자기 session만 검증해 boolean만 반환하고, 인자 기반 lock 함수는 service_role 전용이다. **이 신규 권한 경계와 소유자, 비노출 스키마 설정은 운영 승인 전 별도 검토 대상**이다. 권한 오류를 숨기기 위해 기존 RLS를 우회한 것이 아니다. 기존 데이터 테이블에는 definer를 추가하지 않았다.

RLS 세션 판정은 다음 SQL statement의 snapshot 기준이다. 이미 시작한 읽기·내려받은 자료를 원격 회수하거나 즉시 모든 화면을 지우는 보장은 아니다. proof 교환은 세션 행 공유 lock과 원자 UPDATE로 세션 DELETE 및 이중 소비를 직렬화한다. 실제 Auth의 폐기 처리·provider 설정·토큰 갱신과의 동작은 호스팅 환경에서 아직 미확인이다.

프리뷰는 기존 검증된 passive DOM allowlist를 유지했다. `sandbox=""`는 allow-scripts/allow-same-origin을 허용하지 않아 opaque origin으로 동작하며 CSP는 script/connect/frame/form 등을 차단한다. 동일 고객 사이트 출처에서 임의 JS 실행을 허용하지 않는다. 이번에는 보안 경계 정적 회귀만 했고 이전 악성 HTML 브라우저 검증을 재사용했다. 동적 JS 실행 환경·별도 도메인 호스팅·Binary Storage는 미구현이다.

공식 참고: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). 현재 changelog를 확인했으며 이 작업에서 SDK/CLI 업그레이드·운영 명령은 실행하지 않았다.

## 4. 동의·보관 고지 점검

브랜치의 privacy.html과 신청서에는 신청 정보·호주 시드니 보관·처리 목적 달성/적법한 삭제 요청에 따른 처리 안내가 있다. 신규 채팅·수정 요청·시안/제작 파일·Auth 계정/세션 및 동의 철회 이력의 항목·목적·열람 범위·보유/삭제 절차를 모두 설명하지는 않는다. **실제 연결 전 처리방침과 채팅 동의 안내 보완이 필요하다.** 이는 문구와 구현의 정합성 점검이며 법률 적합성 종결 판정이 아니다.

- 익명 방문자 상담은 메모리, 요약 반영 동의는 기존 폼 입력 지원, 기존 개인정보/국외 보관 필수 동의는 신청 제출, chat-v1은 인증 후 향후 대화 저장·연결 동의로 분리한다. 앞선 방문자 대화는 자동 업로드하지 않는다.
- chat-v1은 append-only로 기록하고 철회 후 새 메시지/수정 요청 삽입을 차단한다. 철회만으로 기존 기록을 삭제하지 않는다. 고객에게 UPDATE/DELETE/TRUNCATE 권한을 주지 않는다.
- append-only는 영구 보존 의무가 아니다. 서버의 합법적 삭제·보존 예외·요청자 검증·법적 보존 범위·담당자·실제 기간 및 감사 절차는 운영 활성화 전 결정해야 한다. 자동 삭제 잡은 추가하지 않았다.
- 기존 익명 신청을 계정에 소급 연결하는 동일인 입증 경로는 여전히 없다. receipt/name/email만으로 연결하지 않는다. 새 인증 후 신청의 내부 ID를 반환하는 신뢰 서버 연결도 실제 구현·배포 전이다.
- 향후 유료 AI 제공자에게 어떤 데이터를 보낼지와 국외 처리 고지는 아직 정하지 않았다. 이번에는 그 외부 전송 자체가 없다. 고객 공개 문서·동의 UI는 승인 없이 변경하지 않았다.

## 5. Advisor와 운영 관문

운영 security advisor는 **경고 총 7건(3개 유형)**: 익명에게 공개된 SECURITY DEFINER 함수 3건, 인증 사용자에게 실행 가능한 동일 함수 3건, leaked password protection disabled 1건. 함수는 read_support_inquiry / submit_application / submit_support_inquiry다. 의도된 공개 접수와 취약 여부의 검토는 별도이며 이번 변경으로 해결되었다고 표시하지 않는다. 실제 설정·함수는 변경하지 않았다.

공식 조치 안내: [익명 definer](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [인증 사용자 definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [유출 비밀번호 방지](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). 새 SQL 후보는 운영 미적용이므로 운영 advisor의 PASS 증거가 될 수 없다. 네이티브 GRANT/RLS/함수 검증은 로컬 검사이며 Supabase advisor 자체 실행 결과와 구분한다.

**남은 NO-GO**: 실제 verified Auth/폐기 세션·A/B 계정·PostgREST 검증, 신뢰 신청 연결, 신규 스키마/함수 소유자·비노출 설정/정책 적용 승인, 배포된 SOLQ 소스와 구 NEXUS 브랜치 정합성, 고지·보존 절차, 실제 영속 워커/분산 부하·관찰, 기존 백업·격리 복원·RPO/RTO·보안 종결. 분산 로컬 PostgreSQL 경합을 검증했어도 Supabase 운영 연결 성공으로 재분류하지 않는다.

후보 SQL 적용 순서는 customer-schema → enrollment-proof → session-hardening이다. 빈 격리 환경에서만 검증했으며 이미 증명이 있는 DB의 session_id NOT NULL 변경용 backfill은 설계하지 않았다. 운영 신규 테이블이 현재 0이라는 사실을 영구 전제로 삼지 않고 승인 직전 재확인해야 한다. v2만 활성화하도록 서버 어댑터도 함께 교체해야 한다. 이 SQL 파일들은 실행 가능한 후보이고 자동 migration/배포 경로에는 넣지 않았다.

추가 유료 지출·신규 클라우드 비용·유료 AI 호출·알림·결제 **0**. 기존 서비스 청구액과 실제 운영 부하는 미측정이며 기존 원가 가정을 변경하지 않았다. 다음 단계는 남은 설계·권한 검토와 승인용 변경안 구체화다. 운영 DDL·Auth 계정 발급·실제 데이터/AI·배포는 별도 승인이 있어야 진행한다.
