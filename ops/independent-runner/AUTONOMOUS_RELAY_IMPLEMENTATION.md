# SOLQ COMMAND — 자동 연계 구현 및 검증 관문

## 현재 실제 상태 (2026-11-02)
- 11개 본부 초기 보고를 GitHub dev 브랜치에 기록했다.
- ATLAS 일일 예약 자동화 `6ae7ecf049c08191aebc972747954608` 생성 성공(2026-11-03부터 09:00 Asia/Seoul 근처).
- **미구현:** ChatGPT 채팅 간 직접 메시지 전달, 다른 채팅의 자동 기동, 채팅별 독립 지속 실행, 원자적 작업 잠금의 종단간 검증.
- GitHub 문서 공유는 채팅 간 자동 메시지 송수신과 동일하지 않다.

## 실행 아키텍처 후보
1. ATLAS 예약 작업이 최신 GitHub 장부를 읽고 안전한 조사와 비운영 보고를 수행.
2. 본부별 inbox/outbox를 GitHub 비운영 브랜치에 저장. 메시지 스키마: `task_id`, `owner`, `reviewer`, `revision`, `idempotency_key`, `approval_required`, `status`, `evidence`, `cost`, `timestamp`.
3. 각 본부 채팅은 사용자가 호출하거나 **공식 지원되는 별도 자동화**가 실제 생성·실행된 경우에만 inbox를 읽고 결과를 기록한다. ChatGPT 대화 간 직접 전송 API가 존재한다고 가정하지 않는다.
4. GitHub Actions는 무자격증명·무과금 검증만 허용. 예약 workflow는 GitHub 기본 브랜치 요건 때문에 별도 승인된 배포 전 dev 브랜치에 작성하는 것만으로 실행된다고 주장하지 않는다.

## 구현·검증 완료 조건
- [ ] 실제 지원되는 worker trigger 및 relay transport 확인
- [ ] 원자적 CAS/lease/회복 구현, 동시 요청 중 하나만 성공하는 테스트
- [ ] 메시지 idempotency/중복 실행 차단 테스트
- [ ] inbox → worker pickup → outbox → ATLAS acknowledgement E2E 증거
- [ ] 예약 실행 로그, 실패 알림, 비용 0원, main/운영 무변경 증거
- [ ] 모든 본부별 역할/접근 범위 및 민감정보 차단 테스트

## 운영 우선순위
P0: 관리자 인증·원자적 저장·전체 암호화 백업·격리 복원·SENTINEL 보안 경고.
P1: GROW 전환 장애 분석 및 무광고 첫 유료 계약.
P2: INNO·EDU·ESTATE·MODU·CARE 무비용 타당성 검토, FIN 재무 심사.

## 안전 경계
기존 PASS 반복 금지. 고객 데이터·RLS·main·배포 변경, 유료 API, 결제, 광고, 계약, 인허가, 교회 자금 이동 금지. 공개 GitHub에 비밀정보·고객·헌금자 개인정보 기록 금지.

**판정:** 예약 총괄 실행은 생성됨. 11개 워커 간 자동 통신 및 독립 지속 실행은 위 체크리스트 완료 전까지 미완료.
