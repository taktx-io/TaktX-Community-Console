plugins {
    java
    alias(libs.plugins.spotless)
}

val taktxVersion = providers.gradleProperty("taktxVersion")
    .orElse(providers.environmentVariable("TAKTX_APP_VERSION"))
    .orElse("0.0.0-dev")
    .get()

allprojects {
    version = taktxVersion

    repositories {
        mavenLocal()
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "java")

    group = "io.taktx.console"

    java {
        toolchain {
            languageVersion.set(JavaLanguageVersion.of(21))
        }
    }

    tasks.withType(JavaCompile::class.java).configureEach {
        options.encoding = "UTF-8"
    }

}

spotless {
    java {
        googleJavaFormat()
    }
}

