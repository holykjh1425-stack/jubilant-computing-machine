# SOLQ-PORTAL-DEV-05 운영 준비 검증

**읽기 전용 조사 완료 · INTEGRATION_BLOCKED · 운영 NO-GO · executionAuthority=false**

2026-11-22 KST · Windows 신규 관측 14:14:58–14:15:57. DB·서비스 기동/정지·접속·SQL·실제 백업·복원·설치·배포·공식 사이트 실요청·고객 자료 접근 0건. 추가 비용 0원.

지시서 기준 `1991281b5e0d46bb1ed1ae97d522884feab0a667`, SHA-256 `FFAAF535D6B81143BF99379A55CE4AA01877A5AFD3E332A5F2827A4ABD978B87`. DEV-04 대비 지시서 1건만 추가된 기준에서 시작했다. DEV-03·04 및 P0-01·02 완료보고의 원격·로컬 바이트를 대조했다. DEV-01 11개와 DEV-02 8개를 DEV-04 보존 Git blob과 대조했고 신규 검증에서 해당 소스·T01·P1·운영 원본을 수정하지 않았다. [지시서](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/1991281b5e0d46bb1ed1ae97d522884feab0a667/SOLQ_COMMAND/PORTAL_DEV_05_TASK.md) · [DEV-03](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/0135683e971dec09636f7836cc848fa7585312a4/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-03.json) · [DEV-04](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4657c758d886edf2ee14b3d09c011de3c7c350ba/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-04.json)

## A. Windows 기존 환경 및 복원 후보

| 관문 | 판정 | 확인 및 차단 |
| --- | --- | --- |
| G1 격리 인스턴스 식별 | **BLOCKED** | 기존 P1 마지막 실행 기록만 연결했다. 현재 서비스·토큰과 별도 복원 클러스터 미입증. |
| G2 네트워크 독립성 | **BLOCKED** | P1의 과거 루프백 실행 근거와 T01 PASS 재사용. 현재 바인딩·포워딩·프로세스별 송수신 제한 미입증. |
| G3 합성 저장소·전용 ACL | **BLOCKED** | P1 과거 합성 data 및 상속 ACL 확인. 전용 주체의 유효 권한, 별도 원본·복원 data/log/객체 위치 미입증. |
| G4 Auth·PostgREST·RLS·Storage | **BLOCKED** | 보존된 Docker 설정과 TOML 플래그만 존재. 현행 지원 런타임, 합성 세션·역할·발급처·비공개 객체 검증 미확보. |
| G5 사전 백업·독립 복원 | **BLOCKED** | 보존된 백업 도구 및 설계만 확인. 실제 백업 ID·범위·암호화·복원 결과·복구 시점과 소요 시간 미확보. |

- **원본 후보.** P1의 보존 `postmaster.opts`에서 마지막 실행 파일이 보존 PostgreSQL 패키지의 실행 파일을 가리키고, 명시된 데이터 경로가 기존 P1 경로와 일치하며, 루프백과 숫자 포트가 지정된 것을 확인했다. SHA-256 `62A0C2E95C3A5C5910C3E402C0AC5F2DFB9CED634058320F07B9F029696B1A6A`. 과거 실행 기록 범위다. DEV-04의 PG17.11 자산·PID 부재·상속 ACL·파일 소유자 확인을 재사용한다. 현재 실행 토큰, 전용 계정 유효 ACL, 로그·객체 저장 경계가 확인된 독립 인스턴스는 미입증이다.
- **별도 복원 대상.** 승인된 기존 격리 상위 경로의 이름·결과 폴더의 인계 문서만 조회했고 지정 복원 후보를 식별하지 못했다. 모든 위치를 열거하지 않았으므로 존재 여부는 확인 불가다. 기존 P1의 경로를 복원 대상으로 중복 지정하지 않고, 은퇴한 T01의 data·log·보호 증거도 제외한다. T01 17개 명세와 P0-03 14/14, Approval A는 기존 증거를 재사용했다.
- **권한과 구성.** 현재 토큰에 활성 관리자 역할이 없고 승인된 T01 Runner 토큰과도 다르다. DEV-04의 서비스 열거 접근 거부, Task Scheduler 및 포트프록시 조회 실패, 보호 T01 경로 접근 거부를 재사용했다. 권한 상승과 동일 실패 조회의 재시도는 생략했다. 이전 Docker는 P1과 별개이고 과거 와일드카드 게시·비내부 브리지 기록이 있다. 네이티브 Auth·PostgREST·Storage의 현행 설치 및 연결 대상은 확인 불가다. 운영 Supabase는 조회하지 않았다.

P1 경로와 제한된 메타데이터, 토큰 조회 관측 시각 및 DEV-03·04 참조는 `SOLQ-PORTAL-DEV-05-LOCAL-EVIDENCE.json`에 로컬 보관했다. SHA-256 `DA934A2612B8866682B8EE189A7108A25AEDBC4E4AEF0BB60D8B331048DDD8B2`.

## B. 공식 신청부터 원본 보존까지

| 단계 | 정적·보존 근거 | 운영 판정 |
| --- | --- | --- |
| 도메인 → 개인정보 안내 → 신청 화면 | 공식 `solqtech.com`의 보존된 Sites v32 기록과 보관 `dist/index.html`에서 `#apply`, 개인정보 안내 링크, 별도 국외 이전 체크박스와 무료 6단계 안내를 확인했다. [Sites 게시 기록](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/be8de8ba6b1275dc96f3c9c2afd3ea03ff1b1b01/ops/consultation/sites-release-20261108/REPORT.md#L7-L27) · [보관 신청 화면](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/be8de8ba6b1275dc96f3c9c2afd3ea03ff1b1b01/ops/consultation/sites-release-20261108/dist/index.html#L30-L42) | **정적 PASS / 운영 BLOCKED.** 현재 도메인의 콘텐츠 또는 전체 배포 파일을 요청하지 않았다. |
| 전송 → 접수번호 | P0-02의 당시 공개 자산 지문·분석은 Sites의 `app.js → api.js → applications 직접 INSERT`와 접수번호 처리로 기록됐다. 해당 GitHub 보관 트리에는 원본 스크립트 3개가 없었다. GitHub `main`의 별도 앱은 `submit_application` RPC와 반환 번호 형식 검증을 사용한다. [GitHub RPC 경로](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e4a2ab06b65c39248b9eba651ac5aab92bd6a28/app.js#L17-L34) | **BLOCKED.** 현행 배포와 동일 저장 계약의 바이트 증거, 저장 커밋과 성공 응답의 대응, 불명확한 응답 후 안전한 재시도 미검증. |
| 개인정보 안내 → 원장·원본 | 보존 Sites 화면과 main은 필수 체크 두 개를 표시한다. main 제출 소스는 설명 내 고지와 `p_privacy_consent`를 전송한다. main SQL 파일에는 신청 기본키·접수번호 UNIQUE·동의 Boolean·상태가 있다. 독립 고지 원장·불변 원본은 별도 후보 설계에 있다. [동의 화면](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e4a2ab06b65c39248b9eba651ac5aab92bd6a28/index.html#L8-L12) · [기본 스키마](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e4a2ab06b65c39248b9eba651ac5aab92bd6a28/supabase-schema.sql#L3-L21) | **BLOCKED.** 수집·이용 및 국외 이전 동의 각각의 승인 원문 버전·SHA-256·서버 UTC, 불변 원본·업무 상태 분리, 동일 키와 다른 본문 거부의 운영 적용 미검증. |
| 관리자 인증·조회·승인 | main 관리자 UI는 Auth 후 `applications`를 조회하고 상태 갱신을 요청한다. SQL의 관리자 멤버십 RLS가 자료 접근을 제한하는 설계다. 별도 제작 패널은 관리자 자격을 재확인하고 Edge 호출을 한다. P0-02는 공식 자산의 별도 승인 참조를 기록했다. [목록](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e4a2ab06b65c39248b9eba651ac5aab92bd6a28/admin.js#L56-L83) · [로그인](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e4a2ab06b65c39248b9eba651ac5aab92bd6a28/admin.js#L129-L144) · [제작 패널](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e4a2ab06b65c39248b9eba651ac5aab92bd6a28/production-admin.js#L15-L20) | **BLOCKED.** 실제 Auth·RLS·Storage, 현재 사용자가 승인 관리자임을 검증하는 서버 증거, 같은 원본·동의·접수번호의 조회와 제작 승인 흐름 없음. |
| 6단계 계획·가격·유료 실행 관문 | 보존 화면의 100,000원은 기본형 시작 가격 안내다. DEV-01은 100,000원 모의 견적, 30,000원 모의 착수금, 70,000원 잔금 표시 및 6단계 계획을 정의하고, 동일 최신 견적의 고객 동의→관리자 입금 확인→별도 제작 승인을 강제한다. 모형에서 실제 실행은 비활성이다. [DEV-01 모의 승인 경로](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/6bbe674199bf9ddb970350a30e0b7623cae60b86/candidates/portal-integration-20261121/README.md#L21-L30) · [무료 계획 규칙](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/6bbe674199bf9ddb970350a30e0b7623cae60b86/candidates/portal-integration-20261121/vendor/solq-planning.js#L18-L43) | **후보 합성 PASS / 운영 BLOCKED.** 요금·입금·제작 승인 결합이 현행 운영에 연결됐다는 증거 없음. |

재사용 검증은 DEV-01 합성·API 17 PASS와 오프라인 브라우저 6 PASS, DEV-02 정적 4 PASS와 합성 14 PASS다. 고객 A/B·관리자·익명 권한, 원본·동의·번호 연계, 충돌·재시도·응답 유실 및 승인 우회는 실제 독립 세션과 DB에서 재현해야 한다. DEV-02의 SQL 검증은 구조·어휘 범위였다. [P0-01 근거](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/664d6626680c6a9cd0b014a56e255fee77255ec8/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-P0-01.json) · [P0-02 근거](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4657c758d886edf2ee14b3d09c011de3c7c350ba/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-P0-02.json) · [DEV-01 검증](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/c8d8c0134dd6cd139b3ee58be85c0bf1582a1288/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-01.json) · [DEV-02 검증](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/780c04daa4446ea380666e4d1fe37cf7a8503a7d/SOLQ_COMMAND/RECEIPTS/SOLQ-PORTAL-DEV-02.json)

## 운영 차단 장부

| 항목 | 판정 | 심사에 필요한 증거 |
| --- | --- | --- |
| 공식 배포와 접수 원본 | **BLOCKED** | 공개 도메인 ↔ 동일 배포 ID·내용 지문·승인 빌드와 관리자 동일 접수번호를 대조할 증거 부족 |
| 개인정보 안내·독립 동의 | **BLOCKED** | 고지 승인본과 버전·해시·UTC가 포함된 독립 동의 원장, 저장과 원본 무결성 검증 필요 |
| 견적·입금·제작 승인 | **BLOCKED** | DEV-01 모형 PASS. 최신 동일 견적에 대한 고객 동의, 담당자 입금 확인, 별도 승인 및 실행 금지 경계의 통합 검증 필요 |
| Auth 보안·회수·오래된 인입 차단 | **BLOCKED** | 실제 최소권한과 세션 만료·철회, 구 직접 INSERT·RPC·전용 링크 경로 제한, 기존 보안 경고 종결 근거 미확보 |
| 복원·RPO/RTO | **BLOCKED** | DB·Auth·Storage·Edge/설정 범위의 전체 암호화 백업, 동일 ID 복원, 승인 목표와 실측 없음 |
| 회귀·롤백·관측 | **BLOCKED** | 후보 별 합성 PASS 재사용. 실제 DB 회귀, 배포 전후 스모크, 경보 담당·기준과 역전환 증거 미확보 |
| 개인정보 보관·삭제 처리 | **BLOCKED** | 삭제 요청 안내 존재. 본인 확인·보존 예외·최소 수집·삭제 감사 및 복원 후 재노출 방지 미검증 |
| Google Play 등록 | **BLOCKED** | 삭제 안내 페이지 존재. 등록·검토·승인 증거와 앱 실기기·개인정보/데이터 안전 검증 미확보 |
| 운영 실행·배포 | **NO-GO** | G1–G5와 관문 E 미충족. 사용자 실행 및 배포 승인 없음 |

- **백업 범위.** DB 스키마·행·시퀀스·역할·정책, Auth 및 세션/키 복구 참조, Storage 객체 본문과 DB 메타데이터, Edge 함수 버전·설정·비밀 참조를 별도로 목록화한다. 키·토큰 값을 공개하지 않는다. 기존 10월 25·26일 자료는 부분 스냅샷의 메타데이터다. 암호화·전체 범위·같은 ID의 격리 복원 성공은 미확인이다. RPO는 검증된 마지막 복구 지점과 기준 장애 시점의 차이, RTO는 승인된 복구 시작부터 핵심 흐름 합격까지의 실측으로 제출한다.
- **보안과 보존.** 과거 경고 3건은 익명·인증 역할 함수 실행 각 1건과 유출 비밀번호 보호 비활성 1건이다. 권한 담당자가 현재 증거와 방어 회귀 결과로 종결해야 한다. 오래된 직접 접수·RPC·전용 링크를 전환할 때 기존 접수번호와 원본 호환성을 확인한다. 삭제 요청은 본인 확인·보존 예외·처리 기록·복원 시 재노출 방지를 검증한다. Google Play 심사에는 승인된 개인정보 안내 및 삭제 안내 연결, 실제 앱 등록 상태와 실기기 결과가 별도로 필요하다. [보존된 삭제 안내](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/4e4a2ab06b65c39248b9eba651ac5aab92bd6a28/data-deletion.html#L4-L10)
- **회귀·롤백·관측.** 빌드·SQL·정책 지문을 기준으로 정상/누락 동의, 동시성·중복·응답 유실, 고객 A/B/익명/관리자 분리, 결제·제작 비활성 및 복구 후 검증을 고정한다. 장애 경보는 접수 실패율·저장 불명·권한 오류·복원 검증·예상 밖 외부 호출을 대상으로 하되 허용 기준·담당자·대응 시한은 TBD다. 승인된 빌드 역전환과 새 인입 일시 중지·기존 원본 보존을 리허설하고, 구 쓰기 경로를 자동 재활성화하지 않는다.

## 단계별 승인 초안

단계는 A → B1 → B2 → C → D → E 순서다. 각 단계는 별도 승인 대상이다. 실제 인스턴스·절대 경로·서비스 계정·포트·데이터 크기·실행시간은 TBD이며 구체 증거가 확보되기 전 실행 금지다. 모든 단계는 기존 자원과 추가 비용 0원을 전제로 한다. 비용 추정이 바뀌거나 설치나 새 환경이 필요하면 중단한다.

| 단계 | 대상·계정·포트 | 승인할 조회·실행 명령 초안 | 예상 쓰기 | 중단·복구 |
| --- | --- | --- | --- | --- |
| A 읽기 전용 식별 | 확인할 기존 원본·별도 복원 각 1개. 권한 있는 Windows 담당자의 열람 역할. 루프백 포트 TBD. | `Get-CimInstance Win32_Service`, 검증된 서비스만 `sc.exe qc <TBD>`, `Get-Process`, `Get-Acl`, `Get-NetTCPConnection`, `netsh interface portproxy show all`, `Get-NetFirewallRule -PolicyStore ActiveStore`. 서비스 계정·SID·경로·클러스터 ID를 값 제한된 증거로 제출. | DB·설정 0, 보호된 요약만 기록. | 소유권·유효 ACL·네트워크·원본/복원 대상이 불명확하면 STOP. 관리자 권한 상승과 설정 변경을 승인 범위에서 제외. |
| B1 합성 원본 백업 | A에서 입증된 합성 원본 1개, 범위 제한 백업 읽기 계정, 별도 보호 암호화 경로, 원본 포트 TBD. | 보존 유틸리티 해시와 경로 정책을 먼저 고정한 뒤 `pg_dump --host=127.0.0.1 --port=<TBD> --username=<TBD> --dbname=<TBD> --format=custom --no-publications --no-subscriptions --file=<TBD>` 초안. Storage와 DB 기준 시점을 일치시킨다. | 신규 암호화 보관본·크기·SHA-256·매니페스트만. | RLS로 누락, 기존 경로 충돌, 불명확한 대상·외부 호출시 STOP. 부분 파일은 승인된 격리 보관 처리, 원본 변경 0. |
| B2 별도 복원 | A에서 입증된 독립 복원 인스턴스의 빈 합성 DB·객체 저장소, 제한 복원 역할, 다른 루프백 포트 TBD. | `pg_restore --list <TBD>` 검토 이후 `pg_restore --host=127.0.0.1 --port=<TBD> --username=<TBD> --dbname=<TBD> --single-transaction --exit-on-error --no-owner --no-tablespaces <TBD>` 초안. | 별도 복원 데이터·객체와 감사. 원본 쓰기 0. | ID·경로 중복, 아카이브/역할·객체 해시 불일치, 외부 작업·용량 부족 시 STOP. 확인된 복원 대상만 절차에 따라 정상 종료, 정리는 별도 승인. |
| C 합성 SQL/RLS | B2 PASS 후 격리 DB, 합성 역할, 최소 마이그레이션 계정, 포트 TBD. | `psql --no-psqlrc --host=127.0.0.1 --port=<TBD> --username=<TBD> --dbname=<TBD> -v ON_ERROR_STOP=1 --file=<TBD>` 초안. 비운영 대상 표식과 리뷰 SQL의 Auth 함수·Storage 카탈로그 선행 조건 확인. | 승인·해시 고정 파생본의 합성 행·스키마에 한함. | 접수 성공/저장 불일치, 동시성·권한/구 경로·동의 실패 시 STOP. 리뷰본은 `ROLLBACK` 종료, 지속형 적용·원복은 각각 승인. |
| D 합성 Auth·API·Storage | C 이후 검증된 같은 격리 구성, 고객 A/B·관리자·익명 및 시험 담당 역할, 각 로컬 포트 TBD. | 승인된 절대 실행 파일의 기동·종료 명령과 `Invoke-RestMethod -Method <TBD> -Uri <검증된 로컬 주소 TBD>`를 등록할 단계. 자격은 승인된 네이티브 보안 방법만 사용. | 합성 사용자·세션·신청·전용 객체와 감사만. | 예상 밖 목적지·리스너·메일·작업 가동, 허용/거부 불일치 시 STOP. 식별된 시험 인스턴스만 절차에 따라 정상 종료. |
| E 출시 전 심사 | 서비스 소유자·보안·개인정보·배포 검토자. 승인된 아티팩트와 운영 계획. 포트·배포 권한 TBD. | 보고서·해시 검증 `Get-FileHash`와 체크리스트 검토만 설계. 실제 배포·Google Play 제출 명령 승인 없음. | 이번에는 의사결정 문서만. | 배포 지문·복원·보안 회귀·관측·삭제·등록 또는 최종 승인 누락 시 NO-GO. 예상치 못한 변경은 릴리스 중단, 증거 보존. |

C 단계 검토 원본 해시 `01_schema.REVIEW_ONLY.sql` — `B9C7B6305971374E609A16B2A744999AF8C42786A3D3325DEA0701DE681642B4`, `02_rollback.REVIEW_ONLY.sql` — `B6ED473FCE9EA26DE6FEE6F58E583523409B90F0E9D0CABFDB8A3EC9ACDBB909`. 파생 실행본 해시는 TBD다. 도구 경로·해시·원복 상세는 기존 DEV-04 설계를 재사용한다. [DEV-04 복구 계획](https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/90169d913b318f80579effd7aefde6a6f6c700c7/SOLQ_COMMAND/REPORTS/SOLQ-PORTAL-DEV-04-ISOLATION-RECOVERY.md)

현재 가능한 것은 권한 있는 담당자가 **A의 원본·복원 후보 식별 증거를 제출**하는 단계다. 구체 대상이 미입증인 상태에서는 B1 이후의 실제 실행 승인을 요청하지 않는다. 운영 NO-GO 유지.
