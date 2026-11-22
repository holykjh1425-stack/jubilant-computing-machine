# SOLQ-PORTAL-DEV-03 Windows 격리 승인 관문

**읽기 전용 조사 완료 · 실제 통합시험 BLOCKED · 실행 및 운영 NO-GO**

2026-11-22 KST. Windows 관측 11:19:33–11:20:46. PostgreSQL·Auth·PostgREST·Storage 시작·정지·접속 0건, SQL 실행 0건, 운영 Supabase 및 고객 데이터 접근 0건, 비용 0원.

지시서 기준 커밋 `c10606513fdbf5b8f5b20624d9c6ce53e5aaf1b3`, SHA-256 `B066E89ECEFA0A4405A623B3DA1D72936F0F6AD061E77BDB023D015D31BEF791`. DEV-02 코드 기준 `8c5ea9e2bab2daed8433077519ca28bd1ed9ea8f` 대비 지시서만 추가된 브랜치에서 조사했다. [고정 지시서](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/c10606513fdbf5b8f5b20624d9c6ce53e5aaf1b3/SOLQ_COMMAND/PORTAL_DEV_03_TASK.md)

## 승인 관문

| 관문 | 판정 | 확인 범위 | 차단 사유 |
| --- | --- | --- | --- |
| G1 환경 식별 | **BLOCKED** | PostgreSQL 17.11 실행 파일 4개와 보존 패키지 명세 일치 | 현행 비운영 인스턴스의 서비스 등록·실행 계정·데이터 원본·운영으로부터의 독립성 미입증 |
| G2 네트워크 | **BLOCKED** | T01 역사적 루프백 PASS 및 P0-03 14/14 PASS | 이번 OS 조회에서 TCP 행 0개, 정책·라우팅 조회 불가. 실제 바인딩·포트 충돌·구성요소별 외부 송수신 차단 미입증 |
| G3 데이터와 권한 | **BLOCKED** | T01 전용 계정 SID 매핑과 과거 합성 경로 확인 | 보호 data/log 및 감사 원본 열람 불가, 신규 전용 경로·유효 토큰·최소 ACL·운영 공유 경로 부재 미입증 |
| G4 Auth·PostgREST·RLS·Storage | **BLOCKED** | 로컬 설정의 API/Auth/Storage 활성 플래그와 검토 SQL·역할 매트릭스 확인 | 설치·버전·실행·유효 DB 역할·비공개 객체 저장소·RLS 적용과 A/B/관리자/익명 시험 미입증 |
| G5 원복과 보존 | **BLOCKED** | 두 REVIEW_ONLY SQL과 기존 3개 검토 SQL의 체크섬 일치 | 실제 대상의 사전 기준점, 검증된 격리 복원, 원복 권한·정리 전제 미입증. 운영 백업·복원·RPO/RTO 별도 BLOCKED |
| G6 별도 실행 승인 | **NO-GO** | DEV-03 읽기 전용 심사 완료 | 정확한 독립 대상, 명령, 쓰기·종료·비용 범위 승인 없음 |

## 기존 증거와 이번 관측

- **소스 무결성 PASS.** DEV-01 11개와 DEV-02 8개의 로컬 SHA-256 및 원격 Git blob이 승인 명세와 일치한다. DEV-02 로컬·원격 보고서는 바이트가 일치한다. SHA-256 `F24769FF6365BE17D72BBECE32D14B24EC9ECCAD14DA35DE3977A034EE08FBC1`. TEST-PLAN 로컬·원격 SHA-256 `9B1AFF878EB49226867C439CE191B255DEC56B05E7769C571D14BB6C144677DD`. DEV-02 정적 4 PASS 및 합성 14 PASS를 재사용했다. [DEV-02 보고서](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/780c04daa4446ea380666e4d1fe37cf7a8503a7d/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-02.json) · [검증 계획](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/8c5ea9e2bab2daed8433077519ca28bd1ed9ea8f/candidates/portal-db-auth-rls-20261121/TEST-PLAN.md)
- **파일·계정.** 보존 EDB Windows x64 17.11-5 패키지의 네 실행 파일은 모두 PE 17.11이며 SHA-256이 기준과 일치한다. 승인 런타임의 bin·lib·share와 `postgres.bki`, 두 설정 샘플, `plpgsql.dll`의 존재를 확인했다. 동반 1,507개 파일 검증은 기존 Approval A 기록을 재사용했다. 전용 Windows 계정 이름을 SID로 변환한 결과는 Approval A의 SID와 일치했다. SAM 상세 조회 및 이번 통합 대상에서의 실제 토큰·유효 권한은 미확인이다. 런타임 디렉터리에서 전용 SID에 직접 부여된 ACE는 확인되지 않았으며 그룹·상속을 포함한 권한은 판정하지 않았다.

| 실행 파일 | 확인 SHA-256 |
| --- | --- |
| `postgres.exe` | `F5DBFD059F8088B9511A02FC014E659369996FC7D3E88E47658B1CFA2FBB02D2` |
| `initdb.exe` | `D385519A50D2CD5E143E86C2C10ACFE0D44D3039D714C8211B804011BCA2409F` |
| `pg_ctl.exe` | `9885AC53AF9D67C76C1DDDE87C19E6B15539D7C482BCA70CD5EAD5DAD0B7CE3C` |
| `psql.exe` | `C290C7F0A3335F290F8C18011A1E5AFA03EE3CDD628697A5F3E767E5F1D3D10D` |

- **과거 T01과 방화벽.** T01은 승인된 PostgreSQL 합성 인스턴스의 IPv4 루프백 및 SCRAM 검증 PASS다. 17개를 검증한 기존 감사 명세 SHA-256은 `C801868E372648818100CF3B30D5054B9F1487815336408B044DEC51134E6534`이다. 이번에는 보호 폴더 접근이 거부돼 명세를 다시 열지 않았다. P0-03의 14/14 PASS 요약 SHA-256은 `9E16971C04547E5E8881457C7F9A8044673AE919249025EEE86451D368037142`이다. 기존 프로그램별 방화벽 증거는 PostgreSQL 실행 파일 4개 범위다. Auth·API·Storage·자식 프로세스와 T02–T05는 별도 미검증이다.
- **현행 OS 경계.** `netstat -ano` 및 IPv4·IPv6 TCP별 조회는 종료 코드 0이고 TCP 행이 0개였다. 지정 이름의 프로세스도 현재 가시 범위에서 발견하지 못했다. 서비스 열거, 서비스 등록부, 경로·방화벽 CIM 조회는 입증에 필요한 출력을 얻지 못했다. 미가시성이나 스냅샷 한계 때문에 리스너 부재, 포트 미점유, 비운영 인스턴스 부재를 확정하지 않았다.
- **구성·저장소.** 기존 로컬 TOML에서 DB 메이저 17과 API, Auth, Storage 활성값을 확인했다. 가입 허용, Edge Runtime, 분석 관련 프로필도 활성값이 있어 실제 시험에서는 발송·외부 연동·불필요한 프로세스를 시작하지 않는 구성과 경계 증거가 필요하다. 설정에 대응하는 PostgREST·Auth·Storage 실행 파일은 조회한 설치 후보 위치와 PATH에서 발견하지 못했다. Storage 후보 디렉터리와 두 운영 연결 마커도 검사한 위치에서 확인되지 않았다. 운영 연결 부재, 실제 미설치, 독립 저장소 여부는 미확인이다. 보호된 기존 합성 data/log·감사 경로의 열람은 거부됐다. 기존 T01 데이터는 보존 대상으로 취급한다.
- **Windows 자동화.** 기존 인계 기록상 W04 FAIL, W05·W09 BLOCKED, S4U 등록 FAIL 유지. DEV-03은 수동 읽기 전용 조사여서 예약 작업·큐·자동 실행과 실행 경로를 공유하지 않았다. 실제 통합 시점의 서비스·포트 충돌은 새로 확인해야 한다. W04·W05·W09와 T02–T05는 후속 승인에서 제외한다.

### 확인에 사용한 명령

| 확인 | 읽기 전용 명령 | 결과 |
| --- | --- | --- |
| 파일·경로·권한 | `Get-Item -LiteralPath`, `Get-ChildItem -LiteralPath`, `Get-FileHash -Algorithm SHA256`, `Get-Acl -LiteralPath`, 계정 이름의 SID 변환 | 해시와 승인 경로 메타데이터 확인. 보호 data/log·감사 원본 ACL 열람 불가 |
| 설치·서비스·설정 | `Get-Command -CommandType Application`, `Get-Process -Name`, `Get-Service`, `Get-CimInstance Win32_Service`, 서비스 등록부 이름 열거, 제한된 TOML 키 읽기 | 버전 메타데이터·설정 플래그 확인. 서비스·유효 실행 구성 미확인. 비밀 값 출력·기록 0건 |
| 네트워크 | `netstat -ano`, `netstat -ano -p tcp`, `netstat -ano -p tcpv6`, `Get-NetRoute`, `Get-NetFirewallRule -PolicyStore` | 가시 TCP 행 0개. 현재 정책 저장소·라우팅 확인 불가. 연결 시험 0건 |

로컬 증거 `SOLQ-PORTAL-DEV-03-LOCAL-EVIDENCE.json`, SHA-256 `26FD3E61930595FACF28C0CAB2B90711555C38AADA411430B54E87C6324C03D1`. 절대 경로·권한 오류·관측 UTC·기존 명세 참조는 이 Windows 내부 파일에 기록했다. 패키지 명세 SHA-256 `CF6FD0EAFF855B92BAB3419FA8B102DA034415EB27717C0948E3FDA8D2507A94`.

## 실행 대상 SQL과 기대 결과

| 검토 파일과 SHA-256 | 선행 구성·최소 권한 | 승인 후 기대 결과 및 안전 조건 |
| --- | --- | --- |
| `review/01_schema.REVIEW_ONLY.sql` · `B9C7B6305971374E609A16B2A744999AF8C42786A3D3325DEA0701DE681642B4` | PostgreSQL 17.11 합성 DB 식별·표식, 기존 Auth 함수/테이블과 Storage 정책 대상, 해당 DB와 후보 객체 범위의 비슈퍼유저 마이그레이션 권한, 전용 비로그인 RPC 역할 및 역할 전환 권한 | 새 접수·동의·상태 원자성, 권한 분리, 비공개 버킷 정책. 보존된 원본은 `ROLLBACK`으로 끝나며 실제 지속 시험은 별도 승인된 파생본·해시 필요 |
| `review/02_rollback.REVIEW_ONLY.sql` · `B6ED473FCE9EA26DE6FEE6F58E583523409B90F0E9D0CABFDB8A3EC9ACDBB909` | 동일 합성 대상, 정지된 쓰기, 해당 테이블 소유/잠금 및 정책 제거 권한, 보호된 시험 증거 확보와 전용 객체 공백 확인 | 이름이 확인된 객체만 제거하는 설계 검토. 데이터 및 버킷 객체가 남으면 중단. 보존본은 `ROLLBACK`으로 끝나며 실제 정리 적용은 별도 승인 필요 |

이전 접수 보완의 준비·활성화·비활성화 SQL 3개의 SHA-256도 이전 명세와 일치했다. 이 3개는 기존 계약 검토 증거로 보존한다. DEV-03 실행 범위에는 포함하지 않는다.

## 최소 후속 승인 및 시험 범위

1. 기존 비운영 설치가 실제 있다면 그 1곳만 지정한다. 소유자·서비스 계정·실행 파일·PID/리스너·설치 버전·인증 발급처·전용 데이터 및 객체 경로·권한·외부 송수신 차단을 읽기 전용으로 증명한다. 보호된 정보는 권한 있는 담당자가 값 대신 판정과 해시를 제공한다. Auth·API·Storage 설치가 확인되지 않으면 통합을 계속 BLOCKED로 둔다. 현재 설치 필요 여부와 비용은 미확인이다.
2. 그 대상의 데이터·객체·구성 기준점과 격리 복원 근거를 확보한다. 승인받을 정확한 실행 명령, 실행 계정, 해시 고정 SQL 파생본, 쓰기 대상, 예상 소요 시간·비용 0원 조건, 중단·정상 종료·증거 보존 범위를 명시한다. 원래 T01 경로 및 운영·고객 저장소와 겹치면 중단한다.
3. 별도 승인 후 해당 환경에서만 합성 고객 A/B·관리자·익명과 권한이 제한된 운영자 역할을 검증한다. DB 트랜잭션·접수·동의·중복·응답 유실, Auth 만료·회수, PostgREST·RLS와 비공개 Storage, 견적·모의 입금·제작 승인 관문, 복구·원복 전후 증거를 수집한다. 실제 제작·결제·이메일·API 외부 발송은 제외한다.
4. 예상 외 PID·외부 바인딩·외부 연동·생성/권한 충돌·서비스 변화가 발견되면 추가 연결과 쓰기를 중단한다. 승인된 시험 인스턴스만 식별해 정상 종료하고 시험 상태와 원본 무결성을 기록한다. 기존 방화벽·예약 작업·서비스·파일에는 원복을 시도하지 않는다.

실제 적용 0건. 운영 NO-GO 유지.
