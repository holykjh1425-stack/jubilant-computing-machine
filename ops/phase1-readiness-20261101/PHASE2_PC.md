# SOLQ 2단계 — 사용자 PC 실행 순서

지금 실행하라는 의미가 아니다. 1단계 후보는 운영 미적용이다. 아래 작업은 사용자 PC를 사용할 때 순서대로 한 번 수행한다. 비밀번호·토큰·접속 문자열은 채팅으로 보내지 않는다.

## 1. 같은 고정 커밋 자료 준비

최종 보고서의 GitHub 커밋 화면에서 Code → Download ZIP으로 내려받아 압축을 푼다. 후보 브랜치를 main으로 병합하지 않는다. 이후 PowerShell에서 압축 푼 **저장소 루트**를 선택한다. 이 폴더에는 config.js, vendor 폴더, ops 폴더가 있어야 한다.

```powershell
$solqRoot = (Read-Host '압축을 푼 SOLQ 저장소 루트 전체 경로').Trim().Trim('"')
Set-Location -LiteralPath $solqRoot
Get-Command node.exe | Select-Object -ExpandProperty Source
node.exe --version
node.exe .\ops\phase1-readiness-20261101\phase2-auth.mjs .
```

node.exe가 없거나 지원 기능 오류가 나면 설치·재실행하지 않고 중단한다. 기존 PC에서 Node 설치가 확인됐다는 기록을 재사용하며 새 프로그램 설치를 요구하지 않는다.

이 스크립트는 GitHub의 공개용 Supabase 설정과 고정 SDK만 사용한다. 실제 SOLQ 앱 관리자 이메일·비밀번호를 로컬 터미널에 숨김 입력한다. Supabase 대시보드 Owner 계정과 앱 관리자 계정은 다를 수 있다. 실패하면 자동 로그인 재시도를 하지 않는다.

출력에는 관리자 인증·권한·PostgREST 건수·기존 Edge capabilities 결과와 local_session_ended만 포함된다. 로그인 외 업무 데이터 쓰기는 없다. 등록된 관리자 권한이 없으면 중단한다. CORS가 적용되는 브라우저 화면의 성공을 이 터미널 결과만으로 대신하지 않는다. 종료 시 해당 세션만 로그아웃하며 다른 기기의 세션을 의도적으로 종료하지 않는다. 로그아웃 후에도 이미 발행된 access token의 만료 전 유효성은 별도이므로 토큰을 저장하거나 전달하지 않는다.

기존 운영에는 새 견적 API가 없으므로 이 스크립트는 새 견적 API를 호출하지 않는다. 새 API는 기존 보호된 비운영 환경에서 실제 Auth/RLS를 연결해 검증해야 한다. 그 환경의 주소·인증 방식은 현재 Work에서 확인되지 않았으므로 임의 주소나 가짜 실행 명령을 제시하지 않는다. 운영에 먼저 배포한 뒤 검증하는 방식으로 우회하지 않는다.

## 2. 암호화 백업 사전 조건

이미 설치 확인된 pg_dump 17.11과 공개키 지문 검증은 반복하지 않는다. 다음 **미확인 조건**만 로컬에서 확인한다.

- 기존 Owner Connect에서 Direct 또는 실제 Session pooler 호스트/사용자 확인. 비밀번호를 포함한 URL을 복사·공유하지 않는다.
- 공식 CA, 유효기간, 실제 호스트명에 대한 verify-full 성공 조건. 검증 오류 시 require/disable로 낮추지 않는다.
- C:\SOLQ_public_key가 공개키 전용이며, C:\SOLQ_보안백업이 접근 통제·충분한 공간·클라우드 비동기화 조건을 갖춤.
- pg_dumpall, pg_restore의 호환 버전, Gpg4win 실행 파일 위치 확인. USB 개인키를 읽거나 가져오지 않는다.
- 운영과 다른 보호된 복원 DB의 호스트·포트·DB를 확정하고, SMTP·cron·웹훅·외부 AI·복제·고객 발송을 차단한다. 기존 컨테이너를 재시작하거나 재생성하지 않는다.

## 3. DB·역할 암호화 덤프

아래 명령은 위 조건이 모두 확인된 뒤에만 실행한다. 경로·호스트는 실제 로컬 확인값을 입력하며 임의 기본값으로 바꾸지 않는다. DB 암호는 기존 스크립트의 SecureString 프롬프트에서만 입력한다.

```powershell
$pgBin = Read-Host '확인된 PostgreSQL 17.11 bin 폴더'
$gpgExe = Read-Host '확인된 Gpg4win gpg.exe 전체 경로'
$caFile = Read-Host '공식 CA 파일 전체 경로'
$dbHost = Read-Host 'Owner Connect에서 확인한 DB 호스트'
$dbUser = Read-Host 'Owner Connect에서 확인한 DB 사용자'
$mode = Read-Host '연결 방식: Direct 또는 Session'
& .\ops\windows-backup\Backup-Encrypted.ps1 `
  -ApproveOperatingBackup -SecurityChecklistConfirmed `
  -PgBin $pgBin -GpgExe $gpgExe -PublicKeyHome 'C:\SOLQ_public_key' `
  -CaFile $caFile -DbHost $dbHost -DbUser $dbUser -ConnectionMode $mode
```

이번 지시로 백업 실행은 승인된 상태다. SecurityChecklistConfirmed는 승인 요청이 아니라 실제 보안 조건의 확인이다. 오류 시 중단하고 자동 재실행하지 않는다. 인증·백업 스크립트를 실행하기 위해 시스템 실행 정책·방화벽·Docker 설정을 임의 변경하지 않는다.

기존 스크립트는 database/roles 암호문과 SHA-256을 만든다. 출력의 DB_AND_ROLES_ONLY 경고를 유지한다. 이것만으로 전체 시스템 백업 완료라고 판정하지 않는다.

## 4. 전체 복구 증거 완성

DB 외 Edge **운영 배포본** 코드·의존성·설정, Storage 실제 파일/메타데이터/정책, Auth/RLS/역할, 프로젝트 설정 및 Vault 복호화 의존성을 기존 백업 범위표와 대조한다. GitHub 후보 코드를 운영 Edge 백업으로 대체하지 않는다. 비밀값을 평문 파일이나 채팅에 출력하지 않는다. API 키·Vault 루트키를 임의로 추출하지 않는다.

운영과 다른 복원 대상과 암호화된 저장·메모리 처리·복호화 수단이 확인된 후에만 복원한다. 대상 주소가 미확인인 현재는 실행 가능한 복원 명령을 임의로 만들지 않는다. 복원 시 실제 고객 데이터가 허가되지 않은 CI나 클라우드로 나가지 않도록 한다. USB에 보관된 비밀키의 복구 시험은 별도 민감 작업으로 남기며 이번 후보가 USB에 접근하지 않는다. 기존 PC 키를 사용한 복호화와 USB 비밀키 백업 복구 가능성은 서로 다른 검증이다.

복원 후 건수·내용 지문·RLS·함수·트리거·시퀀스·권한·파일 무결성·외부 송신0을 확인한다. 오류를 무시하거나 대상 객체를 빼고 PASS로 처리하지 않는다. 실제 고객 데이터가 9/6/7에서 증가했다면 최신 수치를 읽기 전용 기준으로 기록하며 강제로 이전 건수에 맞추지 않는다.

## 2단계 완료 결과로 필요한 것

1. 실제 관리자/기존 Edge capabilities 결과 및 세션 종료 결과. 민감정보 없는 결과만 사용.
2. 보호된 비운영 환경의 새 견적·제작 승인 API/Auth/RLS 통합 증거.
3. 최신 전체 암호화 백업 범위표·암호문 SHA-256·보호된 복원 일치 결과. 파일 자체나 비밀키를 채팅으로 보내지 않음.

준비되지 않은 복원 대상이나 비운영 환경이 발견되면 그 부분만 보류한다. 추가 지출·새 서버·운영 변경을 자동 승인하지 않는다. 3단계는 위 조건을 통과한 후보만 적용하고 버전 28 디자인을 보존하는 단계다.
