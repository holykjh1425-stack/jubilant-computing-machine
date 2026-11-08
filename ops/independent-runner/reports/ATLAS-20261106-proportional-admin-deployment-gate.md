# SOLQ 제한 배포 위험 재평가 — 2026-11-06
사용자의 배포 관문 재분류 지시를 적용한다. 기존 NO-GO 중 전체 암호화 백업/실제 격리 복원/RPO/RTO는 별도 재해복구 과제로 유지한다. 미완료를 해결로 표시하지 않는다.

## GUARD 판단
후보0a091a3의4개 파일을 버전28 소스 ab4d34c830669e69b57f0689588eb6a24b41f91e에만 적용했다. 비교 결과 dist/admin.html, dist/admin.js, dist/free-workflow.js, dist/plan-view.js 외 변경0.
admin.js의 function render(application) 이후 로그인·상태 저장·RPC 승인 핸들러는 버전28과 바이트 동일. 무료 계획의 자동 생성/배정 대신 서버 저장 결과 SELECT만 수행. 30초 타이머는 조회만 호출한다. 기존9개 변경부 시험과51개 플랫폼 시험 재사용, 반복하지 않음.
실제 인증·신청·계획6단계·검토 대기는83cab9b 사용자 화면/Auth 기록/DB 연결 대조 증거 재사용.
08:51:03 KST 배포전 신청9/계획6/기존작업7/제작관리6/견적수락0/제작시도0.4개 테이블 내용 지문도 기존과 일치.
새 실제 신청 저장·별도 production_jobs UI·배포후 로그인은 아직 완료 아님.

## SENTINEL 판단
운영 함수 정의/RLS/권한을 읽기 전용 조회했다.
- admin_users/production_jobs/solq_quote_acceptances는 RLS=true, anon SELECT=false, authenticated INSERT/UPDATE/DELETE=false.
- admin_users 자기 레코드 SELECT 및 신청·계획·작업의 관리자 멤버십 RLS 확인.
- solq_approve_production은 private.approve로 위임하며 authenticated JWT/admin_users, 수동 deposit_confirmed 상태, 해당 신청과 연결된 quote_acceptance를 검사하고 행 잠금/중복 승인을 처리한다.
- 실행 claim은 service_role 및 provider 활성/검증/승인호출수/예산/견적·입금·별도승인 조건을 다시 검사한다. 운영에서 승인 호출을 시험하지 않음.
- 후보는 해당 서버 함수/권한/정책/호출 핸들러를 변경하지 않으므로 승인 우회 경로를 추가하지 않는다.

경고7건(3함수×2role+유출비밀번호보호1)은 미해결로 유지한다.
1~2 submit_application anon/authenticated: 공개 접수 목적, 고정 received/internal_note NULL, 입력/동의 검증, 빈 search_path. 익명 접수 남용 가능성 잔여(중간). 이번 관리자 조회 후보에서는 호출하지 않으며 추가 노출 없음.
3~4 submit_support_inquiry anon/authenticated: 동의2개/입력길이/64hex 토큰검사, 해시저장, 고정컬럼, 빈 search_path. 남용/요청제한 후속 검토(중간), 후보가 공개권한을 추가하지 않음.
5~6 read_support_inquiry anon/authenticated: ID+64문자 capability의 SHA256 일치 조건, 정적SQL/빈 search_path. 토큰 탈취 잔여위험(중간), 이번 변경과 관련된 노출 확대 없음.
7 유출 비밀번호 보호 OFF: 기존 관리자 계정 보안의 잔여위험(중간), 인증 설정 변경 없음. 후보 때문에 기존 보호가 약해지지 않는다.
이 검토에서 이번4파일이 새로 유발하는 인증우회/권한상승/개인정보노출/데이터변조/승인우회는 식별하지 못했다. 전체 시스템 보안 무결점이나 경고 해결을 주장하지 않는다.
후속 검토 기한 제안: 2026-11-13, 담당 SENTINEL/Owner. 설정변경이나 위험수용의 별도 승인을 대체하지 않음.

## 복귀 수단
기존 저장 버전28과 archive가 Sites get_site_version에서 재확인됨.
version_id appgprj_6ad984f12870819181d960c1bd9ed20a~appgver_0a79ac6b93608191a3694797fef0718c
archive SHA256 ced870445c10f9458a154afaad5cf4346eb3e8e95ba308dd1cbe3fb20ae75b18
Owner 배포권한/정상 소스 접근 확인. 기존 파일33개 바이트 복원 시험 재사용. 실제 운영 롤백 시험은 미실행.
대체 검증 충분성: 저장된 native version/archive를 deploy_site_version으로 직접 재배포할 수 있고, DB변경 없는 정적4파일이므로 이번 제한 배포의 복귀 수단으로 충분하다고 판단. 실제 배포/롤백 성공을 사전에 보장하지 않음.
실패/파일불일치/인증·조회 회귀/비정상 업무행 생성 증거 발견 시 추가변경 중단 후 위version_id를 재배포, 상태 succeeded 확인, 로그인·조회 재확인. 새 업무데이터를 삭제하는 롤백은 하지 않음.

## 실행 결정
이번 재분류 기준에서 변경 관련 필수 사전 관문은 충족. 저장 후보Sites29(source182ab212056ac89e3dcf4f08d37c7aa53ea47f47)을4파일 범위로 제한 배포할 수 있음.
사후 실제 인증은 기존 Work 브라우저에 세션이 없어 사용자 확인이 필요할 수 있다. 그 경우 사후검증 미완료를 명시하며 전체 정상화 완료로 표시하지 않는다.
신규 비용0, 유료API0, 운영DB/RLS/Auth/Edge/cron/main변경0. 고객기록은 읽기만 함.
