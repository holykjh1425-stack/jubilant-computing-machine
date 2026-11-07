# SOLQ Android — API 36 development candidate

Open this directory in Android Studio: `android/solq-android-starter` (the folder containing settings.gradle.kts).

## Toolchain

- JDK/JVM target 17; Android SDK platform 36, Build Tools 35.0.0.
- Android Gradle Plugin 8.11.1, Gradle Wrapper 8.13 (distribution SHA-256 pinned), Kotlin Gradle plugin 2.2.21.
- AndroidX Activity 1.10.1; minimum API 26, target/compile API 36.
- Use an Android Studio version supporting AGP 8.11, such as Narwhal 2025.1.1 or a compatible newer release.

Configure the local SDK in Android Studio; do not commit local.properties. On Windows, run from this directory:

```powershell
.\gradlew.bat :app:assembleDebug :app:bundleRelease :app:lintDebug
```

Latest Work clean build: PASS, exit 0, 84.33 seconds, observed 2026-11-07 KST. APK signature and AAB structure validation PASS. lintDebug: 0 errors / 7 warnings. See RELEASE-READINESS.md and build-evidence/ for exact limits. Android Studio GUI Sync and Android device runtime tests were not performed.

Outputs:
- app/build/outputs/apk/debug/app-debug.apk — development/debug signed; not a Play upload artifact.
- app/build/outputs/bundle/release/app-release.aab — unsigned unless all SOLQ_UPLOAD_* settings are supplied securely. The delivered bundle is unsigned.

No new upload key was created, no Play upload/publishing was performed. The platform's local debug signing key was used for the debug APK and is not included in delivery. Never use it as an upload key.

## Scope and limitations

This WebView candidate keeps SOLQ home/privacy navigation, loading/error/retry, bounded external links and file selection. Back handling now uses lifecycle-aware AndroidX OnBackPressedDispatcher. Cloud and device-transfer backup exclusions are explicit. Launch/store Q assets are drafts.

Device tests for Android 15/16, large fonts, accessibility, file selection/cancel, offline recovery and actual application/receipt flow remain blocked by lack of an attached device/emulator and an approved isolated submission target. Do not submit a production application just to test the app.

Release: **NO-GO** until runtime/security/privacy review, upload signing and separate Owner submission approval. Preserve operating website v29, DB, security settings and main. Existing navigation 15 PASS evidence from baseline 5396c628 was reused; it is not a device test.

Store text, data-safety candidates, artwork and internal-test checklist: play/PLAY-PREPARATION.md. All drafts require Owner confirmation.
