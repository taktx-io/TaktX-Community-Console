plugins {
    java
    alias(libs.plugins.spotless)
}

allprojects {
    repositories {
        mavenLocal()
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "java")

    group = "io.taktx.console"
    version = "0.4.0-beta-1"

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

