# SOLQ COMMAND ATLAS — 2026-11-03 읽기 전용 실행·중복 제거 보고

> 공개 저장소용 비민감 요약. 운영 고객행·기부자·계좌·비밀키·인증값·실제 보안 공격 절차는 포함하지 않음. 본 기록은 ChatGPT의 단일 예약 실행 결과이며 11개 독립 채팅을 자동 호출하거나 Work 세션을 재개한 증거가 아님.

## 작업 출처 꼬리표
```yaml
SOLQ_WORK_TAG:
  work_id: "SOLQ-20261103-ATLAS-0900"
  requested_at: "미확인 (예약 실행 예정시각 2026-11-03T09:00:00+09:00)"
  requested_by: "사용자 (기존 ATLAS 예약 지시)"
  instruction_source: "ChatGPT automation 6ae7ecf049c08191aebc972747954608"
  executed_by: "ATLAS / ChatGPT 예약 실행 (단일 세션)"
  started_at: "2026-11-03T09:19:35+09:00"
  completed_at: "2026-11-03T09:22:00+09:00 (보고서 기록 예정 기준)"
  repository: "holykjh1425-stack/jubilant-computing-machine"
  branch: "dev/solq-independent-runner-20261102"
  commit_sha: "이 파일의 GitHub 생성 커밋 참조"
  environment: "읽기 전용 연결 조회 + 비운영 문서 커밋"
  verification: "PARTIAL / production NO-GO"
  approval: "기존 승인 범위: 읽기 전용 조사·무과금 문서 준비만"
```

## 1. 실제 수행 및 확인한 근거

1. GitHub 대상 브랜치의 `WORK_LEDGER.md`, `tasks.json`, `ATLAS_NEXT_EXECUTION.md`, 11개 본부 최초 보고 및 과거 통합 검증 보고서를 실제 읽었다. 기준 브랜치 헤드 조회 시 `6f0a88c1a7e972fc3f61b606fae6c9f02ba24820`. 작업 장부: 완료 2개(SOLQ-001~002), 준비 7개(003,011~016), 차단 7개(004~010). 작업 장부는 변경하지 않았다. 63개 과거 격리 PASS는 재실행하지 않았다.
2. Supabase 프로젝트 `elfacqmvygnwjlklqhiz`의 보안 advisor와 Edge 함수 메타데이터를 새로 **읽기 전용 조회**했다. 2026-11-03 09:20 KST advisor 기준 경고 7건: 공개 호출 가능한 SECURITY DEFINER 함수 3개에 대해 anon/authenticated 권한 경고 6건, 유출 비밀번호 보호 비활성 1건. SQL 카탈로그에서도 해당 3개 함수의 SECURITY DEFINER/실행 권한과 `search_path` 고정 설정을 확인했다. 이 경고만으로 취약점 악용이나 침해를 확정하지 않는다. 공식 조치 참고: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable , https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable , https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
3. Edge 함수 4개 ACTIVE, 이 중 2개는 `verify_jwt=false`임을 확인했다. 두 함수의 현재 배포 코드도 읽어 내부 자격검사/동작별 제한 분기가 **존재함**을 확인했다. 따라서 JWT 비활성화만으로 무인증이라고 단정하지 않는다. 공개 기능의 RPC 권한 경계·속도 제한·실제 악용 가능성은 미검증. 키·비밀번호·Vault 값을 읽거나 호출하지 않았다.
4. GitHub `.github/workflows/solq-atlas-dispatch.yml` 및 `solq-independent-smoke.yml` 파일을 읽었다. 후보 workflow는 contents:read, 수동 dispatch/제한적 push 조건, dry-run 제안 산출물로 설계됐다. **이번 실행에서 신규 GitHub Actions run PASS/아티팩트는 확인되지 않았고 workflow를 실행하지 않았다.** `SOLQ-003`은 ready 유지. 파일 존재만으로 실제 자동 실행 성공을 주장하지 않는다.
5. 후보 브랜치 `index.html`·`app.js`를 읽었다. 이 브랜치의 일부 고객 화면은 여전히 NEXUS LABS 표기와 예전 신청 동선을 포함한다. **실제 공개 SOLQ 사이트의 최신 화면과 동일하다고 판정하지 않는다.** 실제 사이트 직접 열람은 이번 도구 환경에서 실패하여 GROW-01 실사이트 전환 검증은 미완료.
6. 2026년 현행 공식 안내를 조사했다. 연구개발전담부서의 기본 인적요건은 연구전담요원 1명 이상(기업 형태/자격/전담·공간 조건 추가 확인 필요): https://www.rnd.or.kr/user/info/outline.do 및 https://www.rnd.or.kr/user/newly/requirements.do . 평생교육법 제33조는 불특정 다수에게 학습비를 받는 원격교육의 신고와 학위 인정 원격대학형 시설 인가를 구분한다(적용 시점·관할 해석 재확인): https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=&chrClsCd=010202&efYd=20261203&lsiSeq=286439&urlMode=lsInfoP . 정부24는 건축물대장 인터넷 발급·열람 무료를 안내한다(이번에는 특정 건물 서류 미열람): https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=15000000098&HighCtgCD=A09005&tp_seq=01 . 국세청은 홈택스 전자기부금영수증과 일반 수입·지출 회계장부가 서로 다른 업무임을 이해하는 데 필요한 공식 전자발급 안내를 제공한다: https://j.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=238907&mi=40251 .

## 2. 본부별 단일 책임자 및 중복 없는 미완료 과제

| 본부 | 단일 책임 과제 / 중복 방지 | 현재 판정 |
|---|---|---|
| FIN | 영리사업별 현금흐름·세무·착수금/잔금 원장 및 Pro 실제 청구액 확인. CARE 교회 회계는 별도 법적 주체로 분리, 숫자 미확인. | 조사 준비; 계정 청구·원장 원본 미확인 |
| CORE | 실제 관리자 화면·고객 접수·최종 저장 어댑터 구현 및 기존 운영 호환성. GUARD의 독립 PASS 판정 대신하지 않음. | 운영 관리자 세션·복원 환경 미확보 |
| AUTO | 무료 계획→견적→수동 입금 확인→별도 제작 승인 순서 및 유료 호출 상한 설계. 이전 로컬 통합 PASS 재실행 금지. | 운영 통합 미완료, 유료 호출 없음 |
| GUARD | 실제 관리자 인증·원자적 저장의 독립 검증, 전체 암호화 운영 백업과 보호된 격리 복원, 출시 NO-GO 판정. | 실제 운영 백업 0회/복원 0회, 차단 |
| SENTINEL | 이번 7개 advisor 경고와 JWT 비활성 Edge 2개를 위험도별 읽기 전용 검토. GUARD의 기능 테스트와 분리. | 경고 재확인, 침해 증거 없음, 조치 미승인 |
| GROW | 실제 공개 사이트의 유입→무료 계획→견적→착수금 동선과 고객별 출처 측정 설계. N01·WordPress 예약/통계는 기존 자동화 담당. | 후보 코드만 검토, 실사이트/실매출 미확인 |
| INNO | 기존 사업 내 연구개발전담부서 vs 신규 법인 비교, 자격·공간·지식재산권. | 공식 일반 요건 일부 확인, 사용자 적격성 미확인 |
| EDU | 양주 2층 원격평생교육시설 신고/인력/시설/수요 조사. ESTATE와 같은 공간 수익 중복 금지. | 법적 신고 분기 확인, 시설 원본 미확인 |
| ESTATE | 층별 소유·임차·전대 권한, 지급/수취 월세, 공실·용도, 브랜드 입점 가능성. | 건축물대장 무료 열람 경로 확인, 실제 서류 미열람 |
| MODU | 무재고 제휴 가능 제조사 공식 계약조건·인허가·운송·설치·하자 책임. | 공급가·수수료·제휴 모집 실증 없음 |
| CARE | 기존 교회 전용 회계장부 개시, 홈택스 영수증 대조, SOLQ와 계좌·장부 완전 분리. | 사용자 진술 확인, 자격증빙 원본·은행 자료 미열람 |

**CARE 최신 사용자 확인(2026-11-02 밤, 원본 검증 아님):** 고유번호증 및 기부금영수증 발급 자격·증빙 보유, 교회 전용 계좌 사용, 홈택스에서는 기부금영수증만 관리, 일반 회계는 은행 거래내역으로 관리, 새 운영장부 시작 지시. 실제 증빙번호·헌금자·계좌번호·거래내역은 공개 기록하지 않는다. 새 장부의 시작일과 기초잔액은 실제 확인 후 확정하며 임의로 0원 처리하지 않는다.

## 3. 0원 전환 준비·검증 가능한 산출물

- 기본형 고객 안내 문구 초안: **무료 6단계 업무 계획(0원) → 개별 견적 및 동의 → 착수금 30,000원 수동 입금 확인 → 별도 제작 승인 → 제작 → 잔금(총제작비 100,000원인 기본형은 70,000원)**. 기본형에는 생성형 AI/외부 연동/자동 발송/결제/월 유지관리가 자동 포함되지 않는다. 현재 운영 화면에 반영됐다는 뜻이 아니다.
- 전환 퍼널 측정표의 **열 정의만** 준비: 관측일시(KST), 유입 출처(미확인 허용), 실제/테스트 구분, 신청 여부, 무료 계획 전달, 견적 동의, 입금 수동 확인, 별도 제작 승인, 실제 수금액, 환불·직접비. 고객 개인정보/실제 수치는 공개 저장소에 기재하지 않는다.
- 검증 가능한 최초 실험: 실제 공개 페이지 CTA/가격/접수번호/무료 계획 화면을 보호된 읽기 전용 브라우저에서 대조하고 누락만 보고 → CORE가 비운영 후보 수정 → GUARD 독립 검증. 블로그 예약/통계 중복 작업과 무단 고객 연락·광고 결제 없음.
- 신규 사업 공통 중단 기준: 공식 신고·권리·제휴·인력 조건 미확인 시 **매출 0원(미확인), 사업 개시 보류**. 모듈러 5% 수수료, 건물 월세 110만원, 교육 가격 등은 확정 수익으로 합산하지 않는다. 교회 헌금은 SOLQ 영리 수익과 10억 순이익 목표에 포함하지 않는다.

## 4. 차단·승인·비용

- P0 차단: 안전한 운영 DB 전체 백업 접근·암호화·Storage/역할/함수/설정 복구 범위 및 독립 복원 경로 미확정. 기존 지원 회신 점검 자동화가 담당하며 이번 실행에서 Gmail 조회/재문의는 하지 않음. 실제 운영 관리자 로그인과 최종 원자적 저장 통합은 백업/격리 선행조건 충족 후 별도 보호 환경에서 수행.
- 보안 경고 조치는 기능 영향 평가 후 별도 권한/설정 변경 승인 필요. 경고 존재 자체를 침해 사실로 기록하지 않음.
- 신규 GitHub Actions 수동 dispatch 기능은 이번 도구에서 제공되지 않았고 신규 PASS 실행 증거도 없음. `SOLQ-003` 완료 처리 금지.
- 무과금 읽기 전용 조회와 이 개발 브랜치 문서 1개 추가 외 운영 변경 없음. 신규 유료 API 호출·광고비·계약·신고·고객 연락·고객 데이터 변경·main 병합·배포 없음. 실제 계정 청구액은 별도 미확인.
- **배포 판정 NO-GO.** 11개 워커 채팅의 자동 호출·동기화·원자적 작업 claim은 실제 검증 전 미구현으로 표시한다.

## 5. 재사용 증거 URL (새 PASS로 재집계하지 않음)

- 2026-11-01 실제 로컬 Supabase 통합 33 PASS: https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41295597041
- 2026-11-01 최종 견적/입금 후보 로컬 통합 30 PASS: https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41303790420
- 2026-11-02 기준 작업 출처 꼬리표 규칙: https://github.com/holykjh1425-stack/jubilant-computing-machine/blob/dev/solq-independent-runner-20261102/docs/SOLQ_WORK_PROVENANCE_TAG_POLICY.md

기록 시각: 2026-11-03 09:22 KST. 본 보고서에 적힌 '완료'는 읽기 전용 조회·문서 조사·기록 완료만을 의미하며 운영 통합 완료가 아니다.
