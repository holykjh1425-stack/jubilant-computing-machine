# ATLAS 보고 — 고객 이메일 링크 인증·자동 안내 개발

2026-11-12 KST. 저장소 `holykjh1425-stack/jubilant-computing-machine`, 기존 `dev/solq-customer-chat-pricing-20261112`, Issue #10. 기준 SMTP 실조회 c0b1d70 및 54 PASS 재사용.

**개발 후보·격리 검증 완료, 실제 운영 연결 미완료 / 운영 NO-GO.** 신규 링크 흐름은 숫자 OTP 대신 기존 이메일 링크를 사용한다. 기존 고객 데이터/사이트/일반 상담·승인 체계와 기존 증거를 변경하지 않았다.

## 1. 네 가지 과제

| 과제 | 완료된 개발/조사 | 남은 항목 |
|---|---|---|
| A SMTP 준비 | ggwell06 발신·smtp.gmail.com:587 STARTTLS 후보 유지, Gmail/Resend/Brevo 공식 비용 비교 | Google 계정 로그인 중단으로 2단계 인증·앱 비밀번호 가용성 미확인. SMTP credential/실연결 없음 |
| B 이메일 링크 인증 | 기존 ConfirmationURL 메일 유지, PKCE code 교환·검증·고정 HTTPS root callback → #apply 후보; 인증되지 않은 신청 차단 | 실제 SDK·루트 callback/헤더/정적 페이지 바인딩, Auth Site URL/allowlist 적용·실수신 미검증 |
| C 신청 연결 | 기존 verified intake exact-token/session·인증 UID/email·원자 접수번호/접수 outbox 재사용, 링크 UI 상태 연결, 중복/계정 전환/유실 재조회 검증 | 운영 DB 미적용, legacy 익명 제작 신청 컷오버 미실행. 일반 상담 경로 분리 적용은 추가 운영 검증 필요 |
| D 자동 안내 | 기존 접수 dispatcher 재사용. 제작/수정 완료 bridge·워커 snapshot adapter·private durable outbox·감사·3회 지연 재시도·unknown 격리 | 실제 trusted contract/access 검증 자료 연결, preview persistence, SMTP transport·전역 메일 비용 한도·반송/webhook·스케줄러 미연결 |

코드: `candidates/customer-platform-20261112/email-link/`. SQL은 `.candidate.sql`이며 운영 migration 아님. 실제 front page/상담 UI를 바꾸거나 새 프로젝트를 만들지 않았다. 실제 서버·계정·유료 API·결제·스케줄러·SMTP 등록·실메일·운영 배포 0.

## 2. 신규 검증과 보존

- **JS 신규 24 PASS**, `candidates/customer-platform-20261112/evidence/email-link-js.txt`.
- **로컬 PostgreSQL 21 PASS**, `.../evidence/email-link-completion-sql.txt`. PostgreSQL 17.11 / psycopg[binary] 3.2.13, 47개 독립 backend. 임시 cluster, loopback, Cron/확장/외부메일 없음.
- **신규 총 45 PASS**, 기존 54 PASS와 합산해 운영 성공 수치로 표현하지 않는다. 기존 54는 재실행하지 않았다.
- 신규 검증: 고정 redirect·localhost/외부 URL 차단·callback scrub·만료/재사용·계정 전환·인증 없는 신청·응답 유실·서버 신원 결합·접수 메일 최소화·기존 합성 워커 결과 연결·승인/비용 차단·완료 유일성·20 concurrent enqueue/claim·3회 상한·불명확 수락·lease 유실·이메일/preview 변경·anon/A/B 권한 차단·감사/기존 applications/admin grants 보존.
- 기존 sources와 54 증거 SHA-256 보존은 `.../evidence/email-link-preservation.json`에 기록한다. 모든 변경은 새 후보/새 보고/새 증거 파일이다. 신규 SQL runner 준비문의 오류는 수정했고 최종 로그는 실패 0. 운영 데이터를 읽거나 전수 지문을 다시 검사한 것은 아니다.
- hosted Supabase Auth/REST·실제 서명/JWT 발급·SMTP TLS/실수신·브라우저/모바일 UI 배치·24시간 자동 실행은 **미검증**이다. JS는 실제 연결 seam의 합성 통합이고 SQL은 실제 로컬 다중 세션 검증이다.

## 3. Google 계정 확인 결과

Google Account security 화면은 로그아웃이었다. 안전한 로그인 폼을 통해 ggwell06 계정 선택·인증을 진행했으나 Google이 **Sign-in stopped**와 '다른 기기 로그인 시도가 아니라고 응답해 중단됨'을 표시했다. 재시도하지 않았다. 비밀번호 오류·2단계 인증 OFF·계정 차단/봇 차단으로 단정하지 않는다. 비밀값을 수집/출력/저장하지 않았다. session/query URL은 보고서에 기록하지 않는다.

따라서 해당 계정의 2단계 인증·앱 비밀번호 메뉴/정책 가용성은 미확인이다. 사용자가 계정 보안 화면에서 '2단계 인증 ON/OFF, 앱 비밀번호 사용 가능/불가'만 확인하면 된다. 비밀번호·인증 코드·앱 비밀번호를 채팅/GitHub에 보내지 않는다. 필요하면 별도 승인 후 사용자 본인이 새 비밀 생성·보호 등록을 수행한다. 2단계 인증 끄기·일반 비밀번호 SMTP 입력은 금지한다.

## 4. Gmail 한도·대안 비용 비교

2026-11-12 공식 자료 기준. USD 표시, 세금·환율·계약별 추가비용 별도, 가입/결제 없음.

| 선택지 | 공개 한도/가격 | ggwell06 발신 관련 조건 |
|---|---|---|
| 개인 Gmail SMTP | 공식 안내상 하루 500개 초과 또는 단일 메일 500명 초과 시 제한 오류 가능. 이 계정의 잔여량/보장량 아님 | 기존 Gmail 사용 후보. 추가 유료 가입은 하지 않음. 소유권·보안정책·앱 비밀번호 가용성·실제 발신/TLS 미확인. 운영비 0원을 보장하지 않음 |
| Resend Free | $0/월, 3,000건/월, 일 100건 | 소유한 발신 도메인 검증 필요. gmail.com은 소유 도메인이 아니므로 ggwell06 From의 직접 대체로 판단하지 않음 |
| Resend Pro | $20/월, 50,000건/월, 추가 $0.90/1,000건 | 유료 개통 승인 + 소유 도메인/DNS/발신자 변경 승인 필요. 추가 서버 필요 여부와 별개 |
| Brevo Free / Starter | $0/월·일 300건 / $9/월부터 | SMTP/거래성 메일 가능하나 ggwell06 sender 허용·도메인 인증·계정 심사·실한도는 미확인. 가격만으로 교체 결정하지 않음 |

Gmail 인증/접수/완료/수정/개인 발신은 동일 계정 제한을 함께 소비할 수 있다. Supabase Auth rate limit은 별도 관문이다. 계획식은 링크 인증 L + 신청 N + 완료 C + 수정 R + 재발송 F + 기타이며 사용량 가정이지 청구서가 아니다. 소량 Gmail 후보를 우선 유지하되 실제 전달성/남용/쿼터/반송 근거 없이 운영 적합 PASS로 올리지 않는다.

공식 근거:
- https://support.google.com/mail/answer/22839?hl=ko
- https://support.google.com/accounts/answer/185833?hl=ko
- https://resend.com/pricing
- https://resend.com/docs/dashboard/domains/introduction
- https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/sessions/pkce-flow

## 5. 승인 전 남은 차단과 실행 순서

1. **계정 확인(조회)**: ggwell06 소유자가 Google 로그인 중단 사유를 확인하고 정상 계정 보안 상태를 확인. 추가 보안 변경/새 비밀 생성은 별도 승인.
2. **프런트/서버 연결(개발)**: 기존 site root callback 코드 우선 실행, SDK 저장소/헤더/브라우저 QA, Auth gateway·실제 서버의 contract/access/preview 자료를 주입. 현재 후보 모듈을 배포용 HTML에 바로 연결한 상태가 아니다. 일반 상담은 공개 유지, 제작 신청만 검증 이메일 필수.
3. **운영 DB 승인**: 새 private lifecycle 및 앞선 verified-intake/security 후보의 독립 검증·정식 migration 생성·권한 diff·복구/롤백 계획 검토 후 별도 승인. 새로운 후보 테이블은 append 보존하고 운영 rollback에서도 삭제/초기화하지 않음.
4. **SMTP/Auth 변경 승인**: ggwell06 From/표시명·host/port/TLS·비밀 보호 등록, Site URL HTTPS/정확한 redirect 등록. 기존 링크 template 유지. 설정 snapshot 후 운영 활성화, 이전 설정 복구 절차. localhost 사용 금지.
5. **한정 실메일 시험 승인**: 합성 전용 수신함 A/B, 인증/접수/완료/수정 종류·최대 건수·재전송/비용 상한 명시. 현재 승인 0건. 실제 고객 주소 시험 금지.
6. **고객 활성화/운영 배포 승인**: 보안 경고 7건/백업·격리 복원/RPO/RTO/롤백 및 기존 컷오버 관문은 별도 미종결. 인증 없는 legacy 제작신청 우회 차단과 상담 보존 회귀 후에만 운영 전환. 운영 배포 NO-GO 유지.

이번 추가 비용 0원. 개발 코드·SQL·설정 후보 저장은 운영 변경 승인을 대체하지 않는다. actual SMTP delivery / 운영 통합 완료를 주장하지 않는다.
