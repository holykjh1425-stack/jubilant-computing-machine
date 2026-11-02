# SOLQ 작업 출처 꼬리표 규칙 (제안 / 개발 브랜치)

상태: 기록 규칙 초안. Codex/ChatGPT 화면에 자동 표시되도록 구현된 것은 아님. 운영 배포 및 기존 작업 수정 없음.

## 필수 꼬리표
모든 신규 SOLQ 개발 작업의 **지시문 첫머리**, **최종 보고서 첫머리**, **작업 장부**에 다음 정보를 함께 기록한다.

```yaml
SOLQ_WORK_TAG:
  work_id: "SOLQ-YYYYMMDD-<unique-id>"
  requested_at: "YYYY-MM-DDTHH:mm:ss+09:00"
  requested_by: "<실제 지시 주체: 사용자/ATLAS/자동화 ID/미확인>"
  instruction_source: "<대화 ID 또는 이슈/자동화 링크>"
  executed_by: "<Codex/Work/GitHub Actions/담당 워커 이름 및 식별자>"
  started_at: "<ISO8601 또는 미확인>"
  completed_at: "<ISO8601 또는 미완료>"
  repository: "holykjh1425-stack/jubilant-computing-machine"
  branch: "<브랜치>"
  commit_sha: "<커밋 또는 변경 없음>"
  environment: "<격리/개발/운영>"
  verification: "<PASS/PARTIAL/FAIL/BLOCKED>"
  approval: "<승인자, 승인 시각, 범위 또는 미승인>"
```

## 규칙
1. **실제 출처를 확인할 수 없으면 '미확인'**으로 기록한다. AI가 사용자나 ATLAS의 지시를 임의로 주장하지 않는다.
2. 모든 시각은 **KST(UTC+09:00)** ISO 8601 형식으로 기록한다. 시스템 시각을 읽을 수 없으면 추측하지 않는다.
3. 작업 시작 시 지시 꼬리표를 만들고, 완료 시 실행자·시각·결과를 갱신한다.
4. 보고서와 작업 장부에 같은 work_id를 기록하여 중복 실행을 막는다. 동일 work_id가 완료 상태이면 재실행 전 검토한다.
5. 작업별 GitHub 이슈/PR/Actions URL, Codex 대화 ID가 있으면 링크 또는 식별자를 함께 남긴다.
6. 비밀키·개인정보·고객 신청 내용·인증정보를 꼬리표 또는 공개 저장소에 넣지 않는다.
7. main 병합, 운영 배포, 유료 API, 고객 데이터 변경, 권한 변경은 별도 승인 없이는 실행하지 않는다.
8. 과거 기록은 날짜/지시자를 추정해 소급 기입하지 않는다.

## 출처 미확인 기존 Codex 기록 (참조용)
- Codex 대화 ID: `01a14cff-de36-73fc-9570-7e21e082108e`
- 제목: `jubilant-computing-machine 설정`
- 내용: `$cloud-environment-onboarding:setup` 관련 정적 사이트 개발 환경 점검
- 최초 지시 날짜: 미확인
- 실제 지시자: 미확인
- 실행 도구: Codex Cloud (대화 화면 기준)
- Supabase 연결: HTTP 403 차단 (대화 보고 기준)
- 게시 승인: 없음

## 구현 범위
이 파일은 **추후 자동화가 읽고 적용할 기록 계약**이다. Codex 모바일 UI 자체에 꼬리표를 강제로 표시하는 기능이나 모든 에이전트에 자동 전파하는 기능은 별도 구현/연결이 필요하다.
