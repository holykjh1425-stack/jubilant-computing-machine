# SOLQ 출시 준비 상태 — 2026-11-07 KST

상태: 개발 후보본. Google Play 제출 준비 완료가 아닙니다.

## 검증 증거

- 기존 APK 빌드·v2 서명 PASS는 수정 전 기능 버전의 증거이며 새 후보 소스의 빌드 결과가 아닙니다.
- 후보본: aapt2 리소스 컴파일·연결 PASS. Manifest는 AGP namespace 주입을 모사한 임시본으로 연결했습니다.
- 후보본: Kotlin 2.0.21/Android API 35/JVM 17 소스 컴파일 PASS. R/BuildConfig 기호를 생성하여 사용했습니다. Gradle 구성·패키징·실행 검증을 대신하지 않습니다.
- 탐색 허용목록 JVM 테스트 15개 PASS. tests/navigation-test.kt 참고.
- Gradle assembleDebug/bundleRelease/lintDebug는 데몬 연결 단계에서 실패했습니다. 신규 APK/AAB 없음. lint와 Android Studio Sync 미검증.
- 공개 홈페이지·신청 폼·필수 동의·개인정보 방침은 데스크톱 브라우저에서 확인했습니다. 실제 신청·접수번호 발급·파일 업로드는 제출하지 않았습니다.
- ADB 시작/연결 실패. 에뮬레이터·실기기 실행 미검증. 권한 확대 자동 거부.

## 출시 차단 사항

1. 현재 신규 휴대전화 앱·업데이트는 API 36 이상 필수입니다. 이 후보는 기존 SDK 35/AGP 8.7.3을 보존합니다. 로컬 SDK 36 부재 및 다운로드 제한으로 업그레이드를 완료하지 못했습니다. API 36을 지원하는 AGP(최소 8.9.1) 및 공식 호환 Gradle로 함께 전환하고 회귀 검증해야 합니다. API 35 AAB를 Play 제출용으로 사용하면 안 됩니다.
2. 기존 업로드 서명키를 찾지 못했습니다. 접근 가능한 프로젝트·Documents·Downloads·SOLQ-SOURCE·SOLQ-BACKUP·SOLQ-SECRETS의 파일명과 SOLQ_UPLOAD_* 환경변수 이름만 확인했습니다. 다른 장소에 키가 없다는 뜻은 아닙니다. 비밀 파일·키 내용·비밀번호를 열람하지 않았습니다.
3. 전체 Gradle 빌드, lint, UI Sync, 실기기·에뮬레이터 실행, AAB 구조·서명 검증 미완료입니다.
4. 격리된 테스트 환경에서 상담 제출·접수번호·파일 첨부/취소·외부 앱·오프라인 복구·화면 회전·Android 13+ 뒤로 가기·Android 15/16 화면 여백·큰 글꼴·TalkBack을 검증해야 합니다.
5. WebView 기반 서비스이므로 사이트 소유자 승인과 실질적인 고객 서비스 기능·품질을 확인해야 합니다. 단순 포장만으로 Play 통과가 보장되지 않습니다.

## 안전한 서명 설정

SOLQ_UPLOAD_STORE_FILE이 없으면 릴리스는 미서명입니다. debug 키로 자동 대체하지 않습니다. 기존 키를 확인한 뒤 승인된 비밀 저장소/안전한 로컬 프로세스에서 다음 환경변수를 공급합니다. 값은 보고서·GitHub·ZIP·명령 인자·채팅에 넣지 않습니다.

- SOLQ_UPLOAD_STORE_FILE: 기존 업로드 키 파일 절대 경로
- SOLQ_UPLOAD_STORE_PASSWORD
- SOLQ_UPLOAD_KEY_ALIAS
- SOLQ_UPLOAD_KEY_PASSWORD

새 키가 필요하면 계정 소유자가 키 생성 여부, 보관 위치, 암호화 백업과 복구 담당자를 먼저 승인해야 합니다. Android Studio 또는 JDK keytool의 대화형 입력을 사용하고 비밀번호는 채팅 밖에서 입력합니다. Play App Signing과 업로드 키의 역할을 구분하고, 기존 앱이면 새 키를 임의 대체하지 말고 공식 업로드 키 재설정 절차를 확인합니다. 이번 작업에서 새 키는 생성하지 않았습니다.

## Play Console 체크리스트

- [ ] 개발자 계정·법인·사이트 소유권·기존 com.solqtech.app 등록 상태 확인
- [ ] API 36+ 및 호환 도구 전환, APK/AAB 빌드와 lint 완료
- [ ] 기존 업로드 이력보다 높은 versionCode 확인(이력 미확인으로 1 유지)
- [ ] 운영 고객 데이터 없이 격리 환경에서 전체 기능 회귀 검증
- [ ] 제안한 Q 아이콘·시작 화면 승인, 스토어용 512×512 아이콘·1024×500 그래픽·실제 화면 스크린샷 준비
- [ ] https://solqtech.com/privacy.html 유지 및 앱 WebView·쿠키·세션 저장 처리와 실제 사업자 처리 범위 검토
- [ ] 데이터 보안 신고에서 이름·이메일·요청 본문·동의/접수 기록·문의·선택 첨부·IP/보안 요청 로그의 실제 수집 여부와 목적·필수/선택·보관/삭제·암호화 확인
- [ ] 네이티브 분석 SDK가 없다는 이유로 '수집 없음'으로 신고하지 않기. WebView 안의 실제 처리 포함
- [ ] 수탁 처리와 제3자 공유를 Google 정의로 구분. 처리국가·보유기간·호스팅 계약 미확인 항목은 운영자 확인
- [ ] 광고 여부·대상 연령·콘텐츠 등급·앱 접근 안내·해당 시 계정 삭제 요건 작성
- [ ] 실제 제공 서비스와 웹 결제 흐름의 Play 결제 정책 적합성 확인(이번 작업에서 결제 기능 변경·실행 없음)
- [ ] 업로드 인증서 확인, AAB 서명 및 bundletool 구조 검증, SHA256 보관
- [ ] 별도 업로드 승인 후에만 내부 테스트 트랙 업로드·사전 출시 보고서 확인·계정별 비공개 테스트 요건 이행
- [ ] 공개 출시 별도 승인

## 공식 근거

- https://support.google.com/googleplay/android-developer/answer/11926878?hl=en
- https://developer.android.com/build/releases/about-agp
- https://support.google.com/googleplay/android-developer/answer/9899034?hl=en
- https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
- https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- https://developer.android.com/studio/publish/app-signing

운영 v29·고객 데이터·백엔드 설정·main·관리자 승인 통제·결제·배포는 변경하지 않았습니다.
