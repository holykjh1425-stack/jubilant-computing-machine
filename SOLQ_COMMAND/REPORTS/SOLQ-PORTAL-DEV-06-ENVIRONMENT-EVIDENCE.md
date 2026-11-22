# SOLQ-PORTAL-DEV-06 Windows 독립 환경 증거

**읽기 전용 검토 완료 · 단계 A BLOCKED · INTEGRATION_BLOCKED · 운영 NO-GO · executionAuthority=false**

2026-11-22 14:25:50 KST. 대상 Windows 로컬 세션에서 관리자 역할이 활성화되지 않았음을 확인했다. 기존 Runner 토큰도 사용하지 않았다. 권한이 필요한 서비스·포트·ACL·방화벽 조회는 반복하지 않았다. 승인된 별도 관리자 조회 결과가 제출되지 않아 새로운 런타임 판정은 보류한다.

고정 지시서 `1c7cc420d8798a34663ef4acc11b3cfeec64251f`, SHA-256 `A450F454CE7C15F94D31854C152812BDDAC194EE2DE821440D1E3C687A10A7D3`. DEV-05 대비 지시서 한 파일만 추가된 브랜치를 확인했다. DEV-03~05 영수증은 고정 원격 파일과 로컬 바이트가 일치하고, 현재 브랜치의 DEV-01 11개와 DEV-02 8개는 DEV-05 보존 Git blob과 일치한다. 기존 테스트, 백업 지문 검사, T01의 보호 폴더 조회는 반복하지 않았다. [지시서](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/1c7cc420d8798a34663ef4acc11b3cfeec64251f/SOLQ_COMMAND/PORTAL_DEV_06_TASK.md)

| 재사용 증거 | SHA-256 |
| --- | --- |
| [DEV-03 영수증](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/0135683e971dec09636f7836cc848fa7585312a4/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-03.json) | `02557894116127D31342DA36D7F7B48369D49013B5A937C87DA171BCDFA3803E` |
| [DEV-04 영수증](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4657c758d886edf2ee14b3d09c011de3c7c350ba/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-04.json) | `F684FDDF4DA8461A0A960683CC6B669CB1CD9086C6C91E9AD23383EF26A54F1D` |
| [DEV-05 영수증](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e8624e70282a8500d77e93b333b81d50abf0ece/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-05.json) | `731B6F029FF3468857C4E64E8F1786AA93C0755AE26C64DC1E8B8CEBA6EDE226` |
| DEV-05 로컬 증거 | `DA934A2612B8866682B8EE189A7108A25AEDBC4E4AEF0BB60D8B331048DDD8B2` |

## 단계 A 판정

| 관문 | 판정 | 확인된 범위 | 남은 증거 |
| --- | --- | --- | --- |
| G1 원본 환경·실행 주체 | **BLOCKED** | 대상 Windows 로컬 세션 확인. P1 기존 실행 메타데이터와 합성 데이터 연결은 DEV-05 증거 재사용. | 실제 기존 서비스·프로세스, 실행 주체 SID·토큰, 실행 파일 해시·데이터 경로·클러스터 ID의 현행 대응. |
| G2 로컬 네트워크 | **BLOCKED** | T01 PostgreSQL 루프백 PASS, P0-03 정책 14/14 PASS와 P1 과거 루프백 기록 재사용. | 현재 리스너 PID의 IPv4·IPv6 실제 바인딩, 프록시와 활성 정책, 구성요소별 외부 송수신 차단. |
| G3 합성 저장소·ACL | **BLOCKED** | P1 소유자와 상속 활성은 이전 범위에서 확인. 기존 보호 T01 경로 접근 거부 재사용. | 원본·복원 data/log/객체의 실제 경계와 전용 런타임 계정의 유효 권한, 그룹 및 쓰기 범위 증거. |
| G4 Auth·PostgREST·Storage | **BLOCKED** | 기존 TOML 및 과거 Docker 저장 설정 증거 재사용. 과거 Docker 클러스터는 P1과 별개. | 현행 기존 실행 파일·서비스·버전·합성 발급처·DB 대상·비공개 객체 저장 위치 및 구성의 실제 연결. |
| G5 기존 별도 복원 대상 | **BLOCKED** | 결과 폴더의 지정 인계 파일명 조회에서 새 증거 0건. 이전 제한 검색은 재사용. | 기존 원본과 다른 검증된 클러스터·데이터 및 객체 경로·계정·포트·복원 권한. 존재 여부 확인 불가. |

기존 네이티브 P1은 원본 검토 후보로 남긴다. T01 종료 인스턴스와 은퇴한 경로, 분리되지 않은 과거 Docker 환경, 운영 Supabase와 고객 원본은 이번 시험 후보에서 제외한다. 현재 분리된 복원 환경의 부재를 확정할 수 없다. 운영 경로와 겹침 여부, 유효 권한, 구성요소의 서비스 소유권을 입증하기 전에는 원본 및 복원 후보를 확정하지 않는다.

## 권한 있는 담당자가 실행할 최소 조회

사용자가 대상 Windows에서 별도로 연 관리자 PowerShell을 사용한다. 이미 승인된 기존 합성 후보만 조회한다. 아래 명령은 담당자용이며 이번 Codex 세션에서 실행한 결과는 아니다. 승인 범위 밖이거나 거부된 대상은 중단한 뒤 결과 코드만 남긴다. 전체 실행 인수, 구성 파일 내용, SID 원문, 내부 IP·경로, 비밀값은 GitHub나 채팅에 게시하지 않는다. 로컬의 기존 보호 증거 보관소에 승인된 필드만 남기고 외부 공유본에는 후보 별칭과 판정만 사용한다.

먼저 현재 관리자 역할을 확인한다. 예상 출력은 `Administrator=True`다. `False`면 아래 조회를 실행하지 않는다.

```powershell
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($id)
$admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
"Administrator=$admin"
if (-not $admin) { throw '승인된 관리자 창이 필요합니다.' }
```

| 확인 | 승인된 대상에 대한 명령 | 필요한 Windows 권한 및 기록 |
| --- | --- | --- |
| 서비스 등록·PID | `Get-CimInstance Win32_Service -Filter $approvedServiceFilter -Property Name,State,ProcessId,StartName`. 지정된 기존 서비스 이름에 한해 `sc.exe qc <승인된 서비스>`의 결과를 변수에 받아 인수를 출력하지 않은 채 실행 정보만 대조. | SCM 목록/구성 조회 및 해당 CIM 읽기. 정확한 서비스명·계정 대조 결과·PID·정지 여부. 빈 결과와 접근 거부를 분리. |
| 실제 계정·실행 파일 | `Get-Process -Id $approvedProcessId`에서 `Id, Path, StartTime` 확인. 같은 PID의 `Get-CimInstance Win32_Process`에서 `Invoke-CimMethod -MethodName GetOwnerSid` 호출. 승인 파일은 `Get-FileHash -LiteralPath $approvedExecutable -Algorithm SHA256`. | 대상 프로세스 조회와 실행 파일 읽기. 서비스에 기록된 지정 계정과 실제 소유 주체를 대조. PID·시작 시각을 다시 대조하고 전체 인수와 토큰은 출력 금지. 정지 상태라면 런타임 항목 미확인. |
| 포트·프로세스·바인딩 | `Get-NetTCPConnection -State Listen`에서 승인 PID 또는 포트만 필터. `netsh interface portproxy show all` 결과는 변수에 받아 승인 포트와 관련된 행만 로컬에서 대조. | 소켓 및 로컬 포트프록시 읽기. 루프백·와일드카드·다른 인터페이스를 분리. 활성과 미확인을 구분. |
| 활성 방화벽 정책 | `Get-NetFirewallProfile -PolicyStore ActiveStore`, `Get-NetFirewallRule -PolicyStore ActiveStore` 및 해당 앱·주소·포트 필터 조회. | NetSecurity 정책 저장소 읽기. PID가 가리키는 바이너리 경로 및 적용 프로필, 인바운드·아웃바운드 제한, 프록시/포워딩 증거를 대조. 기존 정적 PASS를 현행 정책 PASS로 대체하지 않음. |
| 경로·유효 권한 | 이미 승인된 합성 경로만 `Get-Item -LiteralPath $approvedDirectory -Force`와 `Get-Acl -LiteralPath $approvedDirectory`. 이전 T01 경로 접근은 생략. `whoami /groups`는 현재 토큰 비교가 필요한 경우 로컬에서만 사용. | 상위 폴더 목록·속성 및 대상 READ_CONTROL. 경로별 소유자·상속/명시 ACE·실서비스 계정과 유효 권한을 분리. 링크·리파스 포인트가 있는 후보는 증명 전 제외. 쓰기 시험 금지. |
| 별도 복원 후보 및 구성요소 | 승인된 합성 상위 경로에만 `Get-ChildItem -LiteralPath $approvedIsolationRoot -Directory -Force`. 기존 Attestation·매니페스트의 클러스터 식별자, 합성 전용 경로·포트·SID 대조. Auth/REST/Storage의 승인 서비스와 실제 파일을 같은 읽기 절차로 확인. | 메타데이터 범위의 폴더 목록·바이너리 읽기. 기존 운영/고객/T01 경로와 분리된 고유 ID·경로·계정·포트가 확인돼야 함. 읽을 수 없는 경우 BLOCKED. |

조회가 비어 있으면 현재 권한과 조회 범위를 기록한다. 직접 접근 가능한 대상에서만 서비스·프로세스·리스너·계정·실행 파일·데이터 디렉터리를 연결하며, 한 후보를 원본과 복원에 중복 지정하지 않는다. 클러스터 ID는 권한 있는 담당자가 보존 매니페스트나 기존 승인된 로컬 증거에서 제출해야 한다. 새로운 데이터 조회, 기동 또는 접속으로 확인하지 않는다.

## 실제 시험 승인 조건

**지금 요청할 수 있는 범위는 단계 A의 지정된 읽기 전용 증거 제출이다.** 다음 항목이 확인된 뒤에만 정확한 B1 승인서를 작성한다.

1. 기존 합성 원본과 기존 복원 후보를 각각 고정한다. 호스트·클러스터 ID·실행 계정·실행 파일 절대 경로와 지문·데이터/로그/객체 경로·포트까지 대조한다. 복원 후보는 원본과 계정·경로·포트·클러스터가 달라야 한다.
2. G1~G5를 각각 합격 판정할 읽기 증거를 확보한다. 운영·고객 원본·T01과 무관한 합성 출처, 부여한 권한, 로컬 루프백 및 외부 전송 차단, Auth/API/Storage 구성요소의 실제 설치·대상 연결을 검증한다. 증거 부족 시 A를 BLOCKED로 유지한다.
3. B1 승인서는 승인된 원본 ID·경로·실행 계정·루프백 포트, 합성 백업 범위, 기존 보호 암호화 저장소, 명령과 유틸리티 해시, 예상 쓰기·용량·비용 0원 및 중단 기준을 고정한다. 미확정 항목은 TBD로 표시하고 승인 요청이나 실행을 보류한다.
4. B2는 별도 빈 복원 대상과 복구 증거, C는 해시 고정 SQL/RLS 및 원복, D는 로컬 합성 Auth·PostgREST·Storage 및 역할별 테스트, E는 출시 심사를 각각 별도 승인받는다. 선행 PASS가 없으면 진행하지 않는다. 대상 충돌이나 예상 밖 외부 통신·쓰기·비용이 발견되면 중단하고 증거를 보존한다.

DB·서비스 기동/정지·접속·SQL·실제 백업·복원·Docker/WSL 조작·설치·배포·고객 데이터 접근 0건. 기존 소스·데이터·증거 및 보안 설정 변경 0건. 추가 비용 0원.
