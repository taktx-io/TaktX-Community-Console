# TaktX Community Console

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Open-source community console for [TaktX Engine](https://github.com/taktx-io). Use it for development, testing, and limited production deployments.

---

## What is TaktX Community Console?

The TaktX Community Console is a web-based management UI and supporting backend services for the TaktX Engine — a high-throughput, Kafka-native BPMN process engine. The console lets you:

- Browse and inspect deployed process definitions (BPMN diagrams)
- Monitor live process instances on the Runway view
- Manage the TaktX in-memory ingester (pushes configuration & license data to the engine via Kafka)

---

## Architecture

```
Browser
  └─► Nginx (port 3002) ◄── single entry point, no CORS
        ├─► Next.js Frontend (port 3000, internal)
        └─► Platform Service / BFF (port 8080, internal)
                ├─► Kafka (port 9094, internal)
                └─► Ingester In-Memory (port 8084, internal)
                          └─► Kafka ─► TaktX Engine (port 8079)
```

| Service | Technology | Role |
|---|---|---|
| `taktx-console-frontend` | Next.js (React) | UI — BPMN viewer, Runway |
| `taktx-platform-service` | Quarkus (Java 21) | BFF — REST API, JWT validation |
| `taktx-ingester-inmemory` | Quarkus (Java 21) | Kafka producer — pushes config to engine |
| `nginx` | Nginx | Reverse proxy — same-origin, no CORS |
| `kafka` | Apache Kafka (KRaft) | Message broker |
| `taktx` *(optional)* | TaktX Engine | Process execution engine |

---

## Quick Start

### Prerequisites

| Tool | Minimum version |
|---|---|
| Docker | 20.10 |
| Docker Compose | 2.0 |

### Run the console (pre-built images)

```bash
cd docker
docker compose --profile console up -d
```

Open **http://localhost:3002** in your browser.

### Run the full stack (console + TaktX Engine + observability)

```bash
cd docker
docker compose --profile full up -d
```

### Build images locally

```bash
cd docker
docker compose --profile console up -d --build
```

See [`docker/README.md`](docker/README.md) for full details on profiles, environment variables, and configuration.

---

## Development Setup

### Backend (Java 21 / Quarkus)

```bash
cd backend
./gradlew :platform-service:quarkusDev     # Platform Service on :8080
./gradlew :ingesters:inmemory:quarkusDev   # Ingester on :8084
```

### Frontend (Node.js 20 / Next.js)

```bash
cd frontend/taktx-console
cp .env.example .env.local   # first time only
npm install                  # first time only
npm run dev                  # starts on :3001
```

See [`docker/README.md`](docker/README.md) for environment variable reference.

---

## Project Structure

```
TaktX-Community-Console/
├── backend/
│   ├── platform-service/      # BFF: REST API, JWT validation, WebSocket token exchange
│   └── ingesters/
│       └── inmemory/          # Kafka producer: pushes config & license to TaktX Engine
├── docker/
│   ├── docker-compose.yaml    # All Docker profiles (console, full, observability)
│   ├── nginx.conf             # Reverse proxy configuration
│   └── README.md              # Docker-specific documentation
└── frontend/
    └── taktx-console/         # Next.js application
```

---

## Contributing

Contributions of all kinds are welcome — bug fixes, features, documentation, and more.

Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening a pull request. Key points:

- Follow [Conventional Commits](https://www.conventionalcommits.org/)
- Sign off every commit (`git commit -s`) — see [DCO](DCO)
- Open a [Discussion](https://github.com/taktx-io/TaktX-Community-Console/discussions) for questions

---

## Security

Please **do not** open public issues for security vulnerabilities.  
See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

---

## License

Copyright 2026 TaktX-IO

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE) for the full text.

> This repository is the **Apache 2.0 community console platform**. The TaktX Engine is a separate project with its own licensing and release model.
