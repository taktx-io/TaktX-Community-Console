# TaktX Console - Docker Setup

This document describes how to build and deploy the TaktX Console using Docker and Docker Compose.

## Overview

The TaktX Console consists of three main services:
- **Backend**: Quarkus-based Java application that interfaces with the TaktX engine
- **Frontend**: Next.js React application providing the UI
- **Nginx** (Optional): Reverse proxy that eliminates CORS issues by serving frontend and backend from the same origin

## Prerequisites

- Docker 20.10 or later
- Docker Compose 2.0 or later
- For development: JDK 21+ and Node.js 20+

## Quick Start

### Recommended: Using Nginx Reverse Proxy (No CORS)

The nginx reverse proxy serves both frontend and backend from the same origin, completely eliminating CORS issues.

```bash
cd docker
docker-compose --profile console up -d
```

**Access the application at: http://localhost:3002** ← Single entry point, no CORS! ✅

See [NGINX_QUICKSTART.md](NGINX_QUICKSTART.md) for details.

### Alternative: Direct Access (CORS Enabled)

For development or debugging, you can access services directly:

```bash
cd docker
docker-compose --profile console up -d
```

- Frontend: http://localhost:3001
- Backend: http://localhost:8084
- Nginx: http://localhost:3002 (recommended)

Note: Direct access requires CORS configuration.

## Architecture Options

### Option 1: Nginx Reverse Proxy (Recommended)
```
Browser → Nginx (3002) → Frontend + Backend (same origin, no CORS)
```
✅ Production-ready, no CORS issues, single entry point

### Option 2: Direct Access
```
Browser → Frontend (3001)
Browser → Backend (8084) ← Requires CORS
```
⚠️ Development/debugging only, CORS must be configured

See [../docs/DOCKER_CORS_ANALYSIS.md](../docs/DOCKER_CORS_ANALYSIS.md) for detailed analysis.

## Using Pre-built Images from GitHub Container Registry

**Start Full Stack (including TaktX Engine):**
```bash
cd docker
docker-compose -f docker-compose-full.yaml up -d
```

**Start Console Only (without TaktX Engine):**
```bash
cd docker
docker-compose -f docker-compose-full.yaml up -d kafka taktx-ingester-inmemory taktx-console-frontend
```

This will start the TaktX Console services. The console backend only requires Kafka to be running - the TaktX Engine service is optional and runs independently.

**Services included:**
- Kafka (message broker) - Required
- TaktX Console Backend - Reads from Kafka topics
- TaktX Console Frontend - Provides the UI
- (Optional) TaktX Engine, Prometheus, Grafana, Cassandra

Access the console at: http://localhost:3001

### Building Images Locally

To build the images locally instead of pulling from GHCR:

```bash
cd docker
docker-compose -f docker-compose-full.yaml build
docker-compose -f docker-compose-full.yaml up -d
```

## Docker Images

### Backend Image

**Repository**: `ghcr.io/taktx-io/taktx-console-backend`

**Base Image**: Eclipse Temurin 21 JDK (builder) / Eclipse Temurin 21 JRE (runtime)

**Build Process**: 
- Uses project's Gradle wrapper (8.14.3)
- Builds Quarkus application with inmemory ingester
- Multi-stage build for optimized image size

**Build Arguments**: None

**Environment Variables**:
- `QUARKUS_HTTP_PORT` - HTTP port (default: 8084)
- `QUARKUS_HTTP_CORS` - Enable CORS (default: true)
- `QUARKUS_HTTP_CORS_ORIGINS` - Allowed CORS origins
- `BOOTSTRAP_SERVERS` - Kafka bootstrap servers
- `TAKTX_ENGINE_NAMESPACE` - TaktX namespace

**Exposed Ports**: 8084

### Frontend Image

**Repository**: `ghcr.io/taktx-io/taktx-console-frontend`

**Build Arguments**:
- `NEXT_PUBLIC_TAKTX_BACKEND_URL` - Backend API URL (required at build time)
- `NEXT_PUBLIC_TAKTX_WS_URL` - WebSocket URL (required at build time)

**Environment Variables**:
- `PORT` - HTTP port (default: 3000)
- `NODE_ENV` - Node environment (default: production)

**Exposed Ports**: 3000

## Building Images Manually

### Backend

```bash
cd backend
docker build -t taktx-console-backend:local .
```

### Frontend

```bash
cd frontend
docker build \
  --build-arg NEXT_PUBLIC_TAKTX_BACKEND_URL=http://localhost:8084 \
  --build-arg NEXT_PUBLIC_TAKTX_WS_URL=ws://localhost:8084/ws \
  -t taktx-console-frontend:local .
```

## CORS Configuration

The backend is configured to handle CORS for cross-origin requests from the frontend. The default configuration allows:

- **Origins**: `http://localhost:3000`, `http://taktx-console-frontend:3000`
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization
- **Credentials**: true

To customize CORS settings, modify the environment variables in `docker-compose-full.yaml`:

```yaml
environment:
  - QUARKUS_HTTP_CORS_ORIGINS=http://localhost:3000,http://example.com
```

## Networking

All services run on the default Docker network created by docker-compose. The backend and frontend communicate using container names:

- Frontend → Backend: Uses `NEXT_PUBLIC_TAKTX_BACKEND_URL` (defaults to localhost for browser access)
- Backend → Kafka: Uses `kafka:9094`
- Backend → TaktX Engine: Uses internal service name

## Development vs Production

### Local Development Mode (Native)

For local development without Docker, use the native development servers:

**1. Start Backend:**
```bash
cd backend
./gradlew :ingesters:inmemory:quarkusDev
```
Backend will run at: http://localhost:8084

**2. Start Frontend:**
```bash
cd frontend/taktx-console
npm run dev
```
Frontend will run at: http://localhost:3000

**Configuration:**
The frontend is pre-configured to connect to `http://localhost:8084` by default. If you need to change this:

1. Copy the example environment file:
   ```bash
   cd frontend/taktx-console
   cp .env.example .env.local
   ```

2. Edit `.env.local` to customize:
   ```dotenv
   NEXT_PUBLIC_TAKTX_BACKEND_URL=http://localhost:8084
   NEXT_PUBLIC_TAKTX_WS_URL=ws://localhost:8084/ws
   ```

3. Restart the frontend dev server

**Note:** The `.env.local` file is already created for you with the correct defaults. The frontend will automatically use these values in development mode.

### Production Mode (Docker)

Use Docker Compose as described above. The images are optimized for production with:
- Multi-stage builds for smaller image sizes
- Non-root users for security
- Health checks
- Proper dependency management

## Troubleshooting

### Backend fails to start

Check Kafka connectivity:
```bash
docker-compose logs kafka
docker-compose logs taktx-console-backend
```

### Frontend can't connect to backend

1. Verify the backend is running:
```bash
curl http://localhost:8084/processdefinitions
```

2. Check CORS configuration in the browser console

3. Verify environment variables:
```bash
docker-compose exec taktx-console-frontend env | grep NEXT_PUBLIC
```

### WebSocket connection issues

Ensure the WebSocket URL is correctly configured:
- For browser access: `ws://localhost:8084/ws`
- For container-to-container: `ws://taktx-console-backend:8084/ws`

## Publishing to GitHub Container Registry

Images are automatically built and published to GHCR when:
- Code is pushed to `main` or `develop` branches
- A version tag (e.g., `v1.0.0`) is created
- A pull request is created (build only, no push)

The workflow is defined in `.github/workflows/docker-publish.yml`.

## Security Considerations

1. **Non-root users**: Both images run as non-root users
2. **Secrets**: Never include sensitive data in images
3. **CORS**: Restrict CORS origins in production
4. **Network**: Use Docker networks to isolate services
5. **Updates**: Regularly update base images and dependencies

## License

See the main LICENSE file for details.

