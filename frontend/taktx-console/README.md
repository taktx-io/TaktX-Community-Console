# TaktX Community Console — Frontend

Next.js frontend for the Apache 2.0 TaktX Community Console.

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **React 19**
- **Ant Design 5**
- **bpmn-js**

## Architecture

The frontend talks to the **Platform Service** (BFF), not directly to the ingester.

- **Local dev without reverse proxy**: set `NEXT_PUBLIC_PLATFORM_SERVICE_URL=http://localhost:8080`
- **Docker / nginx / same-origin deployments**: leave `NEXT_PUBLIC_PLATFORM_SERVICE_URL` empty so the browser uses relative `/api/*` URLs

WebSocket connections are also obtained through the BFF via `GET /api/runway/ws-token`.

## Community Edition Purpose and Scope

This frontend is part of the **TaktX Community Console** and is intended primarily for:

- local development
- testing and demos
- technical evaluation
- limited production use only where the community-edition constraints are acceptable

The community edition supports only:

- a single namespace
- a single ingester (`ingesters:inmemory`)
- the in-memory ingester variant, so managed data/configuration is lost on restart

The community edition does **not** include:

- identity provider integration
- RBAC
- signing features
- validation features

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Platform Service running on `http://localhost:8080`

### Installation

```bash
npm install
```

### Development

```bash
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

### Production Build

```bash
npm run build
npm run start
```

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Typical local development values:

```dotenv
NEXT_PUBLIC_PLATFORM_SERVICE_URL=http://localhost:8080
# NEXT_PUBLIC_TAKTX_WS_URL=ws://localhost:8084
```

## Project Structure

```text
app/                    # Next.js App Router pages
├── runway/             # Runway monitoring and control pages
└── page.tsx            # Landing page
components/
├── layout/             # Shell layout and navigation
└── runway/             # Runway-specific UI components
lib/
├── api/                # REST API client functions
├── config/             # Environment/config resolution
├── hooks/              # React hooks
└── utils/              # Shared helpers
```

## Key Features

- Process definition browser
- BPMN diagram rendering
- Runway live monitoring
- Same-origin deployment behind nginx to avoid CORS in Docker/nginx deployments

## API Integration

The frontend calls the Platform Service API, typically under `/api/*`:

- `GET /api/processdefinitions`
- `GET /api/processdefinitions?id={id}`
- `GET /api/processdefinitions/{id}/version/{version}/xml`
- `GET /api/runway/ws-token`

## Development Notes

- Dark theme is configured via Ant Design
- BPMN diagrams are rendered client-side using `bpmn-js`
- API base URL selection is centralized in `lib/config/env.ts`
- `NEXT_PUBLIC_PLATFORM_SERVICE_URL` still has an active purpose for local-dev vs reverse-proxy deployments

## License

This frontend is part of the Apache License 2.0 community edition. See the repository root [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE).
