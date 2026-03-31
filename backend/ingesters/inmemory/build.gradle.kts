plugins {
    id("java")
    alias(libs.plugins.spotless)
    alias(libs.plugins.quarkus)
}
dependencies {
    implementation(libs.taktx.client.quarkus)
//    implementation(libs.taktx.shared)
    implementation(enforcedPlatform(libs.quarkus.camel.bom.get()))
    implementation(enforcedPlatform(libs.quarkus.bom.get()))
    implementation(libs.quarkus.arc)
    implementation(libs.quarkus.resteasy.jackson)
    implementation(libs.quarkus.jackson)
    implementation(libs.quarkus.websockets)
    implementation(libs.quarkus.hibernate.validator)
    implementation(libs.quarkus.smallrye.health)
    implementation(libs.quarkus.resteasy.client)

    // JWT for authorization token validation
    implementation(libs.jjwt.api)
    runtimeOnly(libs.jjwt.impl)
    runtimeOnly(libs.jjwt.jackson)

    testImplementation(libs.quarkus.junit5)
    testImplementation(libs.quarkus.junit5.mockito)
    testImplementation(libs.assertj.core)
    testImplementation(libs.quarkus.test.security)
    testImplementation(libs.testcontainers.kafka)
    testImplementation(libs.testcontainers.junit.jupiter)
    // Tyrus (Jakarta WS client) for WebSocket integration tests
    testImplementation(libs.tyrus.standalone.client)
    compileOnly(libs.lombok)
    annotationProcessor(libs.lombok)
}
quarkus {
    setFinalName("ingester-inmemory")
}
spotless {
    java {
        googleJavaFormat()
    }
}
