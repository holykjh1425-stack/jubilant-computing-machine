# SOLQ-PORTAL-P0-02 — A/F 병행 증거 대조

발행: ATLAS / 2026-11-21 / 승인 범위: 읽기 전용 증거 조사 및 보고서 작성만 / 운영 NO-GO

## 근거
- 1차 Codex 보고: docs/solq-ack-receipts-20261121 / SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-P0-01.json (audit COMPLETE, launch NO_GO).
- 본 지시서 기준: docs/solq-portal-af-evidence-20261121 / SOLQ_COMMAND/PORTAL_AF_TASK.md.
- 2026-11-08 Sites v32 배포 기록: ops/consultation/sites-release-20261108/REPORT.md 및 verification/production-browser.json, commit be8de8ba6b1275dc96f3c9c2afd3ea03ff1b1b01. 배포 당시 PASS를 현재 운영 PASS로 간주하지 말 것.
- GitHub main·개발 브랜치와 공식 Sites 배포는 다른 소스일 수 있음.

## A — 공식 도메인·배포 소스 대조 (CORE/SENTINEL)
1. 현재 공식 도메인 solqtech.com 및 www의 공개 DNS, 공개 경로 /, /privacy, /consultation/, /admin, /data-deletion의 연결 증거를 기존 자료와 읽기 전용으로 비교한다. 공개 HTTP 접근 실패는 접근환경 차단과 서비스 실패를 구분한다. 우회 금지.
2. Sites 배포 메타데이터를 읽을 수 있는 기존 승인된 경로가 있으면 현재 버전·배포 ID·빌드 지문·배포 시각·dist 소스를 기록한다. 접근 불가하면 UNVERIFIED. 로그인/권한 변경 금지.
3. GitHub main과 개발 브랜치의 신청 전송 경로(RPC submit_application)와 Sites dist의 전송 경로(NexusAPI/REST) 차이를 파일·행·커밋으로 대조한다.
4. 개인정보 안내·국외이전 체크박스·서버 저장 계약·접수번호 표시·관리자 조회의 각 실제 목적지를 표로 작성한다. 현재 증거와 과거 증거를 분리한다.
5. 후속 코드 수정이 필요한 최소 범위를 산출하되 실제 코드 변경·배포는 하지 않는다.

## F — 백업·복원 증거 대조 (GUARD/SENTINEL)
1. 기존 Supabase 백업 지원 답변과 로컬/저장소 백업 매니페스트를 재사용하여 최근 백업 ID, UTC 시점, 범위, 암호화 여부, SHA-256, 접근 가능한 증거를 읽기 전용으로 정리한다.
2. DB/스키마/역할/Auth/Vault 포함 범위와 Storage 객체, Edge Functions, Auth 설정, API 키, Realtime 등 별도 보존 항목을 구분한다. 기록상 지원 범위와 실제 보유 자산을 혼동하지 않는다.
3. 이전 격리 복원 실패와 PostgreSQL 17 자산, SQL 후보, W04 FAIL/보류 기록을 재사용한다. 기존 PASS 시험 재실행 금지.
4. 동일 백업 ID의 격리 복원 완료 증거, RPO/RTO 목표·실측, 보안 경고 종결·회귀 상태를 PASS/BLOCKED/UNVERIFIED로 분류한다.
5. 승인 없이 새 백업·복원·DB 연결·Docker 실행을 하지 않는다. 복원 비용 발생 가능성도 명시한다.

## 산출물
- A와 F 각각: 확인 사실/근거 URL·커밋/미확인/차단/최소 후속조치/별도 승인 필요 여부.
- 기능별 수정 우선순위와 파일 경로, 검증 수용 기준. 실제 운영 데이터 없이 가능한 격리 개발 준비 목록.
- 1차 보고와 달라진 상태만 명확히 기재하고 운영 NO-GO 유지.
- GitHub 승인된 receipts 브랜치 docs/solq-ack-receipts-20261121의 SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-P0-02.json에 신규 결과 1개 게시(기존 파일 덮어쓰기 금지). 게시 후 원격 파일 재조회, URL/커밋/지시서 SHA 확인. GitHub 게시 권한이 없다면 BLOCKED 보고.

## 금지
고객 신청 제출, 운영 DB 조회/쓰기, 고객 데이터/비밀정보 기록, 유료 API, 신규 프로젝트/결제, Sites 배포, main 변경, PR 병합, 운영 설정 수정, Docker/Windows 실행기 조작, 훅/예약 실행 설치, 자동 발송. 기존 원본·고객 데이터 보존.
