# SOLQ COMMAND — SOLQ-PORTAL-DEV-02

발행: ATLAS / 2026-11-21 KST
범위: 기존 포털 후보를 보존하면서 비운영 PostgreSQL 17.11·Auth·RLS 통합 검증 준비 및 승인된 합성 환경에서만 시험.
브랜치: dev/solq-portal-db-auth-rls-20261121
기준 커밋: 6bbe674199bf9ddb970350a30e0b7623cae60b86
기존 후보: candidates/portal-integration-20261121/ (11개 파일, 삭제·덮어쓰기 금지)

## 증거와 경계
- 기존 DEV-01 보고: docs/solq-ack-receipts-20261121 / SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-01.json
- DEV-01 합성 API 17 PASS, 오프라인 브라우저 6 PASS. 실제 PostgreSQL/Auth/PostgREST/RLS/Storage 통합은 BLOCKED.
- 공식 Sites v32 및 GitHub root는 별도 경로. 운영 REST 직접 INSERT와 RPC 계약을 혼동하지 말 것.
- 기존 Supabase 프로젝트 elfacqmvygnwjlklqhiz는 운영 보호 대상. 이 프로젝트의 읽기/쓰기, 자격증명 사용, 인증 시도, 연결 확인조차 수행하지 않는다.
- 기존 보호 백업·복원·RPO/RTO·보안 경고 종결은 여전히 BLOCKED.

## 단계 1 — 비운영 환경 사전 조사 (읽기 전용)
1. 기존 Windows PostgreSQL 17.11 실행 파일, 합성 시험 자산, 검토 SQL 3개, 격리 실행 기록의 존재·경로·SHA-256·버전·의존성을 확인한다. 이미 검증된 증거는 재사용한다.
2. 기존 비운영 PostgreSQL/Auth/PostgREST 실행 인스턴스가 운영과 독립되어 있는지 확인한다. 실제 자격증명이나 고객 데이터는 열람하지 않는다.
3. 네트워크 경계, 저장 위치, 관리자·고객 A/B·익명 합성 역할, 테스트 후 정리·원복, 외부 전송 차단 조건을 표로 기록한다.
4. 비운영 인스턴스의 독립성, 기동·쓰기·SQL 실행에 대한 기존 사용자 승인이 입증되지 않으면 실제 DB 시험을 실행하지 않고 BLOCKED로 보고한다.

## 단계 2 — 개발 후보 및 시험 자산 작성 (승인 범위)
1. DEV-01 원본 11개 파일의 Git blob/SHA-256을 재확인하고 그대로 보존한다. 신규 후보 파일은 별도 경로 candidates/portal-db-auth-rls-20261121/에 추가한다.
2. 합성 데이터 전용 PostgreSQL 17 호환 스키마/마이그레이션 및 원복 SQL을 REVIEW_ONLY/NOT_APPLIED로 작성한다. 원본 신청·접수번호·독립 동의(버전/해시/서버 UTC)의 원자성, 요청 키 멱등성, 저장 결과 확인, 권한 거부를 포함한다.
3. Auth 역할별 접근 정책과 RLS, 비공개 Storage 정책, 관리자 확인/제작 승인 경계를 코드·SQL·시험 명세로 분리한다. 클라이언트에 서비스 키·비밀을 넣지 않는다.
4. PostgreSQL/PostgREST/Auth 연결 어댑터는 기본 OFF, 로컬 합성 전용 설정으로 작성한다. 운영 프로젝트 URL·운영 키·토큰·고객 식별정보를 코드/보고서에 저장하지 않는다.
5. 기존 mock/rules AI는 유지한다. 유료 AI API, 고객 발송, 실제 결제/제작 워커 실행 경로는 OFF.
6. 자동화된 시험 설계: 익명 거부, 고객 A/B 분리, 관리자 최소 권한, 무동의·동의 변경, 중복·충돌·응답 유실·동시성, 세션 만료·권한 회수, 견적 동의/모의 입금/별도 승인 3관문, 원복과 재기동 내구성.

## 단계 3 — 실행 관문
- 정적 분석, SQL 구문 검사(가능한 범위), 순수 합성 모의 시험은 허용.
- 실제 비운영 DB 기동·생성·쓰기·마이그레이션·Auth/PostgREST 연동 시험은 **기존 승인된 독립 환경 및 실행 권한이 확인되는 경우에만** 허용. 그렇지 않으면 준비 자산만 작성하고 별도 승인 요청.
- 새로운 서버·프로젝트·유료 플랜·Docker 조작·설치·운영 DB 접근은 금지.
- 시험을 실행했다면 환경 식별(비밀 제외), 명령, 데이터 종류, 실행 전후 무결성, PASS/FAIL/BLOCKED, 실행 비용 0원 여부를 기록한다.
- 기존 DEV-01 PASS 시험을 무의미하게 반복하지 않는다. 수정 영향이 있는 경우만 재실행한다.

## 보고
- 개발 브랜치에 신규 파일만 커밋·push. 기존 11개 파일과 main/공식 Sites 변경 금지. PR 병합 금지.
- 공동 장부 docs/solq-ack-receipts-20261121 / SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-02.json 을 신규 생성한다.
- 보고 필드: taskNumber, receiptStatus, executionStatus, reportStatus, verifiedAtUtc, codeCommit, preservedFiles, actualDbTestsRun, tests(pass/fail/blocked), isolationEvidence, requiredApprovals, launchStatus=NO_GO.
- 실제 통합시험이 실행되지 않았다면 완료 표현은 PREPARATION_PASS / INTEGRATION_BLOCKED로 구분한다. 실행 증거 없이 DB/RLS PASS 주장 금지.

## 금지
운영 Supabase·고객 데이터 접근/변경, 유료 AI/API 호출, 자동충전, 외부 발송, 새 프로젝트/서버/구독, 설치, 결제, 공식 Sites 배포, main 수정, 원본 삭제, 운영 자격증명 열람·복사·기록, 승인 없는 DB/Windows/Docker 실행.
