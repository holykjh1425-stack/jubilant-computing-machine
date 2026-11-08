# SOLQ 운영 배포 전 잔여 검증 — 2026-10-26 KST

> 후속 갱신: 권한 복구 SQL과 ACL 왕복·무료 워커 영향 검증을 완료했다. 관리형 백업 대시보드는 실제 로그인 화면으로 전환됐다. 최신 접근 조건과 실행 증거는 [차단 요인 최종 점검](BLOCKER_CLOSEOUT.md)을 따른다.

기준: 4d4e827, 제품 코드 6b59101. 기존 독립 연결 100개·실패/재시도·RLS·PC/모바일 SDK/CSP·30초 조회 검증은 재실행하지 않았다. 이번에는 실제 운영 인증의 거부 경로, 잔여 권한, 기존 백업의 범위만 검토하고 발견된 권한 문제의 수정 후보를 격리 검증했다.

**최종 배포 판정: FAIL — 운영 반영 보류.** 접속 상태와 부정 인증 거부는 PASS지만 실제 관리자 인증 통합은 확인 불가다. 불필요한 운영 권한은 아직 남아 있으며 최신 전체 운영 백업 복원도 증명되지 않았다. 이 보고는 '모든 운영 검증 완료'가 아니다.

## 1. 판정표

| 항목 | 판정 | 객관적 근거 |
| --- | --- | --- |
| 운영 프로젝트·Edge 배포 상태 | PASS | ACTIVE_HEALTHY, 관련 Edge 3개 ACTIVE |
| 무토큰·잘못된 토큰·익명 조회 차단 | PASS | 실제 HTTP/Auth/Edge/REST 검사 10개 통과 |
| 관리자 API CORS 사전 요청 | PASS | solqtech.com Origin으로 OPTIONS 204·정확한 Allow-Origin |
| 유효한 운영 관리자·비관리자 JWT, 만료 세션·Edge 통합 | 확인 불가 | 재사용 관리자 탭/세션 및 승인된 로그인 자격증명 없음 |
| public 테이블 RLS | PASS | 14개 전부 활성, 일반 역할 bypassrls=false |
| admin_users 불필요 권한 | FAIL(운영) / PASS(후보) | 운영 6개 유지, 후보 적용 격리 시험에서 0개·정상 관리자 조회 보존 |
| 기존 부분 스냅샷 존재 | PASS | DB 내부 2개, 생성 시각·항목·집계 확인 |
| 현재 전체 운영 DB 복원 가능성 | 확인 불가 | 확인된 2개는 현재 전체 자료를 포함하지 않음. 관리형 백업 목록/파일·보호된 복원 환경 접근 없음 |
| 배포 대상 13개 의존성·해시 | PASS | 기존 manifest 재생성 결과 동일, 제품 파일 변경 0 |
| 운영 적용·운영 롤백 실증 | 미실행 | 승인 금지 범위이며 실제 백업/인증 조건 미충족 |

## 2. 운영 인증·Edge·API — 실제 읽기 전용 확인

증거: live-auth-results.json, 재현 도구 check-live-readonly.py. 도구는 고정된 기존 프로젝트 URL과 로컬 공개용 publishable 키만 사용하며 키/응답 본문/고객 정보를 출력하거나 저장하지 않는다. 조회는 limit=0이다. 등록·tick·제작·유료 연결 테스트 요청은 보내지 않았다.

| 검사 | 응답 |
| --- | --- |
| Auth user, 토큰 없음 | 401 |
| Auth user, 잘못된 토큰 | 403 |
| 익명 applications/ai_work_plans/admin_users 0행 조회 | 모두 401, 42501 |
| orchestrator capabilities, 토큰 없음 | 401 login_required |
| orchestrator capabilities, 잘못된 토큰 | 401 JWT format rejection |
| orchestrator CORS preflight | 204, Allow-Origin=https://solqtech.com, no-store |
| machine worker, 브라우저 Origin | 403 machine_only |
| production snapshot, 토큰 없음 | 401 invalid_session |

이 결과는 유효하지 않은 인증의 거부와 API 도달성을 증명한다. 정상 토큰 서명 검증·세션 만료/갱신·실제 관리자 성공·실제 비관리자 JWT 거부를 모두 증명하지는 않는다. 브라우저 인벤토리는 about:blank 1개뿐이었다. 운영 구 관리자 JS는 자동 등록 위험이 남은 버전이므로 실제 운영 화면에 로그인해 중복을 재현하지 않았다.

배포 소스도 읽기 전용으로 확인했다. nexus-orchestrator v7은 verify_jwt=true이고 함수 내부에서 auth.getUser 및 admin_users를 검사한다. 현재 운영 submit에는 고객 신청/계획 키 차단이 아직 없으며 기존 후보 handler에만 추가돼 있다. DB 고객 연결 가드 역시 아직 운영 미설치다. nexus-agent-worker v2와 nexus-production v1의 verify_jwt=false는 그 자체로 무인증 허용이라는 뜻이 아니다. worker는 브라우저 Origin을 거부하고 별도 기계 토큰을 검사하며, production snapshot/issue_link/release는 내부 사용자·관리자 검사를 수행한다. 무토큰 snapshot 거부를 실제 확인했다. 기계 토큰·유료 connection_test·제작 관련 호출은 하지 않았다.

운영 production 함수의 CORS는 기존 GitHub Origin 기준이다. 최상위 관리자 수정 패키지는 이 함수를 로드/호출하지 않으므로 이번 13개 파일의 새 의존성으로 확대하지 않았다. 별도 production 화면에서 SOLQ 도메인을 사용할 경우 별도 통합 검토가 필요하다.

## 3. 테이블·RLS·GRANT 검토 및 수정 후보

증거: table-grant-audit.json. public 테이블 14개 모두 RLS 활성. anon/authenticated는 canlogin=false, bypassrls=false, superuser=false이며 public 스키마 CREATE 권한이 없다. 관리자 조회 정책은 admin_users membership에 한정된다.

일반 역할의 업무 쓰기 권한은 다음과 같이 확인됐다.

- applications: anon/authenticated INSERT, authenticated UPDATE. 신규 접수 조건은 동의=true·status=received·internal_note=NULL, 관리자 UPDATE는 membership 정책과 WITH CHECK를 사용한다.
- support_inquiries: authenticated의 허용된 조회 컬럼과 answer/answered_at 두 컬럼 UPDATE. 테이블 단위 GRANT만 보면 빠지므로 컬럼 권한을 별도 검사했다. access_hash 조회나 질문 원문 UPDATE 권한은 없다.
- 계획·작업·단계·이벤트·무료 처리 상태·견적 동의 원장·제작 원장: authenticated SELECT. 직접 INSERT/UPDATE/DELETE 권한은 확인되지 않았다.
- private security_backups/free_plan_settings는 RLS 미활성이지만 일반 역할 테이블 GRANT가 없다. security_backups에 대한 anon/authenticated SELECT·UPDATE도 false다. private schema USAGE만으로 테이블 접근이 허용되지는 않는다. approve 호출에 필요한 authenticated schema USAGE는 임의 철회하지 않았다.

발견된 불필요 권한은 admin_users의 anon/authenticated 각각 TRUNCATE·REFERENCES·TRIGGER, 합계6개다. TRUNCATE/REFERENCES는 행 RLS의 적용 대상이 아니므로 별도 권한 축소가 필요하다. 직접 SQL 로그인·스키마 생성이 막혀 있고 노출된 함수에서 범용 SQL 실행 경로를 찾지 못했지만, 모든 경로의 공격 불가능성을 보장하는 근거로 확대하지 않는다. 운영에서 파괴 요청을 보내지 않았다.

수정 후보: **admin-users-grants-candidate.sql**. 이 후보는 운영 미적용이며 원래 13개 배포 파일과 별도 승인 대상이다. REVOKE 1문으로 위6개만 철회한다. SELECT·role membership·RLS 정책·고객 행은 변경하지 않는다. 유효 권한이 상속 등으로 남거나 필요한 관리자 SELECT/RLS가 없으면 예외로 전체 트랜잭션을 롤백한다.

[새 후보만 실행한 격리 회귀 로그](https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/40321542432), 코드 c7d825e, job121567436104, 결과 grants-test-result.json:

- 6개 권한 → 0개, 관리자 조회 유지·비관리자 조회0.
- 수정 전 가상 DB의 TRUNCATE 허용을 ROLLBACK으로 검증, 수정 후 같은 요청 permission denied.
- 기존 가상 행 JSON 동일, 반복 설치 성공.
- 상속 권한을 의도적으로 남긴 경우 후보가 실패하고6개 권한 변경 전체가 롤백됨.
- 운영 변경0, 별도 네트워크 없는 PostgreSQL17.11 컨테이너 정리까지 success.

Supabase 보안 Advisor의 공개 SECURITY DEFINER 경고는 submit_application·submit_support_inquiry·read_support_inquiry 3개에 대한 anon/authenticated 경고다. 공개 신청/문의와 조회키 기반 문의 열람이라는 의도된 진입점이며 입력/동의/조회키 해시 검사를 확인했다. search_path는 비어 있고 범용 동적 SQL 경로는 없다. 경고를 없애려고 일괄 REVOKE하면 기존 접수 기능이 중단되므로 변경하지 않았다. 별도 누출 비밀번호 보호 비활성 권고도 관측됐다. 현재 로그인 취약 비밀번호 사용이나 침해가 입증됐다는 뜻은 아니며 설정 변경은 하지 않았다.

관련 공식 조치 안내:

- [익명 SECURITY DEFINER 경고](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [로그인 사용자 SECURITY DEFINER 경고](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [비밀번호 보호 설정](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [PostgreSQL17 RLS 범위](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)

## 4. 기존 운영 백업 확인

증거: backup-metadata.json. 고객 payload를 다운로드/출력/업로드하지 않고 메타데이터·항목 유무·집계만 확인했다.

| 내부 스냅샷 | 생성 시각(KST) | 신청 | 계획 | 범위 판단 |
| --- | --- | --- | --- | --- |
| approval-gate-20261025 | 10월25일14:21:18 | 6 | 2 | 과거 변경용 부분 자료 |
| solq_free_plan_automation_v1 | 10월26일13:51:57 | 7 | 4 | 무료 자동화 적용 전 부분 자료 |

현재 기준8건·5건을 모두 포함하지 않으며 Auth 사용자·sequence·Storage 객체·orchestrator_jobs 항목도 이 스냅샷 구조에는 없다. 첫 스냅샷의 jobs라는 이름이 현재 전체 orchestration 백업을 뜻한다고 추정하지 않았다. 원본 DB와 같은 프로젝트 안에 있어 프로젝트 전체 장애를 대비한 외부 복구본으로도 간주하지 않는다.

따라서 이 자료로 과거 전체 운영 DB를 되돌리면 최신 접수·설정 유실 위험이 있어 복원하지 않았다. 플랫폼의 별도 관리형 백업이 없다고 단정하는 것은 아니다. 현재 Supabase 연결 도구에는 관리형 백업 목록/파일 다운로드 기능이 없고 get_project 응답에도 백업 상태가 없으며 재사용 대시보드 세션도 없다. [Supabase 공식 백업 안내](https://supabase.com/docs/guides/platform/backups)의 관리형 백업 조회에는 해당 Dashboard 또는 Management API 권한이 필요하다. 현재 요금제·백업 보유 기간·최신 관리형 백업 존재는 확인 불가다.

이전 가상 pg_dump 복원 통과 결과는 재사용했으며 같은 시험을 반복하지 않았다. 실제 고객 백업을 공개 CI에 가져오거나 새 프로젝트·서버를 만들지 않았다.

## 5. 배포·롤백 최종 점검

기존 배포 대상13개 제품 파일의 해시/의존성은 변경되지 않았다. 최소 적용 순서: 보호된 백업 확인 → 승인된 권한 후보(별도 승인 시)와 DB 연결 가드 → nexus-orchestrator entrypoint/handler/engine → 최상위 관리자 문서/8개 자산 → 구 탭 재접속·동일 해시·CSP/캐시·조회 무쓰기 확인. 견적 API와 과거 후보 폴더 전체는 제외한다.

SQL은 단일 트랜잭션·짧은 잠금 제한으로 적용하고 충돌 시 전체 rollback한다. 권한 후보가 실패하면 강제로 성공 처리하거나 상속 역할을 임의 변경하지 않는다. 커밋 후 관리자 조회 장애가 생기면 SELECT/RLS 원래 정의를 보호된 백업과 대조하며 불필요 권한을 자동 재부여하지 않는다. 관리자 자산 복구는 안전한 조회 전용/유지보수 화면을 사용하고 중복 생성이 있는 구 JS를 재노출하지 않는다. 과거 전체 DB 복구는 배포 후 신규 신청을 유실시킬 수 있어 자동 롤백 경로로 사용하지 않는다.

현재 조건에서는 실제 적용·운영 롤백 실증을 실행할 수 없다. 준비 문서의 존재를 운영 복구 가능성 통과로 보고하지 않는다.

## 6. 보존·다음에 필요한 접근과 승인

최종 읽기 전용 집계: 신청8·무료 계획5·작업5·미연결4·논리적 중복1그룹·제작 시도0. 불필요 권한6개도 운영에서는 그대로다. 운영 DDL/DML/임의 연결·main 병합·배포·유료 AI·실제 제작·추가 게시 없음.

해제 조건은 다음으로 한정된다.

1. **인증:** 비밀번호를 채팅/저장소에 보내지 않는 보호된 방식으로 유효 관리자 인증 세션을 사용할 수 있어야 한다. 구 운영 화면의 자동 등록 위험을 피하는 읽기 전용 검증 경로에서 관리자 성공·실제 비관리자/만료 JWT·Edge 통합을 확인한다. 브라우저나 계정이 연결돼 있다는 사실만으로 인증 성공으로 처리하지 않는다.
2. **백업:** 기존 프로젝트의 관리형 백업 목록/파일 또는 최신 보호된 외부 백업에 대한 읽기 접근, 백업 시점/일관성/범위/암호화·접근통제 근거와 승인된 보호 복원 환경이 필요하다. 현재 데이터 포함 여부와 권한·함수·cron·Edge 버전·자산 복원 결과를 비교해야 한다. 운영 복원이나 고객 자료의 공개 CI 반출은 승인 범위가 아니다.
3. **권한:** 위6개 철회 후보의 운영 적용은 별도 DB 권한 변경 승인 대상이다. 후보 검증 완료가 운영 권한 변경 승인을 의미하지 않는다.

현재는 운영 배포 승인을 요청하지 않는다. 위 접근 조건 확보와 권한 조치 승인 범위를 정한 후 남은 해당 항목만 진행한다. 통과한 동시성·SDK/CSP·RLS·권한 후보 격리 테스트의 전면 재실행은 필요하지 않다.
