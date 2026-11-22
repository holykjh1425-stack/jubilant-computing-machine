# SOLQ COMMAND — DEV-06 Windows 독립 시험 환경 증거 확보

발행 ATLAS / 2026-11-22 KST
기준 DEV-05 보고서 9e749a79a2daae40c7e9070837182ee50b06b9e4
범위: 기존 Windows 환경 읽기 전용 식별만 / 운영 NO-GO / executionAuthority=false

## 목적
DEV-03~05에서 이미 확인된 P1, T01, Docker, DEV-01 11개, DEV-02 8개 증거는 재사용한다. 동일 권한 오류를 반복하지 않는다. 권한 있는 Windows 로컬 담당자가 실제 서비스·실행 주체·네트워크 경계와 원본/복원 후보를 구체적으로 식별한다. 현재 토큰에 관리자 역할이 없으면 사용자가 별도로 연 관리자 PowerShell에서 허용된 읽기 명령만 수행하도록 안내한다. 관리자 권한 자체를 얻거나 UAC를 우회하지 않는다.

## 단계 A — 먼저 실행 전 확인
1. 현재 Codex 세션이 Windows 로컬 실행 환경인지 확인. 아니라면 Windows에 접근할 수 있다고 주장하지 않고 사용자가 복사할 수 있는 명령과 예상 출력을 작성한다.
2. 읽기 전용 조회 대상은 로컬 Windows 서비스, PostgreSQL 관련 프로세스·경로·실행 계정, 로컬 포트·포트프록시·활성 방화벽 규칙, P1과 구별되는 기존 별도 복원 후보 메타데이터만.
3. 서비스·프로세스 조회: Get-CimInstance Win32_Service (PostgreSQL/명시된 기존 후보로 결과 필터), Get-Process, Get-NetTCPConnection -State Listen; 정확한 기존 서비스명 확인 후 sc.exe qc <service> (전체 명령행의 비밀 출력 금지).
4. 네트워크: netsh interface portproxy show all; Get-NetFirewallRule -PolicyStore ActiveStore 및 필요한 필터 조회. 출력은 관련 프로세스/포트/규칙만. 현행 루프백 및 외부 바인딩을 분리해 기록.
5. 권한: whoami /groups, Get-Acl (이미 승인된 합성 후보 경로에 한정). 보호된 T01/Approval A 경로는 접근 우회 금지. 소유자·상속·유효 계정 권한을 구분.
6. 복원 대상: 기존 승인된 격리 상위 경로의 디렉터리 메타데이터만 확인. 기존 P1과 동일 데이터 경로, T01 보호 자산, 운영 Supabase, 고객 원본은 후보에서 제외.
7. 실제 서비스·토큰·포트·ACL·클러스터 ID 연결이 증명되지 않으면 BLOCKED. 별도 복원 대상이 없거나 확인되지 않으면 환경 생성/설치를 자동 제안 실행하지 말고 비용·승인 요청만 문서화.

## 단계 B — 정확한 후속 실행 관문
A가 PASS일 때만 B1 합성 원본 백업 승인 요청서에 원본 식별자·경로·계정·루프백 포트·데이터 범위·암호화 저장소·예상 쓰기·중단 기준을 기재한다. B2 별도 복원, C SQL/RLS, D Auth/API/Storage, E 출시 심사는 모두 별도 승인 및 선행 관문 PASS 전에는 실행하지 않는다.

## 보존 및 금지
기존 SOLQ 원본·고객 데이터·DEV-01/02·P1·T01·Docker 볼륨·보안 백업 삭제/수정 금지. DB 시작·정지·접속·SQL·백업·복원, 서비스 제어, Docker/WSL 조작, 방화벽·ACL 수정, 설치, 유료 API, 결제, 외부 발송, 배포, main 변경 금지. 인증 비밀, 전체 환경변수, 토큰, 고객 레코드를 GitHub나 채팅에 게시하지 않는다. 로컬 증거는 보호된 경로에만 보관하고 GitHub에는 비밀 제거 요약만.

## 완료 산출물
SOLQ_COMMAND/REPORTS/SOLQ-PORTAL-DEV-06-ENVIRONMENT-EVIDENCE.md
SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-06.json (기존 docs/solq-ack-receipts-20261121 공동 장부)
G1 환경/G2 네트워크/G3 ACL/G4 Auth·API·Storage/G5 복원 대상에 대해 PASS/BLOCKED 및 증거 범위. 실측 없는 PASS 금지. 추가 비용 0원, 운영 NO-GO.
