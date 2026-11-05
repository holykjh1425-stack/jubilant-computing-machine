# ATLAS 통합 복구·검증 결과 — 2026-11-05

**최종 판정: NO-GO. 운영 반영 보류.** 기준 브랜치 `dev/solq-independent-runner-20261102`, 인계 커밋 `045802ebb5bd7cc5813b2857248dbe832cd4bbd7`. 이번 작업은 기존 33+30 PASS를 실행하지 않았다.

## 실제 완료

|담당|실행 결과|증거|
|---|---|---|
|CORE|운영 마이그레이션 SQL 11건을 읽기 전용으로 복구. GitHub 기존 7개는 파일 타임스탬프가 다르지만 앞뒤 공백 제외 본문 일치. 누락 4개와 별도 초기/승인 보호 구조를 분리.|source-manifest.json, history/, 00-initial-schema.sql, 10-untracked-approval-prerequisites.sql|
|CORE|PGlite PostgreSQL 18.6에서 플랫폼 테스트 어댑터를 사용해 11건 재생. 20개 테이블·154개 컬럼·83개 제약·37개 인덱스·21개 RLS 정책·5개 트리거·3개 공개 시퀀스 정의 대조 일치.|results.json|
|AUTO|복구 구조에서 합성 접수·접수번호·무료 6단계 계획·서버 자동 경로·반복 처리·관리자 RLS 조건·견적 동의·착수금 증거·수동 확인·별도 제작 승인 연결 검증.|results.json|
|SENTINEL|공개 RPC 3개를 invoker 진입점과 제한된 NOLOGIN/NOBYPASSRLS 소유자 함수로 분리한 후보 작성. 공개 접수·문의 토큰별 조회·권한 차단·최소 권한·복구 SQL 검증.|security-candidate.sql, security-rollback.sql|
|GUARD|합성 저장 후 엔진 재시작·실패 시 트랜잭션 롤백·후속 요청 회복 확인. 운영 9/6/7건의 내용 지문을 작업 중 비교 전후 대조하여 일치 확인.|results.json, preservation.json|
|FIN|신규 유료 자원·추가 유료 API 호출·운영 배포 없음. 기존 요금제 청구 총액을 이번 결과로 확정하지 않음.|실행 범위|

신규 검증은 **37 PASS, 0 FAIL**. 이는 위 합성/임베디드 SQL 검증 범위의 결과다. 기존 63 PASS와 합산해 운영 통합 PASS로 표시하지 않는다.

## 복구 원인과 조치

- 최초 GitHub SQL 이전의 `applications`, `admin_users` 기초 DDL이 누락되어 있었다. 운영 카탈로그로 컬럼·제약·정책·인덱스를 복구했다.
- 11건의 마이그레이션만으로는 이력 밖의 `security_backups`, `production_approved_by/at`, 승인 FK·함수·트리거 및 추가 유니크 인덱스가 빠진다. 현재 카탈로그를 근거로 별도 전제 SQL을 만들었다. 과거 이력인 것처럼 위조하지 않았다.
- 마지막 운영 이력에 이미 견적 보호 함수·트리거가 있으므로 `production-gates.sql`을 중복 적용하면 충돌한다. 복구 순서에서 중복 재생을 제외했다.
- 무료 계획 경로와 유료 제작 미리보기 등록 경로는 별도다. 서버 `tick`의 미리보기 등록 후 견적 기록을 연결했으며, 실제 제작/API 실행은 수행하지 않았다.
- 시퀀스 bigint 메타데이터는 문자열로 수집해 JavaScript 숫자 정밀도 손실을 방지했다.

## 보안 확인

운영 Advisor는 **기존 WARN 7건 유지**다. 후보를 운영에 적용하거나 운영 경고가 해소됐다고 주장하지 않는다.

- 공개 SECURITY DEFINER 함수 3개의 anon/authenticated 경고 6건: 공개 기능을 일괄 차단하지 않고 최소 권한 후보를 구현·격리 검증했다. 실제 Supabase Advisor 재점검은 native 대상 적용 후 필요하다.
- 유출 비밀번호 보호 1건: 설정 변경 없음. 공식 문서상 Pro 이상에서 Auth 설정으로 구성하며 실제 관리자 로그인 영향 검증과 운영 변경 승인이 필요하다.
- 추가 실증: 운영 `admin_users`에서 anon/authenticated의 TRUNCATE·TRIGGER 등 관리 권한과 `applications`의 MAINTAIN 권한이 확인됐다. 실제 관리 명령은 실행하지 않았다. 후보에서 해당 부수 권한을 제거하고 접수 INSERT·관리자 SELECT/UPDATE를 보존했다.
- 공개 스키마 기본 ACL에도 불필요한 관리 권한 상속이 있어 최종 검토가 필요하다. 원본 ACL은 `access-metadata.json`에 기록했고 실제 운영 변경은 하지 않았다.

공식 근거:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## 미완료 관문

|관문|판정|정확한 차단|
|---|---|---|
|native PostgreSQL 17·정식 확장 전체 재현|미검증|현재 런타임에 Docker 없음. UID 매핑은 0→0 한 개뿐이고 비관리자 UID/namespace 매핑 불가. 일반 PostgreSQL은 root 실행 불가. 대체 유료 자원 미생성.|
|실제 Supabase Auth/JWT·PostgREST·Edge|미검증|이번 SQL Auth 어댑터는 서명된 JWT나 실제 로그인 서버가 아니다. 운영 인증·키를 시험용으로 재사용하지 않음.|
|독립 연결 동시성|미검증|임베디드 단일 연결 검증으로 대체하지 않음. 이전 독립 연결 결과는 역사 증거만 보존.|
|전체 암호화 운영 백업|미완료|보호된 실제 DB 접근·암호화 저장소·복구키 보관·복구점 범위가 이 세션에서 확보되지 않음. 메타데이터 JSON은 전체 백업이 아님.|
|실제 백업 격리 복원|미완료|복구 가능한 운영 백업과 보호된 native 복원 대상이 필요. 합성 저장 재시작은 실제 백업 복원이 아님.|
|최종 PC·모바일 인증 UI|미검증|이번 변경은 SQL/비운영 후보이며 브라우저 회귀나 실제 관리자 인증을 재수행하지 않음.|
|운영 배포|NO-GO|위 필수 관문 및 별도 배포 승인 미충족.|

### 지원 회신

SU-533612·SU-526318 관련 새 티켓은 **SU-536243**이다. 연결된 Gmail 스레드에는 2026-11-03 13:26 KST 접수와 13:33 KST 전문 보안팀 이관 회신이 있다. 조회한 스레드에는 구체적인 백업·복원 기술 해결책이 아직 없다. 이번 작업에서 중복 문의나 추가 발송은 하지 않았다.

원문: https://mail.google.com/mail/u/?authuser=junghwak754%40gmail.com#all/1a19fa8da42b2716

### 백업 범위

DB 스키마·데이터·역할/권한·RLS·함수·트리거·시퀀스·버전 호환 Auth 테이블이 필요하다. Storage 파일 바이트, Edge 소스/배포 설정, OAuth·SMTP·DNS·프로젝트 설정과 Vault/비밀 설정의 보호된 복구는 별도 범위다. SQL 연결 도구의 카탈로그 수집을 이 전체 범위의 백업으로 인정하지 않는다. 사용자 Windows 키 저장소/USB 비밀키에 접근하지 않았다.

## 운영 데이터 보존

신청 **9건**, 계획 **6건**, 작업 **7건**. `preservation.json`의 내용 지문은 비교 전후 일치했다. 운영 INSERT/UPDATE/DELETE/DDL·RLS 변경·main 병합·홈페이지 배포는 0건이다.

직접 FK 두 개가 모두 NULL인 작업 수는 5건이다. 이는 과거의 ‘미연결 4건’ 논리 판정과 동일한 집계 정의가 아니다. 과거 idempotency 기반 연결/중복 판정의 정확한 기준은 별도 재대조 대상으로 남겼고, 임의 재연결·삭제·정리는 하지 않았다.

## 다음 실행과 승인

1. 기존 보호된 무료 로컬 Supabase 실행 환경에 실제 접근 가능한 경로를 확보한다. 같은 운영 키/인증 토큰을 복사하지 않는다.
2. 그 환경에서 PostgreSQL 17·정식 Auth/JWT·RLS·Edge·독립 연결 검증을 수행한다. README의 테스트 어댑터는 실제 플랫폼의 대체물이 아니다.
3. 전문팀 기술 회신과 공식 백업 경로, 암호화 저장/복구키 통제, 실제 격리 복원으로 G-03/G-04를 해소한다.
4. 최종 보안 기본권한 검토와 페이지 회귀 후 정확한 운영 변경 목록·비용·롤백을 확정한다.
5. 모든 필수 관문 PASS 이후에만 운영 권한/설정/배포에 대한 별도 승인을 요청한다. 유료 검증 환경이 필요한 경우 비용부터 별도 승인받는다.

지금은 추가 운영 배포 승인을 요청하는 단계가 아니다. 후보 코드·SQL과 무료 격리 검증은 준비됐고, 실제 플랫폼 및 백업/복원 관문이 남았다.

