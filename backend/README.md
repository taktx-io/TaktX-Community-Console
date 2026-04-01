# TaktX Community Console — Backend

Quarkus-based backend for the TaktX Community Console.

## Modules

| Module | Gradle target | Port | Role |
|---|---|---|---|
| `platform-service` | `:platform-service` | 8080 | BFF — community-edition REST API exposed to the frontend; manages process definitions and runtime proxying |
| `ingesters:inmemory` | `:ingesters:inmemory` | 8084 | Kafka producer — pushes TaktX configuration (license, signing keys, process definitions) to the engine at startup; community-edition in-memory variant, so data/configuration is lost on restart |

> **Important:** the community edition currently ships only with the in-memory ingester.
> Persisted ingester variants are planned separately and require the full
> **TaktX Control Console** feature set, including multi-tenancy, RBAC, signing,
> and validation.

The backend in this repository is intentionally scoped for the community edition:

- single namespace / single ingester setup
- no identity provider integration
- no RBAC
- no signing features
- no validation features

It is primarily intended for development, testing, and evaluation, with only
limited production suitability where those constraints are acceptable.

## Adaptive retention in `ingesters:inmemory`

The in-memory ingester retains process-instance state for the Runway and API read
 paths, but it now applies **adaptive retention** so memory use remains bounded.

### What gets evicted

Eviction is intentionally conservative:

- only **terminal** instances are eligible
- terminal means `COMPLETED` or `ABORTED`
- instances with an **incident** are **not** evicted
- eviction removes the full retained in-memory bundle for that instance, including
  the process-instance view, retained variables, flow-node state/history, and the
  ingester-side aggregate contribution derived from that instance

In practice, the store evicts the **oldest eligible terminal instances first**.

### When eviction runs

Retention runs on a fixed interval and evaluates four pressure signals:

- JVM heap usage ratio
- retained terminal instance count
- retained flow-node update count
- estimated retained bytes

Eviction starts when either:

- heap usage reaches the configured high watermark, or
- retained state exceeds one of the dynamic caps

The default configuration is intentionally conservative:

- check interval: `PT30S`
- minimum terminal age: `PT5M`

So with the defaults, an eligible completed/aborted instance is typically removed
 **no sooner than about 5 minutes after completion/abort**, and then only on a later
 retention sweep if the ingester is above one of its retention thresholds.

### Configuration

The ingester reads the following retention settings:

| Property | Default | Meaning |
|---|---:|---|
| `taktx.ingester.retention.enabled` | `true` | Enables adaptive retention |
| `taktx.ingester.retention.check-interval` | `PT30S` | How often the retention controller runs |
| `taktx.ingester.retention.heap-target-watermark` | `0.65` | Below this heap usage, dynamic caps stay near their max |
| `taktx.ingester.retention.heap-high-watermark` | `0.80` | At or above this heap usage, the minimum caps apply and eviction may trigger immediately |
| `taktx.ingester.retention.min-terminal-instances` | `5000` | Lower bound for retained terminal instances under pressure |
| `taktx.ingester.retention.max-terminal-instances` | `25000` | Upper bound for retained terminal instances when healthy |
| `taktx.ingester.retention.min-flow-node-updates` | `150000` | Lower bound for retained flow-node updates under pressure |
| `taktx.ingester.retention.max-flow-node-updates` | `750000` | Upper bound for retained flow-node updates when healthy |
| `taktx.ingester.retention.min-retained-bytes` | `268435456` | Lower retained-byte budget (256 MiB) under pressure |
| `taktx.ingester.retention.max-retained-bytes` | `1073741824` | Upper retained-byte budget (1 GiB) when healthy |
| `taktx.ingester.retention.evict-batch-size` | `250` | Maximum number of eligible instances removed per sweep iteration |
| `taktx.ingester.retention.min-terminal-age` | `PT5M` | Minimum time an eligible terminal instance must stay terminal before eviction |

Quarkus / MicroProfile Config also supports overriding these with environment
 variables, for example:

- `TAKTX_INGESTER_RETENTION_CHECK_INTERVAL=PT5S`
- `TAKTX_INGESTER_RETENTION_MIN_TERMINAL_AGE=PT10S`
- `TAKTX_INGESTER_RETENTION_MAX_TERMINAL_INSTANCES=1000`

### Fast manual-test settings

To make retention visible within seconds in local development, use a deliberately
 small cap and short delays:

```bash
export TAKTX_INGESTER_RETENTION_ENABLED=true
export TAKTX_INGESTER_RETENTION_CHECK_INTERVAL=PT1S
export TAKTX_INGESTER_RETENTION_MIN_TERMINAL_AGE=PT2S
export TAKTX_INGESTER_RETENTION_EVICT_BATCH_SIZE=10
export TAKTX_INGESTER_RETENTION_MIN_TERMINAL_INSTANCES=2
export TAKTX_INGESTER_RETENTION_MAX_TERMINAL_INSTANCES=2
export TAKTX_INGESTER_RETENTION_MIN_FLOW_NODE_UPDATES=1000000
export TAKTX_INGESTER_RETENTION_MAX_FLOW_NODE_UPDATES=1000000
export TAKTX_INGESTER_RETENTION_MIN_RETAINED_BYTES=1073741824
export TAKTX_INGESTER_RETENTION_MAX_RETAINED_BYTES=1073741824
```

Then start the ingester locally:

```bash
cd backend
./gradlew :ingesters:inmemory:quarkusDev
```

With that setup, once you create more than two incident-free completed/aborted
 instances, the oldest eligible one should usually disappear after roughly
 **2-3 seconds**.

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
