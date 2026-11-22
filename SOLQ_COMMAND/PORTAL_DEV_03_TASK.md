# SOLQ COMMAND — SOLQ-PORTAL-DEV-03 / Windows 격리 환경 승인 전 증거 수집

발행: ATLAS / 2026-11-22 KST
작업 성격: READ_ONLY_PREAPPROVAL_AUDIT
브랜치: dev/solq-windows-isolation-gate-20261122
기준: DEV-02 commit 8c5ea9e2bab2daed8433077519ca28bd1ed9ea8f
대상: 기존 Windows PostgreSQL 17.11 비운영 후보 환경. 운영 Supabase elfacqmvygnwjlklqhiz 접속 금지.

## 목적
기존 Windows 환경의 PostgreSQL 17.11, Auth, PostgREST, Storage 구성 및 격리 증거를 읽기 전용으로 확인하고 실제 통합시험을 승인할 수 있는지 PASS/BLOCKED/NO-GO로 판정한다. 이번 작업은 DB 기동·생성·접속·쓰기·SQL 실행 자체를 승인하지 않는다.

## 필수 확인 (읽기 전용)
1. 기존 DEV-02 영수증과 TEST-PLAN, 원본 11개 및 신규 후보 8개 파일 해시를 확인하고 보존한다. 기존 PASS 검증은 불필요하게 반복하지 않는다.
2. Windows 로컬의 기존 PostgreSQL 17.11 postgres.exe, initdb.exe, pg_ctl.exe, psql.exe 및 필수 lib/share의 경로·파일 해시·버전과 기존 T01 격리 기록을 확인한다. 실행 파일 존재와 서비스 실행/독립성은 구분한다.
3. 이미 존재하는 PostgreSQL 데이터 디렉터리, 설정, 서비스/프로세스, 수신 포트, Auth/PostgREST/Storage의 설치/구성 상태를 파일 메타데이터와 OS의 읽기 전용 명령으로 조사한다. 환경변수·설정에 비밀이 있으면 값은 출력·복사·기록하지 않는다.
4. 운영 Supabase 및 실제 고객 데이터와 무관한 합성 데이터 전용 환경임을 입증할 수 있는 디렉터리/접속 목적지/권한/방화벽/loopback 경계를 조사한다. 운영 URL이나 비밀 키를 사용한 접속 시험은 하지 않는다.
5. localhost 전용 리스너와 외부 송수신 제한, Windows 사용자/ACL, 별도 저장소, 데이터 정리/원복 가능성, 인증 사용자 A/B/관리자/익명 합성 역할을 각각 증거로 검증한다.
6. 실행을 위한 SQL 파일별 절대 경로·SHA-256·의존성·기대 결과·최소 권한을 정리한다. 후보 REVIEW_ONLY SQL은 미적용 유지. PostgreSQL 17.11, Auth, PostgREST, Storage의 누락된 구성요소와 추가 설치·비용 필요 여부를 구분한다.
7. Windows W04/W05/W09 기존 보류와 충돌 여부를 확인하고 별도 차단 사항을 기록한다. 승인 없는 환경 재구성이나 Windows 작업 예약 변경 금지.

## 실행 승인 관문
G1 환경 식별: 기존 로컬 비운영 인스턴스와 실제 운영 환경이 별개임을 독립 증거로 입증.
G2 네트워크: loopback 전용·외부 전송 차단·운영 연결 경로 없음.
G3 데이터: 합성 전용, 기존 고객/운영 데이터 없음, 원본 보존 및 별도 경로.
G4 Auth/RLS/Storage: 구성요소 존재와 합성 역할·권한 테스트 가능성 확인. 없으면 미설치/미확인으로 기록.
G5 복구: 테스트 범위·SQL 해시·사전 백업·원복·정리 계획 및 위험 격리 확인.
G6 권한: 정확한 실행 대상·명령·예상 쓰기·비용에 대한 별도 사용자 승인 필요.
각 관문 PASS/BLOCKED/NO-GO, 증거 경로/해시/시각, 미확인 사항 기록. G1~G5 모두 PASS하더라도 이번 지시는 G6 승인이 아니며 실제 DB 실행 금지.

## 산출물
- SOLQ_COMMAND/REPORTS/SOLQ-PORTAL-DEV-03-WINDOWS-ISOLATION.md (증거 매트릭스, 확인 명령, 실제 결과, 차단 사유, 최소 후속 시험 계획)
- SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-03.json 을 기존 공동 장부 브랜치 docs/solq-ack-receipts-20261121에 신규 게시. 필드 taskNumber, receiptStatus, executionStatus=READ_ONLY_AUDIT, reportStatus, gates, evidence, missingComponents, requestedApprovals, productionImpact=NONE, launchStatus=NO_GO.
- 기존 파일 수정/삭제 금지. 신규 보고 파일만 이 개발 브랜치에 커밋. 결과 확인 전 PASS 주장 금지.

## 절대 금지
PostgreSQL/DB/Auth/PostgREST/Storage 프로세스 시작·정지·접속, SQL 실행·마이그레이션, 운영 Supabase 읽기/쓰기/로그인, Docker 조작, 설치, 외부 네트워크 호출, 실고객 데이터 조회, 운영 키/비밀번호/토큰 수집·출력, Git main 변경, Sites 배포, 유료 API, 결제, 자동충전, 실제 고객 알림/제작.

## 판정
현재 DEV-02 증거로는 준비 PASS / 실제 통합 BLOCKED. DEV-03은 독립성 증거가 충분한지 판단하는 단계이며, 승인 없는 실행은 0건이어야 한다.
