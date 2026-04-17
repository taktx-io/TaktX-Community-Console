// Common configuration for ingester submodules (cassandra, inmemory)

description = "Common configuration for ingester submodules"

subprojects {
    repositories {
        mavenLocal()
        mavenCentral()
    }

    group = "io.taktx.console.ingesters"


    tasks.withType(JavaCompile::class.java).configureEach {
        options.encoding = "UTF-8"
    }

    tasks.withType(Test::class.java).configureEach {
        useJUnitPlatform()
    }
}
