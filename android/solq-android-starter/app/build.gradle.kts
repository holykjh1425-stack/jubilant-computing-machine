plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.solqtech.app"
    compileSdk = 36
    buildFeatures { buildConfig = true }

    defaultConfig {
        applicationId = "com.solqtech.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = false
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// Inject secrets from a secure local process, never checked-in files.
val uploadStore = providers.environmentVariable("SOLQ_UPLOAD_STORE_FILE").orNull
if (uploadStore != null) {
    android.signingConfigs.create("upload") {
        storeFile = file(uploadStore)
        storePassword = providers.environmentVariable("SOLQ_UPLOAD_STORE_PASSWORD").get()
        keyAlias = providers.environmentVariable("SOLQ_UPLOAD_KEY_ALIAS").get()
        keyPassword = providers.environmentVariable("SOLQ_UPLOAD_KEY_PASSWORD").get()
    }
    android.buildTypes.getByName("release").signingConfig = android.signingConfigs.getByName("upload")
}

dependencies {
    implementation("androidx.activity:activity:1.10.1")
}
