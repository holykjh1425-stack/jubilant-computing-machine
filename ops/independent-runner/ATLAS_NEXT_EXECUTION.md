# ATLAS — 다음 단계 실행 통제 (2026-11-02)

## 확인된 사실
- 기존 격리 중복 작업 잠금 검증 GitHub Actions run 41375617457: completed/success. 이는 ATLAS 신규 dispatcher E2E PASS를 뜻하지 않음.
- 신규 dispatcher 소스 및 단위 테스트, GitHub Actions 설정이 dev 브랜치에 커밋됨. 신규 workflow 실제 PASS 로그는 미확인.
- 일일 ATLAS 예약 자동화는 생성되었음. 11개 ChatGPT 채팅 직접 자동 소집은 미구현.

## 안전한 실행 순서 및 완료 기준
1. **ATLAS-ENG-01** (ATLAS, GUARD 검토): 신규 workflow 실행 여부·단위 테스트 로그·artifact 확인. 실제 증거 없으면 BLOCKED.
2. **ATLAS-ENG-02** (AUTO, SENTINEL 검토): inbox/outbox 스키마와 입력 검증. 공개 저장소에 개인정보·비밀·민감한 계약 자료 반입 금지.
3. **ATLAS-ENG-03** (AUTO, GUARD 검토): 원자적 CAS 작업 소유권, 임대 만료·복구·재시도 중복 방지. 동시 실행에서 정확히 한 소유자만 성공한 증거 필요.
4. **ATLAS-ENG-04** (ATLAS, GUARD 검토): ATLAS→inbox→지원되는 worker 실행→outbox→ATLAS 결과 인계 E2E. 사람이 옮긴 메시지는 자동 전송으로 표시 금지.
5. **ATLAS-SEC-01** (SENTINEL, CORE 검토): 보안 경고의 공식 권한·코드 영향 조사. 운영 보안 설정 무단 변경 금지.
6. **SOLQ-004~009** (GUARD/CORE/AUTO): 실제 관리자 인증·원자적 저장·전체 암호화 백업·격리 복원. Supabase 지원 회신 확인 자동화와 중복하지 않음.
7. **GROW-01** (GROW, FIN 검토): 무료 유입→신청→견적→착수금 전환 동선 분석. 실제 고객 연락·청구·광고비 집행은 별도 승인 필요.
8. **사업성** (INNO/EDU/ESTATE/MODU/CARE, FIN 검토): 공개자료 기반 무과금 검토. 확인 전 예상 매출 확정 금지.

## 워커 회의 프로토콜
- ATLAS가 안건·참여 본부·입력 증거·결정 기한을 작업 장부에 기록.
- 각 본부는 자신의 역할 범위 내 증거와 의견을 outbox에 제출. ChatGPT 기존 채팅은 사용자가 호출하거나 공식 지원된 자동화가 실행한 경우에만 참여 가능.
- ATLAS는 이견, 미확인, 승인 필요 사항을 분리하여 결론을 기록. 자동 소집이 검증되지 않았으면 '회의 완료' 금지.

## 중단 조건
동시 작업 소유권 불명, 기존 Work 세션과 충돌 가능성, 실패 로그, 인증 누락, 예상치 못한 비용, 운영 변경 위험 발생 시 중단. 고객 데이터 삭제·변경, main 병합, 실제 배포, 유료 API, 결제, 계약·법적 신고는 별도 승인 전 금지.
