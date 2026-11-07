# SOLQ Android — development candidate

A minimal Kotlin Android WebView shell for https://solqtech.com/.

## Build
Open this folder in Android Studio with JDK 17 and Android SDK 35. The existing local project's Gradle 9.6.0 wrapper is now included. AGP 8.7.3 and Kotlin 2.0.21 are retained. The previous project built with this combination; candidate full Gradle build is currently blocked by the execution environment. This is not a claim of officially supported AGP/Gradle compatibility. Source/resource compilation and 15 navigation tests passed. See RELEASE-READINESS.md.

Run `gradlew.bat :app:assembleDebug :app:lintDebug :app:bundleRelease`. Expected outputs are app/build/outputs/apk/debug/app-debug.apk and app/build/outputs/bundle/release/app-release.aab. The candidate was not packaged; the previously verified APK predates these source changes.

The release bundle is unsigned unless all SOLQ_UPLOAD_* environment variables in RELEASE-READINESS.md are supplied securely. No debug signing fallback is configured. Configure SDK path locally; local.properties, keys, secrets and build caches are excluded from source delivery.

Candidate changes: native home/refresh/privacy navigation; loading/error/retry; system-bar insets; exact trusted hosts; restricted user-initiated external links; Android 13+ back dispatch; content-picker multi-select and cancellation; no third-party cookies, cleartext, file URL access, mixed content, backup or release WebView debugging. Proposed vector Q icon and system splash included. No backend or website change.

API 35 is retained and does NOT meet the current Play API 36 submission requirement. This project is a development candidate, not a store-ready final release.

## Before production / Google Play
- Confirm ownership and Play Console app ID / signing configuration.
- Evaluate Trusted Web Activity (TWA) with Digital Asset Links or a richer native app; a simple WebView-only shell may not satisfy Play quality/functionality review.
- Test login, customer application, receipt-number display, Android back, file uploads, privacy disclosures, accessibility, network loss, and external links.
- Implement privacy policy, data safety declarations, versioning, icons, splash, and release signing.
- Do not embed Supabase service-role keys or admin secrets.
- Do not publish or change live website without explicit authorization.
