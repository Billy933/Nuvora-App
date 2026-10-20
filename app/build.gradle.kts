plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val releaseStorefrontUrl = providers.gradleProperty("nuvoraUrl").orNull ?: ""
android {
    namespace = "com.example.deliveryapp"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.example.deliveryapp"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            val storefrontUrl = providers.gradleProperty("nuvoraDevUrl").orNull ?: "https://nuvora-app-one.vercel.app"
            buildConfigField("String", "STOREFRONT_URL", "\"$storefrontUrl\"")
        }
        release {
            buildConfigField("String", "STOREFRONT_URL", "\"$releaseStorefrontUrl\"")
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        buildConfig = true
        compose = true
    }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    val configuredUrl = releaseStorefrontUrl
    doFirst {
        require(configuredUrl.matches(Regex("https://[a-zA-Z0-9.-]+(:[0-9]+)?/?"))) {
            "Set -PnuvoraUrl=https://your-deployed-nuvora-domain for release builds"
        }
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
