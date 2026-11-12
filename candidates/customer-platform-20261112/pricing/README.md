# FIN 가격·관리비 검토 후보

운영 미반영, 고객 공개·자동 청구 미승인. 기존 자동화 100,000원은 보존한다.

- `catalog.mjs`: 사용자 지정 홈페이지·선택형 관리비 제안 목록, 범위/수정 제한, 미정 VAT, 비용 산식. `getCustomerPricing()`는 어떤 클라이언트 승인 인자도 믿지 않고 가격 없는 개별견적 안내만 반환한다. 내부 가격 목록은 `getInternalPricing()`로만 제공한다. 운영 공개 고객 번들에는 내부 제안 데이터를 포함하지 않아야 하며, 승인된 실제 가격 목록은 서버가 소유한 버전으로 별도 제공해야 한다. 이 함수 자체가 인증/운영승인을 구현하는 것은 아니다.
- `scenarios.mjs` / `scenarios.json`: 인건비·AI 예산 상한·예비비 입력의 합성 계산. 실제 요금·작업시간·API 사용량·이익 증거가 아니다.
- `sources.json`: 2026-11-12 원문 확인일과 발표일 구분, 비교 범위와 한계.
- `pricing.test.mjs`: 6개 PASS. 미승인가 노출 금지, 기존 상품 보존, VAT 미정 마진 계산 보류, 비용 합계·고정비 중복 방지, 비정상 입력 차단 확인.

단위테스트: `node --test candidates/customer-platform-20261112/pricing/pricing.test.mjs`.

모듈은 외부 네트워크·API·청구·상태 변경 코드를 포함하지 않는다. `estimateProductionCost()`는 VAT 미정이면 매출 순액·기여액을 null로 반환한다. included/excluded 입력은 계산 시나리오이며 SOLQ의 과세유형을 확정하지 않는다. 상세 범위·원가·계약 조건은 기존 docs 매뉴얼의 이번 검토 보완을 따른다.
