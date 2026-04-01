# TaktX Community Console — Backend

Quarkus-based backend for the TaktX Community Console.

## Modules

| Module | Gradle target | Port | Role |
|---|---|---|---|
| `platform-service` | `:platform-service` | 8080 | BFF — REST API exposed to the frontend; validates JWTs, manages process definitions, issues WebSocket tokens |
| `ingesters:inmemory` | `:ingesters:inmemory` | 8084 | Kafka producer — pushes TaktX configuration (license, signing keys, process definitions) to the engine at startup |

## Prerequisites

| Tool | Minimum version |
|---|---|
| JDK | 21 |
| Docker | 20.10 (for running Kafka locally) |

## Running Locally (Quarkus Dev Mode)

Start Kafka first (or use the Docker Compose stack):

```bash
cd ../docker
docker compose up kafka -d
```

**Platform Service (port 8080):**
```bash
cd backend
./gradlew :platform-service:quarkusDev
```

**Ingester In-Memory (port 8084):**
```bash
cd backend
./gradlew :ingesters:inmemory:quarkusDev
```

Quarkus Dev Mode provides live reload — changes to source files are picked up automatically without a restart.

## Build

```bash
./gradlew build
```

Runs compilation, tests, and Spotless format checks.

## Tests

```bash
./gradlew test
```

## Code Formatting

The project uses [Spotless](https://github.com/diffplug/spotless) with Google Java Format:

```bash
./gradlew spotlessApply   # auto-format
./gradlew spotlessCheck   # check only (run in CI)
```

## Docker Images

Each module has its own `Dockerfile` for multi-stage builds:

- `platform-service/Dockerfile`
- `ingesters/inmemory/Dockerfile`

See [`../docker/README.md`](../docker/README.md) for build and deployment instructions.
