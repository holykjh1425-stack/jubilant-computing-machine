# SOLQ-PORTAL-DEV-04 Windows 격리 및 복구 관문

**READ_ONLY_AUDIT_COMPLETED · INTEGRATION_BLOCKED · 실행·운영 NO-GO**

2026-11-22 KST. Windows 관측 11:54:50–11:56:39. 기존 독립 통합 환경 존재 **미입증**. 사전 기준점·독립 복원 가능성 **미입증**. DB 시작·정지·접속·SQL, 백업·복원, 설치·배포 0건. 비용 0원.

지시서 고정 커밋 `c5e84aa0639410627037ea58755bd2dc5668c90c` 및 SHA-256 `BC3B9FC8FC6BC54F3DCBA379D5D5151B40A2CC2570A2CA1816576F2B0F460A38`. DEV-03 보고서·완료보고의 로컬과 원격 바이트를 대조했고, 로컬 증거 명세 해시도 일치했다. DEV-01 11개와 DEV-02 8개는 기존 검증값과 이번 작업 브랜치의 Git blob 19개를 대조했다. 기존 시험과 원본 파일 해시 계산은 반복하지 않았다. [DEV-04 지시서](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/c5e84aa0639410627037ea58755bd2dc5668c90c/SOLQ_COMMAND/PORTAL_DEV_04_TASK.md) · [DEV-03 보고서](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/cdbdfc725cd3b95c1fa6b4727f8432d42ae49c36/SOLQ_COMMAND/REPORTS/SOLQ-PORTAL-DEV-03-WINDOWS-ISOLATION.md)

## 승인 관문

| 관문 | 판정 | 근거와 차단 |
| --- | --- | --- |
| G1 환경 식별 | **BLOCKED** | P1 합성 데이터 디렉터리와 별도 설치 경로의 PostgreSQL 17.11 바이너리는 확인. P1 인스턴스는 이번에 미실행으로 관측. 독립 통합 인스턴스의 서비스·실행 토큰·현재 클러스터 ID 미입증. |
| G2 로컬 네트워크 | **BLOCKED** | P1 HBA의 TCP 규칙 4개 모두 루프백 SCRAM. 과거 Docker 구성에는 와일드카드 게시와 비내부 브리지 기록이 있음. 현재 바인딩·포트 프록시·외부 송수신 제한 미확인. |
| G3 합성 데이터·ACL | **BLOCKED** | P1 데이터 소유자가 현재 작업 사용자이고 ACL 상속이 활성. 새 통합 대상의 전용 계정 유효 권한·별도 데이터/로그/객체 경로 미입증. T01·Approval A 보호 경로는 접근 거부. |
| G4 Auth·PostgREST·RLS·Storage | **BLOCKED** | 기존 Docker 저장 설정의 Auth·PostgREST 버전은 확인. Windows 네이티브 실행 파일, 대상 연결, 합성 키·역할, 비공개 버킷과 Storage 백엔드는 미확인. |
| G5 사전 백업·독립 복원 | **BLOCKED** | 보존 패키지의 백업·복원 도구 17.11과 SHA-256 확인. 실제 기준점·별도 복원 대상·역할/객체 복구 증거 없음. 확인한 WFW 파일은 방화벽 기준선. |

### 후보별 확인 범위

| 후보 | 확인 | 남은 확인과 판정 |
| --- | --- | --- |
| Windows P1 합성 클러스터 | 보존 `test-data`의 PG_VERSION 17, 과거 17.11 및 클러스터 ID 기록, 현재 `postmaster.pid` 없음, 가시 PostgreSQL 프로세스 0개. 표준 설치 경로에서 별도 17.11 PostgreSQL 실행 파일을 발견했고 보존본과 동일 SHA-256 `F5DBFD059F8088B9511A02FC014E659369996FC7D3E88E47658B1CFA2FBB02D2`. | P1은 미실행으로 관측했으며 현재 클러스터 ID 및 실행 계정은 미확인. 실행 파일 해시가 같아도 경로별 정책과 실제 데이터 연결은 따로 검증해야 한다. P1의 두 설정에서 명시적인 포트·리스닝 재정의는 확인되지 않았다. 데이터 ACL은 상속 활성이고 소유자는 현재 작업 사용자였다. 전용 시험 계정의 유효 권한, 실제 로그 경로, 재사용 승인 미입증. |
| 은퇴한 T01 및 재시험 | 과거 승인된 네 실행 파일·전용 계정·루프백 SCRAM PASS를 참조. | 보호된 data·log, T01 명세, Approval A 결과 메타데이터 접근 거부. 기존 T01 인스턴스와 증거는 보존하고 새 시험 대상으로 사용하지 않는다. |
| 레거시 로컬 Docker 설정 | 이전 저장 설정에 Auth v2.197.0과 PostgREST v16.5가 Windows P1과 다른 PostgreSQL 클러스터를 가리킨 기록이 있다. 저장 네트워크는 격리되지 않은 브리지였고 와일드카드 게시 기록이 있다. | 이번에는 Docker·WSL·가상 디스크를 열거나 제어하지 않았다. 레거시 설정은 현행 런타임, 합성 자격, 외부 송신 격리, Storage 파일의 증거로 사용할 수 없다. |

### 조회 및 권한

| 이번 읽기 전용 조회 | 결과 | 후속 증거와 필요한 권한 |
| --- | --- | --- |
| `sc.exe query type= service state= all` 및 특정 표준 서비스명 조회 | 열거 5 접근 거부. 특정 이름은 1060 미등록. 다른 이름의 서비스 존재와 실행 계정은 미확인. | 허가받은 로컬 관리자 또는 서비스 조회 권한 보유자가 `Get-CimInstance Win32_Service`로만 후보를 찾고, 합성 후보로 확인된 이름에 `sc.exe qc <후보>`를 제한. 서비스 사용자 SID·실행 경로·PID·데이터 경로의 연결만 보고하고 자격정보·전체 실행 인수는 공유하지 않는다. |
| `schtasks.exe /query`와 지정 복구 작업명 조회 | 종료 코드 1, 확인 불가. | Task Scheduler 읽기 권한 보유자가 `Get-ScheduledTask`로 후보의 정확한 경로·사용자·동작을 대조. 예약 등록 및 실행은 승인 대상에서 제외. W04 FAIL, W05·W09 BLOCKED를 유지한다. |
| `Get-Process`, `Get-Acl`, P1 설정의 필드 및 HBA 범위 조회 | 실행 계정 토큰 미확인. HBA TCP 규칙은 4개 모두 루프백 SCRAM. | 지정된 표준 사용자 SID와 실제 프로세스 소유 SID, 허가된 범위의 유효 ACL, 포트와 실제 로그 경로 확인. 서비스 보안 조회 및 보호 경로 검토는 해당 권한자가 수행. |
| `netsh interface portproxy show all` | 종료 코드 1. 포트 프록시 부재 판정 불가. | 권한 있는 담당자가 `Get-NetTCPConnection`, 포트 프록시, IPv4·IPv6 동적/제외 범위, NIC/라우팅과 `Get-NetFirewallRule -PolicyStore ActiveStore` 및 필터로 서비스별 실행 경로와 아웃바운드 제한을 대조. 기존 규칙 변경 없이 증명할 수 없으면 중단. |
| `Get-Item`, `Get-Command -CommandType Application`, `Get-FileHash` | 지정 위치와 PATH에서 네이티브 Auth·PostgREST·Storage 실행 파일 확인 불가. 대상이 지정되지 않아 설치 필요 여부와 비용 미확인. | 이미 존재하는 구성요소의 버전·해시·설치/서비스·데이터 연결·합성 키 출처를 로컬에서 입증할 권한이 필요하다. 키와 토큰 값은 수집하지 않는다. |

공개 보고서는 요약 증거만 포함한다. 조사 명령·절대 경로·오류·UTC는 Windows 내부 `SOLQ-PORTAL-DEV-04-LOCAL-EVIDENCE.json`에 기록했다. SHA-256 `F27ACD64DA06C3701F119F0189B865E819FCE8A88DC4FE89A5E43806DEB59416`. 이전 Approval A 및 P0-03 14/14, T01 명세 17개 증거는 재사용했다. T01 감사 명세 SHA-256 `C801868E372648818100CF3B30D5054B9F1487815336408B044DEC51134E6534`.

## 사전 기준점과 독립 복원 설계

| 백업 범위 | 보관 계획 | 독립 복원 판정 |
| --- | --- | --- |
| 합성 PostgreSQL DB | 승인된 원본 한 곳의 커스텀 덤프, UTC·출처 클러스터 ID·도구 해시·파일 크기·SHA-256 기록. 별도 암호화된 보호 경로와 RunId 지정. DB·객체의 쓰기를 같은 구간에서 정지하거나 승인받은 일관된 시점을 기록한다. | 원본과 다른 확인된 복원 클러스터·경로·포트에 복원. 스키마·시퀀스·합성 행 수·동의 체크섬·접수번호·제약조건·정책·권한을 비교하고 시험 후 재접속 또는 재기동 검증은 별도로 승인한다. |
| 역할·ACL·설정 | 합성 역할·소유자 매핑, 접속 범위, 파일 ACL, 설정 해시와 비밀을 제거한 허용 목록. 공유 전역 역할 및 자격정보 추출 제외. 최소 복원 역할과 원본 읽기 역할 분리. | 원본 역할명과 일치할 필요가 있는 의존성만 승인된 합성 역할로 매핑. 서버·HBA·Storage 설정의 대상과 허용 목록을 비교하고 고객 A/B·관리자·익명의 읽기/쓰기 허용·거부 확인. |
| 비공개 Storage | 전용 버킷의 합성 객체와 메타데이터에 한정. 객체 키·길이·SHA-256과 DB 참조 간 일관성 기록. SQL 백업과 별도의 승인된 로컬 적재 경로 필요. | 객체 스토어와 DB를 같은 논리 시점으로 복원. 객체·메타데이터 일치, 원본 간섭 0건, 다른 소유자·익명 접근 차단 확인. |
| T01 및 기존 자산 | 원본과 별도 경로. 보호된 T01·P1 원본·기존 백업 경로를 덮어쓰지 않는다. | 이후 승인받은 시험 대상만 정상 종료, 리스너·PID·잠금과 서비스·방화벽 전후 비교. 식별 또는 무결성 실패 시 정리 중단 및 증거 보존. |

확인 가능한 기존 파일은 방화벽 WFW 기준선 487,424바이트, SHA-256 `AF47D58984C1961B1C212020AD2F8D93E3922A78A5E91ABBE71447F4993E18A7`이다. 실제 합성 DB 백업과 독립 복원 영수증은 확보되지 않았다. 예정 보관 경로·크기·내용 해시·복구 지점은 대상 승인 후 확정한다. 운영 전체 백업·복원 및 RPO/RTO 상태는 기존 BLOCKED를 유지한다.

| 보존 패키지 도구 | 파일 SHA-256 |
| --- | --- |
| `pg_dump.exe` 17.11 | `EAA2D00935E0DD55A6AD7AA2F106D013DCB4E793B7E7D2C6DF64BF5B60FBDCD7` |
| `pg_restore.exe` 17.11 | `B91271BD574183DADD17B7DC996DD793805DE3EAB676E7F9991A067360EDF4CE` |
| `pg_dumpall.exe` 17.11 | `7405BB55CEF85B5F5FCB891C1F762D91F5995F013D470E6C1CB6E6D13DDD3FA7` |
| `createdb.exe` 17.11 | `B0FA5901C3E26E858C8D5882A78B71FA4AFC4D38CED45781F13F610717CB03E2` |
| `pg_controldata.exe` 17.11 | `775217422E6309EF24069204F70EEBFBF4BF896F27F54D0AE6BF89DDB5D381E7` |

이 도구들은 승인된 T01 실행 디렉터리에 없었다. 이후 실제 사용 전에 해시 고정과 각 도구의 실행 경로·네트워크 제약 검증이 필요하다. 전역 역할 덤프는 제안 범위에서 제외한다.

## 별도 승인안 및 명령 초안

아래 변수에는 검증한 인스턴스·계정·절대 경로·루프백 포트만 넣는다. 아직 승인된 원본·복원 대상, 실행 토큰과 포트가 없어 변수값은 미정이다. 실행안은 단계별로 다시 승인받는다. 유료 리소스·설치가 필요하거나 기존 환경만으로 분리할 수 없으면 0원 전제가 깨지므로 중단한다.

| 단계 | 별도 승인 범위 | 예상 쓰기 | 중단·원복 |
| --- | --- | --- | --- |
| A. 인스턴스 식별 | 기존 비운영 원본과 기존 별도 복원 후보 각 1개. 필요한 관리자 읽기 증거와 실행 계정 SID·ACL·포트·경로·방화벽 확보. 명령 예시는 위 조회 표를 사용. | DB·시스템 0. 비밀을 제거한 증거만 보호 경로에 기록. | 운영·고객 자산과 겹치거나 런타임, 경계, 경로가 미입증이면 B로 진행 금지. |
| B. 사전 백업 및 복원 | B1은 식별된 원본의 합성 데이터 읽기와 보호 보관 경로 쓰기. B2는 검증된 기존 독립 복원 인스턴스의 지정 빈 합성 DB에 복원. 각각 지정된 최소 백업 읽기 역할과 복원 역할을 사용. 백업 읽기 역할이 RLS 때문에 일부 데이터만 읽으면 중단. | B1 보호 보관소의 새 덤프 및 매니페스트. B2 지정 복원 DB와 전용 합성 객체 저장소. | `pg_restore --list`로 승인된 객체·역할 의존성을 대조. 테이블스페이스·경로·권한 불일치, 외부 연결, 정합성·여유공간 실패 시 중단. 전후 상태를 기록하고 원본은 보존. |
| C. 합성 PostgreSQL 접수·동의·RLS | B 복원 검증 이후 지정 합성 DB에서만 후보 SQL과 합성 데이터를 사용. 전용 비로그인 RPC 역할, Auth 헬퍼·Storage 카탈로그 선행 조건을 확인. | 후보 스키마 및 접수·동의·상태·테스트 행에 한정. | 해시 불일치, 합성 표식 부재, 직접 테이블/구 경로 우회, 권한 차이, 중복/원자성 실패 시 차단. REVIEW_ONLY는 자동 원복, 지속형 파생본 및 정리 SQL은 각각 승인과 새 해시 필요. |
| D. Auth·PostgREST·Storage 통합 | B/C 판정 이후 같은 독립 대상의 이미 존재하는 합성 Auth·API·스토어 구성만 허용. 익명·A/B·관리자, 세션 만료·회수, 소유자 분리, 비공개 파일 및 승인 관문. | 새 합성 사용자·세션·요청·객체·감사 로그만 허용. | 운영 발급처·SMTP·웹훅·외부 리스너·권한 오류가 감지되면 중단. 확인된 시험 인스턴스만 정상 종료하고 테스트 범위의 원복 승인 적용. 기존 서비스·방화벽 무변경 확인. |

```powershell
# B1–B2 승인 후의 초안. 현재 실행 금지. 역할과 포트는 A에서 고정한다.
& $pgDump --host=127.0.0.1 --port=$sourcePort --username=$backupRole --dbname=$sourceDb --format=custom --no-publications --no-subscriptions --file=$newDump
& $pgRestore --list $newDump
& $pgRestore --host=127.0.0.1 --port=$restorePort --username=$restoreRole --dbname=$emptyRestoreDb --single-transaction --exit-on-error --no-owner --no-tablespaces $newDump
# C 검토 롤백 시험 초안. 실제 적용본과 후속 합성 시험은 별도의 승인 해시가 필요하다.
& $psql --no-psqlrc --host=127.0.0.1 --port=$approvedTestPort --username=$migrationRole --dbname=$syntheticDb -v ON_ERROR_STOP=1 -c 'SET solq.dev02_scope TO ''synthetic-only''' --file=$reviewSql
```

위 초안의 각 명령은 독립 종료 코드와 증거를 확인한 후 다음 단계로 진행한다. 네이티브 자격 프롬프트만 사용하고 실행 인수·환경값·보고서에 비밀을 삽입하지 않는다. D의 시작·정지·호출 명령은 설치 경로와 확인된 포트를 A에서 고정한 뒤 제출한다. 현 단계에서 실행 가능한 승인 명령은 없다.

검토 SQL `01_schema.REVIEW_ONLY.sql` SHA-256 `B9C7B6305971374E609A16B2A744999AF8C42786A3D3325DEA0701DE681642B4`. `02_rollback.REVIEW_ONLY.sql` SHA-256 `B6ED473FCE9EA26DE6FEE6F58E583523409B90F0E9D0CABFDB8A3EC9ACDBB909`. 두 보존 SQL은 미적용 상태이며 끝에 `ROLLBACK`이 있다. 원복 스크립트는 대상 표식·응용 스키마 및 버킷의 공백을 검증하며 보존 데이터가 있으면 중단한다. [DEV-02 시험 계획](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/8c5ea9e2bab2daed8433077519ca28bd1ed9ea8f/candidates/portal-db-auth-rls-20261121/TEST-PLAN.md)

실제 환경 변경 0건. 실행 권한 없음. 운영 NO-GO 유지.
