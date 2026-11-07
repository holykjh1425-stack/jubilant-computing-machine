# SOLQ Android 최신 빌드·출시 준비 — 2026-11-07 KST

실행자: 기존 ChatGPT Work 직접 실행. 별도 워커 실행·독립 검토를 주장하지 않습니다.
기준: 5396c62894e51c4c1f2cdb6eb967898a0a960d25. 기존 수정 전 APK는 최신 증거로 사용하지 않았습니다.

## 현재 판정

**최신 후보 빌드·구조 검증 PASS / 설치·실행 BLOCKED / Play 제출·공개 NO-GO.**

|검증|결과·증거|
|---|---|
|공식 호환성|AGP 8.11.1 / Gradle 8.13 / Kotlin 플러그인 2.2.21 / JDK·Java·Kotlin JVM 17. AGP 8.11은 API 36 지원; KGP 공식 지원 범위의 조합 선택|
|SDK|SDK 36 r02, Build Tools 35.0.0, Platform Tools 37.0.2 공식 파일 준비 및 공식 체크섬 대조|
|JDK|Temurin 17.0.21+9 공식 배포 SHA-256 대조. 기존 시스템 Java 변경 없이 Work 작업 폴더에서만 사용|
|최종 빌드|:app:clean → assembleDebug / bundleRelease / lintDebug 및 wrapper 재생성. 종료 코드 0, 84.33초, BUILD SUCCESSFUL. build-evidence/gradle-build.log, build-result.json|
|Gradle 구성|실제 CLI 프로젝트 구성·패키징 PASS. Android Studio GUI Sync는 미실행|
|APK|ZIP CRC·aapt2 패키지/API 확인·apksigner v2 검증 PASS. 실제 설치는 미검증|
|AAB|bundletool 1.18.3 validate 및 manifest 확인 PASS. target 36, release debuggable=false, 네이티브 .so 0건. jarsigner는 unsigned 확인|
|lint|0 errors / 7 warnings. 경고를 없애기 위한 전역 suppress/baseline/abortOnError 완화 없음|
|기기|ADB 실행 성공, 연결 기기 0건. 기존 에뮬레이터/실기기 없음, /dev/kvm 부재. 소프트웨어 에뮬레이터 가능성 자체를 불가능하다고 단정하지 않음; 이번 실행에는 구성/실행하지 않음|
|개인정보 URL|이번 Work 공개 HTTP 요청 403, 내용 재확인 BLOCKED. 기존 데스크톱 검증과 구분하며 사이트 장애로 단정하지 않음|
|운영 영향|운영 홈페이지 v29, Supabase, main, 고객 기록 변경 0. 신청 제출 0, 유료 API/Play 업로드/신규 결제 0|

## 최종 산출물

- `app-debug.apk`: 2,241,006 bytes; SHA-256 `f9b33fc470966734f2853d1438ffbb6e7bd95bccc6140fdb886247ca22d41ac0`.
- `app-release.aab`: 1,683,208 bytes; SHA-256 `ae143e4ef8907a0f3d4726a06f129145acb1e40ac576669b098c26b95cee1865`.

관측 시각: 2026-11-07T14:31:27.214332+09:00. build-evidence/artifact-results.json 및 source-inputs.json에 바이너리·빌드 입력 지문 기록. 원래 15개 탐색 테스트 증거는 유지하며 불필요하게 재실행하지 않았습니다. AndroidX 전환 이후 실제 제스처 동작 PASS를 의미하지 않습니다.

## 해결한 오류와 잔여 경고

- 최초 Java는 실행 환경만 있고 javac가 없어 컴파일 차단. 작업 폴더의 정식 JDK 17로 해소.
- Java 의존성 연결은 환경에 이미 구성된 무인증 프록시 및 시스템 CA를 사용. TLS 검증을 끄거나 권한 정책을 우회하지 않음. Adoptium API 403은 공식 GitHub 배포본·공식 체크섬으로 대체; 비공식 미러 미사용.
- API 36 lint GestureBackNavigation 오류: ComponentActivity + 생명주기 OnBackPressedDispatcher로 수정, 레거시 onBackPressed 재정의 제거.
- 백업 제외 XML과 단색 아이콘 추가. 수정 도중 증분 DEX 중간 산출물에서 R$drawable 중복이 발생했으나, 소스에 중복 선언 없음 확인 후 프로젝트 clean 빌드로 해소. 운영 파일/데이터 정리 없음.
- 남은 lint: SetJavaScriptEnabled 1건(서비스 JS 필요, 신뢰 호스트/혼합 콘텐츠·file 접근/SSL 기본 검증 유지; 실제 웹 XSS·외부 링크 경계 검토 미완료), UnusedAttribute 1건(API33 back opt-in, 구버전 무시), ObsoleteSdkInt 1건(이동 후 비어 있는 로컬 v26 디렉터리 관련; Git은 빈 폴더를 저장하지 않음), UseKtx 4건(문자열 URI 변환 스타일 권고).
- Kotlin 컴파일러의 기존 파일 선택 onActivityResult 사용 중단 예정 경고도 남음. 현재 호환 경로를 유지했으며 파일 선택·취소의 실기기 확인 필요. lint 7건과 별도로 구분.

## 서명·실행·제출 차단 사항

- SOLQ_UPLOAD_* 설정은 이 빌드 환경에 없음. 키·비밀번호 내용 검색·출력/새 업로드키 생성 없음. AAB의 signReleaseBundle 작업명이 출력되더라도 jarsigner 결과가 unsigned이므로 서명 완료로 간주하지 않음.
- 디버그 APK는 개발용 로컬 debug 키로 서명. 비밀 키 파일은 소스/산출물 ZIP/공개 저장소에 포함하지 않음. 다른 PC의 기존 업로드키가 없다고 단정하지 않음.
- Android 15·16 UI/뒤로 가기/오프라인 복구/큰 글꼴/TalkBack/파일 첨부·취소/개인정보 링크: BLOCKED. 실제 기기 또는 에뮬레이터 실행 증거 필요.
- 운영 신청·접수번호 생성 테스트: 미실행. 별도 승인된 격리 대상 없이는 제출하지 않음.
- 스토어 512×512 아이콘·1024×500 그래픽 및 문안·데이터 보안·연령·서명 체크리스트 초안 준비. 실제 스크린샷 미확보. 미확정 신고 답변을 임의 확정하지 않음.
- versionCode 1의 기존 Play 업로드 이력/패키지 소유권 미확인. 기존 이력이 있으면 더 높은 값 확정 필요.
- 최소 다음 조치: Android Studio/기기에서 최신 APK의 읽기 중심 기능 실행 확인. 제출·접수 생성은 격리 대상으로 별도 승인 후 실시. 업로드키는 기존 보호 경로로 Owner 확인, 신규 키 필요 시 별도 승인. 내부 테스트 업로드 및 공개는 각각 승인 전 금지.

추가 결제·유료 자원 생성 0. Work 사용량/기존 구독 전체 청구를 0원이라고 검증한 것은 아닙니다.

공식 근거: README.md 도구 버전과 play/PLAY-PREPARATION.md 링크 참조.

---

## 이전 후보의 역사적 기록 — 아래 차단 내용 중 도구/API/패키징은 위 최신 결과로 대체

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
