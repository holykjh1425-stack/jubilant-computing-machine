# SOLQ COMMAND — SOLQ-PORTAL-DEV-04

발행: ATLAS, 2026-11-22 KST
작업: 기존 Windows 독립 비운영 인스턴스 식별 및 복구 가능성 확보
성격: READ_ONLY_DISCOVERY_AND_RECOVERY_DESIGN / NO_EXECUTION_AUTHORITY
기준: DEV-03 보고서 cdbdfc725cd3b95c1fa6b4727f8432d42ae49c36, DEV-02 8c5ea9e2bab2daed8433077519ca28bd1ed9ea8f

## 목적
DEV-03 G1~G5 BLOCKED를 해소할 수 있는 증거를 확보한다. 기존 Windows PostgreSQL 17.11과 T01 자료를 보존하고, 이미 존재하는 독립 시험 환경의 식별·권한·네트워크·복구 가능성을 조사한다. 실제 환경의 독립성 입증이 불가능하면 NO-GO로 명시하고 별도 설치나 운영 접속을 시도하지 않는다.

## 작업 순서 (읽기 전용)
1. DEV-03 보고서 및 공동 장부, 로컬 증거 JSON, T01 17개 명세, Approval A, P0-03 14/14 방화벽 기록을 확인한다. 보호 폴더 접근 거부 시 권한 우회 금지. 접근 가능 여부와 오류만 기록한다. 기존 PASS 재시험 금지.
2. Windows의 기존 서비스·예약 작업·프로세스·포트·실행 계정 SID, 설치 디렉터리, 데이터/log 경로와 각 ACL을 읽기 전용으로 식별한다. 관리자 권한이 필요한 조회는 임의 상승하지 말고 명령과 필요한 권한을 별도로 보고한다. W04 FAIL/W05·W09 BLOCKED 유지.
3. 기존 PostgreSQL 17.11 인스턴스 후보마다 실행 파일 해시, 설정 경로, 데이터 디렉터리, DB 식별자, 계정, 로컬 바인딩 계획, 외부 통신 차단 증거를 연결한다. 실행 중이지 않으면 미실행으로 기록하며 시작/접속 금지. 운영 Supabase elfacqmvygnwjlklqhiz와 물리·논리·자격증명·네트워크 분리 입증 없이는 독립 PASS 금지.
4. Auth·PostgREST·Storage의 실제 실행 파일/패키지/서비스/버전/설정 및 합성 키·역할·비공개 버킷의 존재 여부를 확인한다. TOML 활성 플래그는 설치/실행 증거로 인정하지 않는다. 비밀 값·토큰·실제 사용자 데이터는 출력하거나 복사하지 않는다.
5. 시험 전 복구 기준점 후보를 설계한다. 백업 대상(합성 DB, 역할, ACL, 설정, Storage 객체), 위치·크기·해시, 독립 저장 경로, 복구 명령, 검증 방법, 종료·정리 순서, 기존 T01 보호, 운영 경로와 겹침 여부를 표로 정리한다. 실제 백업 생성/복원/삭제/스냅샷/쓰기 금지. 기존 백업이 있으면 메타데이터·해시만 읽기 전용 확인한다.
6. 승인 전 단계별 실행 계획을 작성한다: (a) 독립 인스턴스 식별 및 접근 증거, (b) 사전 백업 및 격리 복구 검증, (c) 합성 PostgreSQL 접수·동의·RLS, (d) Auth·PostgREST·Storage 통합. 각 단계에 정확한 대상/계정/포트/명령/SQL SHA-256/예상 쓰기/정지 조건/원복/비용 0원 전제를 적고 단계별 별도 승인 관문을 둔다. 실행 명령은 문서에만 기재한다.
7. 증거 판정: G1 환경, G2 네트워크, G3 합성 데이터·ACL, G4 Auth·API·Storage, G5 복구 기준점 각각 PASS/BLOCKED/NO-GO와 근거·관측 시각을 명시. 단순 파일 존재를 실제 동작 PASS로 판정하지 않는다.

## 결과물
- 신규 보고서 SOLQ_COMMAND/REPORTS/SOLQ-PORTAL-DEV-04-ISOLATION-RECOVERY.md
- 기존 공동 장부 브랜치 docs/solq-ack-receipts-20261121에 신규 SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-04.json
- 보고서에 '기존 독립 환경 존재 여부', '복구 가능성 입증 여부', '누락 구성요소', '사용자 별도 승인 필요 범위', '0건 실행/0원 비용'을 명시.
- 보고서 파일만 이 개발 브랜치에 추가하고 기존 소스/보고서/데이터는 수정·삭제하지 않는다.

## 금지
운영 Supabase·고객 데이터·운영 자격증명 접근, DB/서버 시작·정지·접속, SQL 실행, 신규 설치, Docker/WSL 조작, 방화벽/ACL 변경, 실제 백업·복원·삭제, 관리자 권한 임의 상승, Git main 변경, 배포, 유료 API·결제·외부 발송. 기존 PostgreSQL/T01 자산 및 DEV-01 11개·DEV-02 8개 원본 보존.

## 완료 조건
READ_ONLY_AUDIT_COMPLETED는 증거 수집 완료를 뜻할 뿐 통합시험 승인이나 복원 PASS가 아니다. 독립성·복구가 입증되지 않으면 INTEGRATION_BLOCKED / launchStatus NO_GO / executionAuthority false 유지.
