Backend scaffold for TaktX Console

Modules:
- shared: DTOs and shared types
- ingester: Quarkus app consuming Kafka and (eventually) writing to Cassandra
- runway-backend: Quarkus app exposing REST and WebSocket endpoints for the UI

How to run (once you have a Gradle wrapper or Gradle installed):
- Build all: ./gradlew build
- Run dev for ingester: ./gradlew :ingester:quarkusDev
- Run dev for runway-backend: ./gradlew :runway-backend:quarkusDev

Next steps:
- Add Gradle wrapper if you want reproducible Gradle runtime
- Wire real Kafka and Cassandra in application.yaml
rootProject.name = "taktx-console-backend"

include("shared")
include("ingester")
include("runway-backend")

