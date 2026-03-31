plugins {
    id("java")
    alias(libs.plugins.spotless)
    alias(libs.plugins.quarkus)
}

dependencies {
    // Quarkus Core
    implementation(enforcedPlatform(libs.quarkus.bom.get()))
    implementation(libs.quarkus.arc)

    // REST
    implementation(libs.quarkus.rest)
    implementation(libs.quarkus.rest.jackson)

    implementation(libs.quarkus.smallrye.health)
    implementation(libs.quarkus.hibernate.validator)

    // Caching
    implementation(libs.quarkus.cache)

    // Scheduler for background tasks
    implementation(libs.quarkus.scheduler)

    // HTTP Client for proxying requests to ingesters
    implementation(libs.quarkus.rest.client.jackson)

    // Lombok
    compileOnly(libs.lombok)
    annotationProcessor(libs.lombok)

    // Testing
    testImplementation(libs.quarkus.junit5)
    testImplementation(libs.quarkus.junit5.mockito)
    testImplementation(libs.rest.assured)
    testImplementation(libs.quarkus.test.security)
    testImplementation(libs.assertj.core)
    testImplementation(libs.wiremock)
}

quarkus {
    setFinalName("platform-service")
}

spotless {
    java {
        googleJavaFormat()
    }
}
