# SOLQ 管理자 제한 배포 최종 관문 — 2026-11-06 08:35 KST

## 판정
**운영 반영 보류 / NO-GO. 배포 승인은 수신했으나 조건부 안전 관문은 미충족이다.**
사용자의 최종 승인은 후보4개만 대상으로 하며 필수 안전 조건을 해제하는 승인이 아니다. 승인 부족으로 보류하는 것이 아니라 아래 기술적 검증 미완료로 보류한다.

## 실제 수행 / 재사용
- Sites get_site 및 list_site_versions 실조회: 운영 URL https://solqtech.com, active, 현재 최신 버전28. 저장 버전 ID appgprj_6ad984f12870819181d960c1bd9ed20a~appgver_0a79ac6b93608191a3694797fef0718c.
- 버전28 소스 ab4d34c830669e69b57f0689588eb6a24b41f91e, 보관 archive SHA256 ced870445c10f9458a154afaad5cf4346eb3e8e95ba308dd1cbe3fb20ae75b18, 481280 bytes. 보관된 배포 이력은 있으나 서비스 버전 전환 롤백 실측은 없다.
- 후보0a091a3의 로컬4개 파일 SHA256을 기존 검증값과 재대조해 모두 일치.
  - admin.html a8967e5303ecb7593af81d885991ef30899d4f8e4bfe71ebe1d486279fd14af9
  - admin.js 5fdae518b830d451210da66d342bed0741f3a4353743949d70eb3ea01f1d1cd4
  - free-workflow.js d9a60250ee54607244bca74d032545da19dd11418c33e566a9a21ef6a314d3cc
  - plan-view.js e0c8ede1d22f6877ecba30fd94b3c2c0357f198028f19a03e2217f0a17c2c7f8
- 83cab9b 실제 사용자 관리자 인증·모바일 목록·무료6단계·관리자 검토 대기 증거 재사용. 추가 로그인이나 사용자 사진 요청 없음.
- 기존51개 플랫폼 시험과9개 변경부 시험, 33개 파일 원복 검사는 반복하지 않음. 파일 원복 결과는 실제 Sites 서비스 롤백 성공과 구별한다.

## 현재 실제 운영 읽기 증거
DB 관측 2026-11-05T23:34:58.632101Z = 2026-11-06 08:34:58 KST.
신청9, 무료계획6, orchestrator_jobs7, production_jobs6.
전체 행 지문 계산은 md5(string_agg(md5(to_jsonb(x)::text),'' order by id)).
- applications ab4edc5be0aea000e9b53979a2e796d5
- ai_work_plans dcc75548a915b45585f9543f80574805
- orchestrator_jobs 8ad9bbd159b842397b1c8966fb368c3a
- production_jobs d0afc319aa608eb8fd61d19e7e9a5975

네 테이블 모두 이전 인증 전·후 증거와 건수/내용 지문 일치. 관측 중 추가 생성0건. 이 결과는 배포 후 검증이 아니다.

cron 실조회:
- nexus-free-orchestrator active=true, 최근 성공 2026-11-06 08:34:00 KST, 최근1시간 실패0.
- nexus-production-capture active=true, 최근 성공 같은 분, 최근1시간 실패0.
예약 작업 중단·변경 없음.

## 미충족 안전 조건
1. 전체 암호화 운영 백업과 실제 격리 복원 완료 증거 없음. 기존 필수 GUARD 조건 유지. 저장된 사이트 파일 archive는 DB 백업을 대신하지 않는다.
2. 운영 보안 종결 미완료. 08:34:55 KST Advisor 실조회에 기존 WARN7 유지: 공개 SECURITY DEFINER 함수3개의 anon/authenticated 실행권한6건, 유출 비밀번호 보호 미설정1건. WARN 자체를 검증 없이 High나 취약점 확정으로 승격하지 않으며, 공개 기능에 필요한 권한도 임의 회수하지 않는다. 원인별 안전성 종결·명시적 위험 수용 증거 없음.
3. 실제 Sites 서비스 롤백·PC/iOS 등 기존 필수 회귀 검증 미완료. 파일트리33개 바이트 복귀는 확인됐지만 런타임 롤백 PASS는 아니다.
4. 별도 production_jobs UI 조회, 신규 고객 신청 저장 및 배포 후 검증 미실행. orchestrator_jobs 조회를 제작 관리 조회로 대체하지 않는다.

## 후속 조건
보호된 백업 접근/저장소와 운영과 분리된 복원 대상을 확보해 실제 백업·복원을 마무리하고, 보안 검토 및 요구된 회귀·롤백 관문을 종결해야 한다.
본 작업에서 운영 DB/RLS/Auth/Edge/홈페이지/고객 신청/유료 API 설정/main 변경0, Sites 새 버전 생성·배포0. 개발 브랜치에 이 증거 문서만 추가한다.
실제 유료 API 호출0, 신규 유료 자원0. 배포하지 않았으므로 배포 후 로그인/자동생성0/회귀 PASS를 주장하지 않는다.
