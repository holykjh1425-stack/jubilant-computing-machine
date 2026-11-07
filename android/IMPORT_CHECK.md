> 최신 상태: 초기 ZIP 인수 기록입니다. 현재 API 36 빌드 결과와 Wrapper 정보는 [RELEASE-READINESS.md](solq-android-starter/RELEASE-READINESS.md)를 우선 확인하세요.

# SOLQ Android source import — 2026-11-07

Source: existing solq-android-starter.zip, version 5. Six original source files imported byte-for-byte; no application behavior modified.

Source ZIP SHA-256: `589f43cb9ebc111789bc74461b49b38f69c13fcdc0f736b52de3b5d60fb0be5e`.

## Open in Android Studio

Select File > Open, then choose `android/solq-android-starter` within the checked-out/downloaded repository. This is the directory containing `settings.gradle.kts`, the root `build.gradle.kts`, and `app/`; do not select the repository root or `app/` alone.

Example after extracting the GitHub branch ZIP into Downloads:
`C:\Users\Atom\Downloads\<extracted repository folder>\android\solq-android-starter`

The actual extracted folder name depends on the download/extraction tool; no PC path has been inspected or created by this import.

## Verification and limits

- ZIP CRC and path traversal checks: PASS.
- AndroidManifest.xml XML parsing: PASS.
- All six original files are UTF-8; no credential/signing/local.properties files included; source manually reviewed for embedded credentials.
- App namespace/applicationId: com.solqtech.app. minSdk 26, compile/target SDK 35.
- Android Gradle Plugin 8.7.3; Kotlin Android plugin 2.0.21.
- Gradle Wrapper is absent in original archive. Opening the folder is distinct from successful Gradle sync/build. A compatible Gradle distribution/wrapper and SDK/JDK configuration must be prepared and verified separately.
- No local Gradle executable or Android build environment was available for this import. Gradle sync, APK build, emulator/device behavior, login, file uploads and Play submission: NOT TESTED.
- Prototype review follow-ups: external URL intent schemes are not explicitly allowlisted; permissions/redirects, file selection and lifecycle/back handling need device/security testing before release. No runtime safety or Play approval claimed.

Only android/ was added on a separate development branch. No main merge, website deployment, Supabase access, operating customer data changes, paid API calls, signing, publishing or new project/service provisioning performed.

