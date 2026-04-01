# 🚀 TaktX Community Console — Frontend Quick Start

## Prerequisites

- Node.js 20+
- npm
- Platform Service running on `http://localhost:8080`
- At least one process definition deployed to TaktX

## Start the Frontend

### Option 1: Use the helper script

```bash
./start.sh
```

### Option 2: Start manually

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open **http://localhost:3001/runway**.

## Local Development Configuration

In local development there is usually no reverse proxy in front of the frontend, so set:

```dotenv
NEXT_PUBLIC_PLATFORM_SERVICE_URL=http://localhost:8080
```

Optional WebSocket override when connecting directly to the ingester in dev:

```dotenv
# NEXT_PUBLIC_TAKTX_WS_URL=ws://localhost:8084
```

## Recommended Docker Alternative

If you want a same-origin setup with no CORS handling in the browser, use the Docker stack instead:

```bash
cd ../../docker
docker compose --profile console up -d
```

Then open **http://localhost:3002**.

## Troubleshooting

### Platform Service not running

```bash
cd ../../backend
./gradlew :platform-service:quarkusDev
```

### CORS errors in local dev

If the frontend is on `:3001` and the Platform Service is on `:8080`, enable CORS on the Platform Service for development only.

### Process definitions do not load

- Verify the Platform Service is healthy:

```bash
curl http://localhost:8080/health/ready
```

- Verify `.env.local` contains `NEXT_PUBLIC_PLATFORM_SERVICE_URL=http://localhost:8080`

### Frontend port already in use

The `dev` script is fixed to port `3001`. Stop the existing process using that port or adjust the script temporarily.

## Build and Test

```bash
npm run build
npm test
npm run test:e2e
```

## Key Pages

- `/` — landing page
- `/runway` — process definition viewer and live monitoring

## License

This frontend is part of the Apache License 2.0 community edition.

