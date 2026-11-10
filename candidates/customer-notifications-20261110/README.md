# SOLQ 고객 알림 개발 후보 — 운영 미적용

검증·비용·차단 원인은 `../../ops/notifications/REPORT-20261110.md` 참조.

## 재현

```sh
npm ci --ignore-scripts
npm run test:notifications
node ops/notifications/run.mjs
```

마지막 명령은 승인 설정이 없으면 not_approved, sent 0으로 종료한다. 시험은 합성 PGlite/네트워크 stub이며 운영 접속 비밀을 넣지 않는다.

실제 v32 Sites 체크아웃이 있을 때만 `assemble.py --source <checkout> --output <새 로컬 경로>`로 비활성 overlay를 조립한다. 원본 SHA/파일 해시가 다르면 중단한다. GitHub 루트의 구버전 홈페이지를 운영 사이트로 교체하지 않는다. 조립 결과를 검토 없이 배포하지 않는다.

## 운영 적용 전에 필요한 구체 조건

1. schema.sql은 새 migration이 아닌 검토용 SQL 후보이다. 실제 CI의 독립 PostgreSQL 17에서 12개 연결 동시 claim·일일 quota·연결 종료 복구를 검증했다(run 42737253473). 실제 Supabase 인증/권한·상시 실행 환경 검증은 별도다. 운영에는 실행하지 않는다. Supabase CLI의 현 버전과 `--help`를 확인해 공식 migration 생성/차이 검토 절차로 전환한다.
2. 실제 운영에서는 기존 트리거·승인 함수·연락처 고지 및 보관정책 호환성을 대조하고, 완전한 암호화 백업/격리 복원·롤백 관문을 종결한다. 후보에는 고객 데이터 소급 발송·삭제·상태 변경이 없다.
3. Gmail 설정은 서버 보호 Secrets에서만 구성: `SOLQ_GMAIL_CLIENT_ID`, `SOLQ_GMAIL_CLIENT_SECRET`, `SOLQ_GMAIL_REFRESH_TOKEN`. 최소 gmail.send scope로 소유자가 직접 OAuth를 완료한다. ChatGPT Gmail 연결 토큰을 추출/복사하지 않는다. 송신/관리자 수신 주소는 별도 확인한 `SOLQ_NOTIFY_SENDER`, `SOLQ_NOTIFY_ADMIN_EMAIL`이다.
4. Edge 설정: `SOLQ_NOTIFICATIONS_ENABLED`, `SOLQ_NOTIFICATION_WORKER_KEY`(독립 32자 이상), `SOLQ_NOTIFICATION_ORIGINS`(검토된 정확한 origin만). service_role은 서버에서만 사용하며 worker key와 구분한다. 기존 설정에는 값을 추가하지 않았다. Gateway는 공개 submit/account_event와 실제 관리자 snapshot, worker reconcile/claim/finish를 구분한다. 플랫폼 공개 접근 설정과 남용 제한도 검증해야 한다.
5. DB capture_from=NULL, delivery_enabled=false, 두 audience flag=false가 기본이다. 실제 활성화 때 신규 기록부터 처리할 시작 시각과 수신 범위를 승인해야 한다. 과거 10건에 소급 이메일을 보내지 않는다. 업무시간/보관기간·실패 보류 운영 규칙을 확정한다.
6. 보호된 상시 실행 환경에서 `run.mjs`의 주기 실행을 준비한다. GitHub heartbeat 성공만으로 상시 발송 runner가 생기지 않는다. `SUPABASE_URL`, worker key를 설정해야 하며 공개 저장소/Actions 로그에 고객 연락처나 비밀을 넣지 않는다.
7. 실제 발송은 DB delivery flag뿐 아니라 `SOLQ_NOTIFY_LIVE_SEND=approved`와 `SOLQ_NOTIFY_APPROVAL_ID`를 갖춰야 한다. 이는 승인 기록의 기술적 잠금이며 사용자 승인을 대신하지 않는다. 승인 전에는 설정하지 않는다. 카카오/SMS 발송·충전 코드는 이번 변경에 없다.
8. 검증 후에만 Sites feature flag `SOLQ_NOTIFICATIONS_ENABLED=true`를 검토한다. 백엔드 선행 적용·비활성 시험 후 프런트 전환 순서다. 실패한 접수는 동일 토큰/동일 draft로 재시도하며 기존 API로 무조건 fallback하지 않는다. 신규 신청 버튼으로 이전 토큰을 초기화한다.

## 운영 의미

- 계좌 이벤트는 행동 표식일 뿐 입금 확인/계약 동의/제작 승인 증거가 아니다.
- accepted는 Gmail 접수이다. 배달/열람은 별도이며 uncertain은 자동 재발송하지 않는다.
- 일일 50회/최대3회 제한, 전화 연락처는 skipped, token 유효 7일, 신청별 이벤트 종류당 최초1회.
- account_event 실패는 복사 UX를 취소하지 않는다. 기존·다른 기기 접수에 토큰을 만들어 붙이지 않는다.
- 서비스 중단은 신규 claim을 막을 수 있지만 이미 외부로 전송 중인 메시지를 회수하지는 못한다.
- schema.sql의 입금 관찰 trigger는 기존 BEFORE 승인 guard를 바꾸지 않는다. 이벤트 저장 장애 후 후속 상태로 이동한 경우에도 기존 보호된 별도 제작 승인 기록을 이용해 입금 이벤트를 회수한다. 입금 확인과 별도 승인 사이에 취소되고 원래 이벤트 저장도 실패한 예외는 지속 입금 원장과의 추가 대조 대상이다.
