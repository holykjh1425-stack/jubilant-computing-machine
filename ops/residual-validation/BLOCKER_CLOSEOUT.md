# SOLQ 차단 요인 최종 점검 — 2026-10-26 KST

기준5eeca22. 기존 통과한 동시성100개·실패 재시도·RLS/SDK/CSP·30초 조회·권한 철회 회귀는 재실행하지 않았다. 이번 변경은 권한 복구 SQL 및 그 왕복/자동 워커 영향 검증과 접근 절차 확정이다. 운영 변경은0회다.

## A. 실제 관리자 인증 — 접근 차단 조건 확정

재사용 가능한 SOLQ 관리자 탭·세션이나 보호된 로그인 자격증명은 확보하지 못했다. 이 때문에 정상 관리자 로그인→목록→실제30초 갱신→로그아웃의 운영 통합은 **확인 불가**다. 이전 무토큰/잘못된 토큰 거부10개 PASS와 격리 브라우저 통과를 정상 운영 로그인 통과로 대체하지 않는다.

최소 해제 절차:

1. 기존 SOLQ 관리자 계정으로 보안 인증 입력 기능을 사용하는 읽기 전용 검증 경로에서 로그인한다. 새 계정/새 관리자 등록/비밀번호 재설정/권한 확대는 필요하지 않다. 비밀번호·JWT·refresh token을 채팅이나 공개 저장소로 전달하지 않는다.
2. 실제 현재 관리자 membership 및 유효 사용자 응답을 검증하고 목록 조회·30초 갱신·로그아웃 전후의 업무 쓰기를 관측한다. 토큰 교환/갱신용 Auth POST와 업무 데이터 쓰기를 구분한다.
3. 구 운영 admin.js의 자동 등록이 남아 있으므로 해당 화면에 단순 로그인하여 시험하지 않는다. 검증된 읽기 전용 후보 또는 허용된 안전한 인증 전용 경로에서 해야 한다. 계정 로그인이나 Supabase 연결이 돼 있다는 사실만으로 후보/운영 API 통합 성공을 선언하지 않는다.

Supabase 관리콘솔 로그인과 SOLQ 고객 관리 앱 로그인은 서로 다른 인증이다. 현재 MCP의 DB SELECT 권한은 앱 사용자 JWT를 제공하지 않는다. 앱 JWT를 서비스 역할로 대체하거나 DB에서 새 로그인 세션/사용자를 임의 생성하지 않았다.

## B. 전체 백업 — 접근 차단 위치 확정

기존 연결에는 관리형 백업 목록/다운로드 기능이 없어 공식 Supabase 대시보드의 해당 프로젝트 Scheduled backups 화면을 읽기 전용으로 직접 열었다. 초기 껍데기 화면 이후 다음 로그인 URL로 전환됐고, Welcome back / Sign in to your account / GitHub·ChatGPT·SSO·Email/Password 선택지가 실제 표시됐다.

https://supabase.com/dashboard/sign-in?returnTo=%2Fproject%2Felfacqmvygnwjlklqhiz%2Fdatabase%2Fbackups%2Fscheduled

로그인하지 않았으며 새 계정 생성이나 인증 우회를 하지 않았다. 해당 대시보드의 로그인/인증 화면은 백업 보유나 부재의 증거가 아니다. 다른 개인 브라우저에서 로그인했다고 이 작업 브라우저에 세션이 공유되는 것으로 간주하지 않는다.

기존 부분 스냅샷의 범위는 이전 backup-metadata.json을 재사용한다. 최신은 신청7·계획4건 시점이며 현재 신청8·계획5·작업5건을 포함한 전체 복원본이 아니다. 원본 payload를 복원 환경·공개 CI·저장소로 반출하지 않았다. 기존 가상 pg_dump 복원 시험도 재실행하지 않았다.

최소 필요한 권한/조작:

- 우선 **기존 프로젝트 접근 계정으로 이 작업 브라우저의 보호된 Supabase 로그인**이 필요하다. 아직 계정 역할 부족을 판정할 단계가 아니므로 Owner/Admin 신규 부여나 요금제 변경을 요구하지 않는다.
- API 경로를 사용하는 경우 기존의 안전하게 보관된 관리 토큰에 **Backups: Read** 범위와 해당 프로젝트 접근이 있으면 백업 일정·목록 조회가 가능하다. DB SELECT나 publishable/service-role API 키는 이 관리형 백업 목록 권한을 대신하지 않는다. 토큰 값을 채팅으로 요청하지 않는다.
- 목록 확인에는 Backups: Read-write/Restore PITR/프로젝트 Restore 권한이 필요하지 않다. 그 권한과 운영 복원 실행은 요청 범위에서 제외한다.
- 실제 복원에는 현재 데이터를 포함한 승인된 백업 자료와 기존 승인 범위의 **보호된 비운영 복원 환경**에 접근할 수 있어야 한다. 공개 CI에 실고객 DB를 복사하지 않는다. 물리 백업은 다운로드 가능한 논리 파일이 아닐 수 있으므로 로그인 후 실제 백업 유형·생성 시점·복원 경로를 확인한다. 새 프로젝트/서버 생성이나 유료 옵션 활성화로 우회하지 않는다.

정확한 결론: **현재 전체 백업의 존재·최신도·복원 가능성은 확인 불가**. 확인된 부분 스냅샷만으로는 전체 복원 조건에 미달한다.

공식 권한 범위: [Personal Access Tokens — Backups Read](https://supabase.com/docs/guides/platform/personal-access-tokens). 백업 유형/복원 한계: [Database Backups](https://supabase.com/docs/guides/platform/backups).

## C. 권한6개 — 적용/복구 준비 및 영향 검증 완료

대상은 모두 public.admin_users다. 원래 부여자는 postgres이며 grant option은 모두NO다. anon/authenticated/service_role의 역할 상속 관계는 조회 결과 없었다.

| 역할 | 권한 | 철회 사유 |
| --- | --- | --- |
| anon | TRUNCATE | 익명 접수·문의 기능에 관리자 명부 전체 비우기 불필요 |
| anon | REFERENCES | 익명 기능에 관리자 명부를 참조하는 제약 정의 불필요 |
| anon | TRIGGER | 익명 기능에 관리자 명부 트리거 정의 불필요 |
| authenticated | TRUNCATE | 관리자 조회·RLS membership 확인에 전체 비우기 불필요 |
| authenticated | REFERENCES | 앱 관리자 기능에 명부 참조 제약 정의 불필요 |
| authenticated | TRIGGER | 앱 관리자 기능에 명부 트리거 정의 불필요 |

현재 authenticated SELECT, service_role SELECT, service_role의 제작 private schema USAGE는 유지돼 있다. 적용 SQL은 위6개만 철회하고 SELECT·정책·행·역할·스키마 USAGE를 건드리지 않는다.

- 적용: [admin-users-grants-candidate.sql](admin-users-grants-candidate.sql)
- 복구: [admin-users-grants-recovery.sql](admin-users-grants-recovery.sql)
- 이전 철회 회귀 결과: grants-test-result.json
- 신규 복구/워커 영향 결과: grant-recovery-result.json
- [신규 격리 실행 로그](https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/40323550817), 코드adc2e64, job121574321703, success.

신규 테스트는 원래 ACL→철회→복구 순서만 추가했다. PostgreSQL17.11의 네트워크 없는 별도 컨테이너에서 가상 자료만 사용했다.

| 검사 | 결과 |
| --- | --- |
| 복구 후 원래 ACL 집합 | 정확히 일치 |
| 복구된 권한 | 원래6개·grant option 추가 없음 |
| 관리자 및 service_role 명부 조회 | 유지 |
| 전체 RLS 정책 정의 | 전후 동일 |
| 기존 가상 신청·계획·작업 JSON | 전후 동일 |
| 철회 후 신규 무료 워커 | 계획1·작업1·단계6 |
| 복구 후 신규 무료 워커 | 계획1·작업1·단계6 |
| 제작 시도 | 0 |
| 운영 권한 변경 | 0 |

복구 SQL은 원래 불필요 권한6개를 재부여하므로 자동 실행하지 않는다. 운영 철회 승인과 복구 실행 승인을 구분한다. 적용 전 원래 grantor/역할/권한/grant option과 현재 ACL을 다시 대조하고, 도중 변경이 있으면 무작정 덮어쓰지 않는다. 적용 중 실패는 SQL 트랜잭션 rollback으로 처리하며, 프런트엔드 오류만으로 권한 복구 SQL을 실행하지 않는다. 데이터 복구·명부 재생성·전체 DB 과거 복원을 수행하는 SQL이 아니다.

## 최종 안전성 판정

| 완료 조건 | 판정 |
| --- | --- |
| A 관리자 통합 PASS 또는 정확한 차단 조건 | 차단 조건/필요 인증 경로 확정, 실제 통합은 미실행 |
| B 전체 복원 PASS 또는 정확한 차단 조건 | 대시보드 로그인 벽·최소 조회 권한·보호 복원 환경 조건 확정 |
| C 적용/복구 SQL·격리 영향 검증 | PASS, 운영 미적용 |
| 지정 브랜치 보존 | 본 문서와 SQL/실행 결과 저장 |
| 운영 배포 가능 여부 | **보류** |

최종 읽기 전용 집계: 신청8·계획5·작업5·미연결4·논리적 중복1그룹·제작 시도0, 운영 불필요 권한6개 유지. main/운영 배포/DB DDL·DML/실제 제작/유료 AI/신규 프로젝트는 실행하지 않았다. 배포 대상13개 제품 파일은 그대로다.

사용자에게 필요한 최소 다음 항목은 (1) 기존 SOLQ 관리자 보안 인증 세션, (2) 기존 Supabase 계정의 보호된 로그인 또는 기존 Backups:Read 경로와 실제 백업 자료·보호 복원 환경 접근이다. 운영 권한 철회/복구와 실제 배포는 이후 각각 별도 승인 대상이다. 지금 운영 배포 승인을 요청하지 않는다.
