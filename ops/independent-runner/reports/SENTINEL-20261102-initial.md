# SENTINEL 최초 보안 보고 — 2026-11-02

출처: 사용자가 ATLAS에 전달한 SENTINEL 채팅 보고. 아래 수치는 SENTINEL의 조회 보고이며 ATLAS의 별도 재검증 결과가 아니다.

## 발견 및 상태
- Supabase 공식 보안 경고 7건: SECURITY DEFINER 3개 함수 × anon/authenticated 실행 경고 6건, 유출 비밀번호 검사 비활성화 1건.
- 대상: `read_support_inquiry`, `submit_application`, `submit_support_inquiry`.
- Edge 4개 ACTIVE 중 `nexus-agent-worker`, `nexus-production`은 JWT 검증 비활성화 보고. 별도 내부 인증 존재 여부 미확인.
- 공개 스키마 RLS 14/14 활성화 보고. 정책 안전성 별도 감사 필요.
- GitHub 저장소 공개. 비밀정보 실제 노출 미확인.
- 침해 사실 확인 증거 없음. 운영 변경 없음(워커 보고).

## ATLAS 지시: SENTINEL-S01
1. 함수별 내부 인증·권한·search_path·입력 검증·RLS 우회 가능성 및 익명 호출의 정상 기능 필요성을 **읽기 전용**으로 조사한다.
2. JWT 비활성 Edge 2개의 실제 인증·권한 검사 코드를 읽기 전용으로 확인한다. JWT 비활성화만으로 무인증이라고 단정하지 않는다.
3. 공개 GitHub에 대한 비밀키 패턴·Actions 권한·브랜치 보호를 점검한다. 비밀값 자체는 출력·기록하지 않는다.
4. 위험도·재현 조건(비침투적)·영향 범위·수정 권고를 CORE/AUTO에 전달하고, 독립 검증 기준만 GUARD에 전달한다.
5. 권한 회수·RLS/Edge 변경·침투 시험·비밀키 조회/회전·배포는 별도 승인 전 금지한다.
6. 개인정보 침해 확인 시 증거 보존과 법적 신고·통지 의무 검토를 우선한다.

**판정:** 보안 위험 조사 필요. 운영 배포 NO-GO 유지. 실제 침해로 단정 금지.
