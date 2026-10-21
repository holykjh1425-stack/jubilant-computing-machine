# NEXUS LABS — Claude/OpenAI 서버 연동 (배포 전)

기존 고객 접수, 접수번호, 관리자, 문의 화면은 수정하지 않는다. 서버 코드를 별도 추가했다.
현재 고객 화면에서 이 서버를 호출하는 연결은 **아직 적용하지 않았다**. 공개 배포 및 실제 API 호출은 승인 후 진행한다.

## 실제 확인한 상태 — 2026-10-21 (한국)

- 기존 Supabase `elfacqmvygnwjlklqhiz`: ACTIVE_HEALTHY, 연결 성공. 신규 계정/프로젝트 없음.
- Claude 기존 로그인 확인. 대시보드 크레딧 US$0.00, 결제 페이지는 크레딧 구매 안내 표시.
- 콘솔에 NEXUS-LABS-CLAUDE 및 NEXUS-LABS-CLAUDE-VAULT 키가 존재. 화면 표시 만료일 2026-11-20.
- 기존 Vault ANTHROPIC_API_KEY를 DB 안에서 재사용하여 `nexus_labs_claude_api_key`로 암호화 저장.
- 원문을 반환하지 않는 불리언 검사로 암호화, 키 형식, 콘솔 마스킹 식별자 일치 확인. 유효 API 호출 여부는 미검증.
- anon/authenticated는 Vault schema USAGE 및 decrypted_secrets SELECT 모두 없음.
- `nexus_labs_openai_api_key`는 현재 Vault에 없음. 다른 곳의 OpenAI 키 존재 여부는 미확인.
- 현재 Supabase Edge Functions 없음. 이번 서버와 schema.sql은 운영 적용하지 않음.

## 실행 구조

`POST /api/ai/draft` — 관리자 Supabase Bearer 토큰과 JSON `{applicationId, requestId, action:"draft"}`.

1. Supabase `/auth/v1/user`에서 토큰 검증, DB admin_users에서 관리자 재확인.
2. 실제 DB 주문만 조회. 클라이언트가 작업 내용·가격·모델을 지정할 수 없음.
3. 입금 확인/작업 중 상태와 기존 국외 전송 동의 표식을 확인. 예전 동의 없는 주문은 차단.
4. DB transaction 및 advisory lock으로 세 번의 호출 비용 상한을 먼저 예약. UUID 요청 재전송은 추가 호출 없음.
5. OpenAI 마스터가 분석. coding/writing은 Claude, automation/analysis는 OpenAI가 초안 작성.
6. OpenAI 마스터가 JSON으로 검증. 검증 실패/불완전 응답은 관리자 검토 또는 오류 처리.
7. 결과는 관리자 응답으로만 반환. 결제·계약·배포 실행 도구 없음. 주문 상태 자동 변경 없음.

각 호출 출력은 512토큰, 전체 최대 3회. 자동 재시도·공급자 자동 전환 없음.
실패·시간초과도 예약을 환급하지 않는다. 실제 청구액은 공급자 청구 시스템이 기준이며,
로컬 제한은 **검증된 모델 단가에 따른 보수적 예약액**이다. 일별 한도는 UTC 예약일 기준.
입력 UTF-8 바이트 상한, 프로토콜 여유, 출력 상한으로 예약한다. 단가와 모델은 활성화 때 공식 가격과 대조해야 한다.
로그에는 작업 ID, 단계, 공급자, 모델, 상태, 토큰 수, 정규화 오류 코드만 저장한다.
프롬프트·생성물·고객 연락처·키 원문은 로그/DB 작업기록에 저장하지 않는다.
서버 중단 시 running 예약은 유지하며 같은 요청을 재실행하지 않는다. 관리자가 기록을 확인한다.
초안은 영구 저장하지 않으므로 응답을 잃으면 자동 재청구/재생성하지 않는다.

## 배포 준비 (승인 후)

- Node 22 이상. `npm ci` 후 `npm test`.
- schema.sql은 **아직 적용하지 않은 일회성 DDL**이다. 현재 운영 스키마 검토 후 승인 시 적용.
- 스키마는 private ledger와 nologin 권한 그룹 `nexus_ai_backend`를 추가한다.
- 전용 DB 로그인에 이 그룹 멤버십을 부여해 사용. postgres/admin DB 계정을 런타임에 사용하지 않는다.
- 별도 private view는 이 두 키만 읽을 수 있다. 프런트 역할/공개 RPC에 비밀 접근권한을 부여하지 않는다.
- DB 로그인 비밀번호/접속 URL은 비밀 저장소로 주입. 인증서 검증 TLS 사용; 자체 CA면 서버에 공식 CA 등록.
- OpenAI 키를 `nexus_labs_openai_api_key`로 Vault에 안전하게 등록.
- `.env.example`을 서버에만 복사하고 검증된 모델 ID·단가·승인된 비용 한도를 설정. 기본 한도 0 및 LIVE=false.
- 승인된 도메인의 HTTPS reverse proxy에서 `/api/ai/draft`를 localhost:8787로 연결.
- 정적 호스팅은 기존 파일만 명시적으로 게시. 이 폴더, .env, DB 코드, node_modules는 정적 게시 대상에서 제외.
- 관리자 전용 버튼 연결은 다음 배포 단계. 입금확인 상태만으로 이 서버가 자동 호출되지는 않는다.
- Claude 크레딧 반영 후 별도 승인된 소액 한도 안에서 합성 주문으로 호출 검증. 실제 고객 주문은 사용하지 않는다.

## 테스트와 한계

- Node 모델 모의 테스트: OpenAI/Claude/OpenAI 협업, 작업 종류별 분배, 검증 실패, 비용·권한 차단,
  키 누락, 중복 요청, 잘못된 JSON, 429/오류 정규화, 불완전 응답, 입력 크기, 호출 로그.
- HTTP 테스트: 토큰 없음/비관리자/잘못된 JSON/본문 초과/결제 요청 차단. 모델 실제 호출 없음.
- PGlite Postgres 테스트: 실제 DDL, 역할별 RLS/권한, 두 키로 제한된 view, 일별 예약, 실패 시 예약 유지,
  중복 ID, 입금/동의 게이트. PGlite는 단일 연결이므로 다중 프로세스 잠금 경합은 미검증.
- 운영 DB 트랜잭션 테스트: anon 신청→관리자 조회·상태 갱신 통과 후 ROLLBACK.
- 기존 tests/customer-flow.cjs, manual-review.cjs, written-support.cjs 통과.
- PC/모바일 실제 브라우저 E2E·레이아웃은 미검증. 기존 화면 파일은 변경 없음.
- 실제 공급자 호출/키 유효성/청구/배포/운영 서버 연결은 미검증.

## 기존 보안 검토

기존 공개 접수 RPC는 SECURITY DEFINER와 빈 search_path 및 입력 제한을 사용한다.
일반 사용자에 대한 Vault 권한 없음. 관리자 화면은 textContent로 고객 텍스트 출력.
Supabase advisors는 공개/로그인 역할에서 실행 가능한 접수·문의 SECURITY DEFINER RPC 3개와
유출 비밀번호 차단 미설정을 경고했다. 기존 접수를 중단시키는 권한 변경은 하지 않았다.
현재 공개 폼은 별도 CAPTCHA/사용량 제한 추가 검토가 필요하다.

참고:
- https://supabase.com/docs/guides/database/vault
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://platform.claude.com/docs/en/api/overview
- https://developers.openai.com/api/docs/guides/text
