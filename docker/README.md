# TaktX Community Console - Docker Setup

This document describes how to build and run the Apache 2.0 open-source TaktX Community Console using Docker Compose.

## Overview

The TaktX Community Console consists of four main services:
- **Platform Service**: Quarkus-based Java BFF (Backend for Frontend) that manages process definitions and exposes the REST API to the frontend
- **Ingester (In-Memory)**: Quarkus-based Java service that pushes data into the TaktX Engine via Kafka
- **Frontend**: Next.js React application providing the UI
- **Nginx** (recommended): Reverse proxy that serves frontend and backend from the same origin, eliminating CORS

> **Community edition limitation:** the shipped ingester is the **in-memory** variant.
> Configuration and data handled by it are **lost after restart**. Persisted ingester
> variants are planned separately and require **TaktX Control Console** capabilities
> such as multi-tenancy, RBAC, signing, and validation.

The community edition is intentionally scoped as a lightweight setup for development,
testing, demos, and evaluation. It supports only:

- a single namespace
- a single ingester (`ingesters:inmemory`)
- the in-memory ingester variant

It does **not** include:

- identity provider integration
- RBAC
- signing features
- validation features

For that reason, it is appropriate for testing/evaluation and only limited
production scenarios where those constraints are acceptable.

## Prerequisites

- Docker 20.10 or later
- Docker Compose 2.0 or later
- For development: JDK 21+ and Node.js 20+

## Quick Start

### Recommended: Using Nginx Reverse Proxy (No CORS)

The nginx reverse proxy serves both frontend and backend from the same origin, completely eliminating CORS issues.

```bash
cd docker
docker compose --profile console up -d
```

**Access the application at: http://localhost:3002** ← Single entry point, no CORS! ✅

### Alternative: Direct Access

For development or debugging, you can access services directly without going through nginx:

- Frontend: http://localhost:3001
- Platform Service (BFF): http://localhost:8080
- Ingester: http://localhost:8084
- Nginx: http://localhost:3002 (recommended entry point)

Note: Accessing the frontend directly at :3001 while the backend is at :8080 requires CORS to be enabled on the platform service.

## Architecture Options

### Option 1: Nginx Reverse Proxy (Recommended)
```
Browser → Nginx (3002) → Frontend + Platform Service (same origin, no CORS)
```
✅ Recommended local and evaluation setup, no CORS issues, single entry point

### Option 2: Direct Access
```
Browser → Frontend (3001)
Browser → Platform Service (8080) ← Requires CORS
```
⚠️ Development/debugging only, CORS must be configured on the platform service

## Using Pre-built Images from GitHub Container Registry

**Start Full Stack (including TaktX Engine, observability tools):**
```bash
cd docker
docker compose --profile full up -d
```

**Start Console Only (without TaktX Engine):**
```bash
cd docker
docker compose --profile console up -d
```

This starts:
- Kafka (message broker) — required
- TaktX Platform Service — BFF / REST API
- TaktX Ingester (In-Memory) — Kafka producer
- TaktX Community Console Frontend — UI
- Nginx — reverse proxy

Because the community ingester is in-memory, restarting or recreating the ingester
container resets its stored data/configuration.

Access the console at: http://localhost:3002

**Start with observability tools (Kafka UI, Prometheus, Grafana):**
```bash
cd docker
docker compose --profile console --profile observability up -d
```

### Building Images Locally

To build the images locally instead of pulling from GHCR:

```bash
cd docker
docker compose --profile console up -d --build
```

## Docker Images

### Platform Service Image

**Repository**: `ghcr.io/taktx-io/taktx-community-platform-service`

**Build Process**:
- Multi-stage Quarkus build using the project's Gradle wrapper
- Builds the `platform-service` module

**Environment Variables**:
- `QUARKUS_HTTP_PORT` — HTTP port (default: `8080`)
- `QUARKUS_HTTP_CORS_ENABLED` — Enable CORS (default: `false` when behind nginx)
- `BOOTSTRAP_SERVERS` — Kafka bootstrap servers
- `TAKTX_ENGINE_TENANT_ID` — TaktX tenant ID
- `TAKTX_ENGINE_NAMESPACE` — TaktX namespace
- `TAKTX_PLATFORM_INGESTER_URL` — Internal URL of the ingester service

**Exposed Ports**: 8080

### Ingester (In-Memory) Image

**Repository**: `ghcr.io/taktx-io/taktx-community-ingester-inmemory`

**Build Process**:
- Multi-stage Quarkus build using the project's Gradle wrapper
- Builds the `ingesters:inmemory` module

**Environment Variables**:
- `QUARKUS_HTTP_PORT` — HTTP port (default: `8084`)
- `TAKTX_PLATFORM_URL` — Internal URL of the platform service
- `BOOTSTRAP_SERVERS` — Kafka bootstrap servers
- `TAKTX_ENGINE_TENANT_ID` — TaktX tenant ID (must match engine)
- `TAKTX_ENGINE_NAMESPACE` — TaktX namespace (must match engine)

**Exposed Ports**: 8084

### Frontend Image

**Repository**: `ghcr.io/taktx-io/taktx-community-console-frontend`

**Build Arguments**:
- `NEXT_PUBLIC_PLATFORM_SERVICE_URL` — Platform Service URL baked in at build time.
  Leave empty (default) when deploying behind nginx — the browser uses relative URLs
  and nginx proxies `/api/*` to the platform service. Set to an absolute URL (e.g.
  `http://localhost:8080`) only for builds that will run without a reverse proxy.

**Environment Variables**:
- `PORT` — HTTP port (default: `3000`)
- `NODE_ENV` — Node environment (default: `production`)

**Exposed Ports**: 3000

## Building Images Manually

### Platform Service

```bash
cd backend
docker build -f platform-service/Dockerfile -t taktx-community-platform-service:local .
```

### Ingester (In-Memory)

```bash
cd backend
docker build -f ingesters/inmemory/Dockerfile -t taktx-community-ingester-inmemory:local .
```

### Frontend

```bash
cd frontend
# Default: empty URL → relative API calls via nginx (works on any domain)
docker build -t taktx-community-console-frontend:local .

# Or: explicit URL for builds that run without a reverse proxy
docker build \
  --build-arg NEXT_PUBLIC_PLATFORM_SERVICE_URL=http://localhost:8080 \
  -t taktx-community-console-frontend:local .
```

## CORS Configuration

When using the nginx reverse proxy (recommended), CORS is not needed because the browser
sees a single origin. The platform service has `QUARKUS_HTTP_CORS_ENABLED=false` by default.

For direct-access setups (no nginx), enable CORS on the platform service:

```yaml
environment:
  - QUARKUS_HTTP_CORS_ENABLED=true
  - QUARKUS_HTTP_CORS_ORIGINS=http://localhost:3001
```

## Networking

All services run on the default Docker network created by Docker Compose. Services communicate using container names:

- Frontend → Platform Service: controlled by `NEXT_PUBLIC_PLATFORM_SERVICE_URL` build arg (empty = relative URLs via nginx)
- Platform Service → Ingester: `http://taktx-ingester-inmemory:8084`
- Platform Service → Kafka: `kafka:9094`
- Ingester → Kafka: `kafka:9094`

## Development and Deployment Notes

### Local Development Mode (Native)

For local development without Docker, run the services natively:

**1. Start Platform Service:**
```bash
cd backend
./gradlew :platform-service:quarkusDev
```
Platform Service will run at: http://localhost:8080

**2. Start Ingester:**
```bash
cd backend
./gradlew :ingesters:inmemory:quarkusDev
```
Ingester will run at: http://localhost:8084

**3. Start Frontend:**
```bash
cd frontend/taktx-console
npm run dev
```
Frontend will run at: http://localhost:3001

**Configuration:**

The frontend needs to know where the platform service is. In local dev there is no nginx, so you must set the URL explicitly:

1. Copy the example environment file:
   ```bash
   cd frontend/taktx-console
   cp .env.example .env.local
   ```

2. Ensure `.env.local` contains:
   ```dotenv
   NEXT_PUBLIC_PLATFORM_SERVICE_URL=http://localhost:8080
   ```

3. Restart the frontend dev server.

### Docker Runtime Mode

Use Docker Compose as described above. The images are container-ready with:
- Multi-stage builds for smaller image sizes
- Non-root users for security
- Health checks
- Proper dependency management

However, the community-edition ingester remains in-memory, so this stack should be
treated as a development, demo, and evaluation deployment unless data loss on
ingester restart is acceptable.

## Troubleshooting

### Backend fails to start

Check Kafka connectivity:
```bash
docker compose logs kafka
docker compose logs taktx-platform-service
docker compose logs taktx-ingester-inmemory
```

### Frontend can't connect to backend

1. Verify the platform service is running and healthy:
```bash
curl http://localhost:8080/health/ready
```

2. If not using nginx, check that CORS is enabled on the platform service.

3. Verify environment variables in the running container:
```bash
docker compose exec taktx-console-frontend env | grep NEXT_PUBLIC
```

### WebSocket connection issues

WebSocket connections are established via a BFF token exchange:
1. The frontend calls `GET /api/runway/ws-token` on the platform service to obtain a short-lived token and WebSocket URL.
2. The frontend opens the WebSocket using that URL and token.

In Docker (nginx mode) all traffic is proxied from the same origin — no extra configuration needed.
In local dev mode, ensure `NEXT_PUBLIC_PLATFORM_SERVICE_URL=http://localhost:8080` is set in `.env.local`.

## Image Publishing

The compose file defaults to pulling images from GitHub Container Registry under:

- `ghcr.io/taktx-io/taktx-community-platform-service`
- `ghcr.io/taktx-io/taktx-community-ingester-inmemory`
- `ghcr.io/taktx-io/taktx-community-console-frontend`

If you build locally, `docker compose ... --build` uses the checked-out source tree instead.

## Security Considerations

1. **Non-root users**: All images run as non-root users
2. **Secrets**: Never include sensitive data in images
3. **CORS**: Keep `QUARKUS_HTTP_CORS_ENABLED=false` behind a reverse proxy; restrict origins when enabling
4. **Network**: Use Docker networks to isolate services
5. **Updates**: Regularly update base images and dependencies

## License

This repository is licensed under the Apache License 2.0. See the root [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE) files for details.

