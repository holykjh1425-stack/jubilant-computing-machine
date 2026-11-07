# SOLQ Android starter (prototype only)

A minimal Kotlin Android WebView shell for https://solqtech.com/.

## Build
Open this folder in Android Studio with Android SDK 35 installed; sync Gradle and run on emulator/device. Gradle wrapper is not bundled. This project has not been built or tested in this environment.

## Before production / Google Play
- Confirm ownership and Play Console app ID / signing configuration.
- Evaluate Trusted Web Activity (TWA) with Digital Asset Links or a richer native app; a simple WebView-only shell may not satisfy Play quality/functionality review.
- Test login, customer application, receipt-number display, Android back, file uploads, privacy disclosures, accessibility, network loss, and external links.
- Implement privacy policy, data safety declarations, versioning, icons, splash, and release signing.
- Do not embed Supabase service-role keys or admin secrets.
- Do not publish or change live website without explicit authorization.
