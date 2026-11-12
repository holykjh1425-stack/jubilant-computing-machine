# SOLQ COMMAND — 고객 인증·RLS 보완 실행 지시서 (2026-11-12)

발행 ATLAS. 담당 SENTINEL(보안)·CORE(인증)·AUTO(워커)·GUARD(검증). 기존 개발 브랜치 `dev/solq-customer-chat-pricing-20261112`와 커밋 `21b116b`의 `candidates/customer-platform-20261112` 작업을 **이어 수행**한다. 새로운 프로젝트를 만들거나 기존 PASS를 반복하지 않는다.

## ATLAS 직접 확인한 사실
- 운영 DB 읽기 전용 조회: 신규 `solq_customer_*` 및 `solq_customer_private` 테이블 0개.
- `admin_users`의 SELECT 정책은 `user_id=auth.uid()`; `applications`는 관리자 SELECT/UPDATE, 공개 INSERT 정책이 구분됨. 신규 RLS와 호환되는지는 격리 실행 전까지 미확정.
- 후보 `security/README.md`는 기존 익명 접수가 receipt만 반환하여 verified Auth 계정과 내부 application.id를 연결하는 신뢰 경로가 없다고 명시.
- 검토 문서 `docs/SOLQ_CUSTOMER_AUTH_RLS_SECURITY_REVIEW_20261112.md`.

## 실행 1 — 코드 보완 및 정적 검사
1. 신규 customer-schema.candidate.sql의 `admin_users` 조회가 운영 RLS에서 정상 동작하는지 **실제와 동일한 정책/권한을 복제한 격리 PostgreSQL**에서 확인한다. 고객 A/B, admin, anon, 만료 JWT, 소유권 변경, INSERT/SELECT/UPDATE/DELETE/TRUNCATE, 다른 고객의 validated preview 및 consent 철회 테스트.
2. 고객 인증에 `auth.getUser()` 서버 검증과 토큰 만료·세션 철회 검증을 설계하고, UI 사용자 전환/로그아웃 시 이전 고객 데이터를 제거한다. JWT `user_metadata`를 권한 판단에 사용하지 않는다.
3. 기존 익명 신청에서 verified Auth로 전환할 때 **서버가 확인한 application.id + 동일인 검증**이 없으면 연결을 거절한다. receipt/name/email만으로 고객 계정에 연결하는 우회 로직을 만들지 않는다. 사용자 동의 및 신청서 기존 흐름을 보존한다.
4. `enrollment-proof.candidate.sql`의 발급/교환은 신뢰된 서버만 수행하고, 5분 만료·1회 소비·해시 저장·원자적 바인딩을 실제 다중 DB 세션에서 검증한다. 동시 요청·재전송·세션 전환·로그 유출·오류 시 롤백 테스트.
5. 보안상 위험한 생성 HTML/JS를 고객 홈페이지와 동일 출처에서 실행하지 않도록 preview 격리·CSP·네트워크/스크립트 제한 및 검증된 버전만 노출하는 설계를 강화한다.
6. 고객 동의 버전·철회·보존/삭제·국외 보관 고지 정합성을 검토하고 개인정보 처리방침 변경 필요 여부를 보고한다. 임의의 30일 자동 삭제 조항 추가 금지.

## 실행 2 — 격리 통합 검증
- 합성 고객 A/B·관리자 세션으로 실제 PostgreSQL RLS, 권한 오류, 관리자 예외 접근, 신규 테이블 API 노출·GRANT·함수 EXECUTE·트리거 동작을 검증.
- 서버에서 견적 동의+입금 확인+별도 제작 승인+예산 한도+작업 임대의 원자적 검증을 통과할 때만 합성 워커 실행.
- 기존 고객 데이터/기존 관리자 기능의 보존 지문 및 테스트 증거를 재사용하고, 새로 바뀐 부분만 회귀 검증.
- PASS/FAIL, 테스트 명령, DB 격리 조건, 재현 방법, 보안 어드바이저 지적 및 커밋을 이슈 #10에 보고.

## 실행 3 — 운영 관문
- 운영 DB는 읽기 전용 감사만 허용. 신규 DDL/권한/Edge 배포, 실제 Auth 가입·메일/OTP 발송, 고객 데이터 수정, 실제 AI API 호출, 신규 서버/유료 결제, 운영 배포는 **별도 승인 전 금지**.
- 전체 백업·격리 복원·RPO/RTO 및 보안 종결 PASS 없이는 운영 전환 NO-GO 유지.
- 작업 완료 시 변경 파일, 합성 PASS/FAIL, 남은 위험, 예상 비용(실측과 가정 구분), 다음 승인 요청을 간결하게 보고.

## 선행 중단 조건
실제 고객 데이터 접근이 필요하거나 신규 테이블·정책을 운영에 적용해야 하는 순간 **즉시 중단하고 승인 요청**. 사용자에게 비밀번호, 서비스 키, OTP, 복구키를 채팅으로 요구하지 않는다.
