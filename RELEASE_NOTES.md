# Release Notes — TaktX Community Console v0.1.0

**Released:** April 2, 2026  
**License:** Apache 2.0  
**Repository:** https://github.com/taktx-io/TaktX-Community-Console

---

## 🎉 First open-source release

This is the initial public release of the **TaktX Community Console** — an open-source web UI and supporting backend services for the [TaktX Engine](https://github.com/taktx-io), a high-throughput, Kafka-native BPMN process engine.

The community edition is designed for **local development, testing, demos, and evaluation**, with only limited suitability for production environments where its constraints (see below) are acceptable.

---

## ✨ What's included

### Runway — Live Process Monitoring

The primary view for inspecting process definitions and monitoring running instances in real time.

- **BPMN Diagram Viewer** — renders deployed process definitions using [bpmn-js](https://github.com/bpmn-io/bpmn-js) with full pan/zoom support
- **Live overlay highlights** — real-time WebSocket-driven animation of active tokens moving through the diagram; can be toggled per session
- **Aggregate badge overlays** — per-flow-node counts for active, completed, and incident states, configurable via the badge settings panel
- **Instance badge overlays** — per-flow-node highlighting when a specific process instance is selected
- **Subprocess navigation** — click into collapsed sub-processes directly from the diagram; clickable breadcrumb trail to navigate back
- **Flow Node Detail Popup** — click any BPMN element to see which specific flow-node instances are currently at that point, with an instance dropdown
- **Global Process Overview** — landing view showing aggregate status across all deployed process definitions before a specific definition is selected

### Filter Panel

- Switch between **definition mode** (filter by process definition, version, execution state, start/end time ranges) and **instance mode** (filter by specific instance IDs or saved bookmarks)
- All filter state persisted to `localStorage` and restored on reload
- URL sharing — shareable deep-link that encodes the selected definition, version, and instance

### Process Instance Table

- Paginated, real-time-updated table of process instances matching the current filter
- Execution state badges with color coding (active, completed, aborted, incident)
- Click a row to open the instance detail pane; click again to close
- **Bookmark** a selection of instance IDs for later recall
- Right-click / context actions to create and manage background jobs

### Process Instance Detail Pane

- Slide-in detail panel showing variables, flow-node history with timestamps, and execution path
- **Incident alert banner** and full stack-trace modal for instances with incidents
- **Parent instance navigation** — one-click navigation to the calling (parent) process instance for call activities
- Resizable panel width with keyboard support

### Start Process Modal

- Start one or multiple process instances directly from the console
- Optionally save the started instance IDs as a named bookmark for immediate tracking

### Jobs Panel

- Background job queue visible as a slide-out panel
- Live job count badge in the header

---

### Backend

#### Platform Service (BFF)

- Quarkus 3 / Java 21 REST and WebSocket backend
- Acts as a Backend-for-Frontend: all browser traffic routes through a single service
- WebSocket token exchange endpoint (`GET /api/runway/ws-token`) issues short-lived tokens so the frontend can upgrade to a WebSocket without exposing credentials
- Proxies REST and WebSocket subscriptions to the configured ingester
- CORS disabled by default when deployed behind the included nginx reverse proxy

#### In-Memory Ingester

- Kafka producer that pushes TaktX Engine configuration (process definitions, etc.) at startup
- Retains process-instance state in memory for the Runway read path and WebSocket subscriptions
- **4-level WebSocket subscription model** — clients subscribe at: global → process definition → definition version → specific process instance; switching levels auto-unsubscribes the previous level
- **Adaptive memory retention** — bounded in-memory store with heap-aware eviction:
  - Only `COMPLETED` and `ABORTED`, incident-free instances are eligible for eviction
  - Active instances and instances with incidents are always retained
  - Eviction removes the oldest eligible terminal instances first
  - Triggered by heap pressure (configurable high-watermark) or by exceeding configured instance/byte caps
  - Default minimum terminal age before eviction: 5 minutes
  - Fully configurable via environment variables (`TAKTX_INGESTER_RETENTION_*`)

---

### Infrastructure

- **Nginx reverse proxy** — serves the frontend and platform service from a single origin, eliminating CORS entirely; single entry point at `http://localhost:3002`
- **Docker Compose profiles**:
  - `console` — Kafka + Platform Service + Ingester + Frontend + Nginx
  - `full` — everything above plus the TaktX Engine
  - `observability` — adds Kafka UI, Prometheus, and Grafana
- **Multi-platform Docker images** — published for `linux/amd64` and `linux/arm64`
- **GitHub Container Registry** — images published to `ghcr.io/taktx-io/` on every release:
  - `taktx-community-platform-service`
  - `taktx-community-ingester-inmemory`
  - `taktx-community-console-frontend`
- **Version baked into the frontend** — the release version is embedded at build time as `NEXT_PUBLIC_APP_VERSION` and shown as a version label in the sidebar

---

### CI / Release automation

- **CI workflow** (`.github/workflows/ci.yml`) — runs on every push and pull request:
  - Backend: Gradle build, Spotless format check, JUnit tests with published test reports
  - Frontend: ESLint, Jest unit tests, Next.js production build
  - Docker build validation for all three images (no push)
- **Release workflow** (`.github/workflows/release.yml`) — triggered when a GitHub Release is published:
  - Accepts both `v1.2.3` and `1.2.3` tag formats
  - Publishes versioned and `latest` Docker images to GHCR for amd64 and arm64
  - Automatically commits version bumps to `package.json` and `build.gradle.kts` back to the release branch

---

## 🚀 Quick start

```bash
cd docker
docker compose --profile console up -d
```

Open **http://localhost:3002** in your browser.

See [README.md](README.md) and [docker/README.md](docker/README.md) for full setup instructions, environment variable reference, and local development guide.

---

## ⚠️ Community edition constraints

| Constraint | Detail |
|---|---|
| **In-memory only** | All ingested data is lost when the ingester container restarts |
| **Single namespace** | One namespace per deployment |
| **Single ingester** | Only the `ingesters:inmemory` variant is included |
| **No authentication** | No identity provider integration; not suitable for multi-user production |
| **No RBAC** | All users have full access |
| **No signing / validation** | Process definition signing and validation are not available |

Persisted ingester variants and the full **TaktX Control Console** (with multi-tenancy, RBAC, signing, and validation) are planned separately.

---

## 🔧 Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Ant Design 5, bpmn-js 18 |
| Backend | Quarkus 3, Java 21, Gradle |
| Messaging | Apache Kafka (KRaft mode) |
| Proxy | Nginx |
| Containers | Docker, Docker Compose |
| CI | GitHub Actions |
| Registry | GitHub Container Registry (GHCR) |

---

## 📄 License

Copyright 2026 TaktX-IO. Licensed under the **Apache License, Version 2.0**.  
See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the full text.

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use [Conventional Commits](https://www.conventionalcommits.org/) and sign off every commit (`git commit -s`) per the [DCO](DCO).

For questions and discussion, open a [GitHub Discussion](https://github.com/taktx-io/TaktX-Community-Console/discussions).  
For security issues, follow the responsible disclosure process in [SECURITY.md](SECURITY.md).

