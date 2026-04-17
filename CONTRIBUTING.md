# Contributing to TaktX Community Console

Thank you for your interest in contributing! This project is open source under the
[Apache License 2.0](LICENSE) and welcomes contributions of all kinds — bug fixes,
features, documentation improvements, and more.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Report a Bug](#how-to-report-a-bug)
- [How to Request a Feature](#how-to-request-a-feature)
- [Development Setup](#development-setup)
- [Release Process](#release-process)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Commit Messages](#commit-messages)
- [Developer Certificate of Origin (DCO)](#developer-certificate-of-origin-dco)
- [Coding Standards](#coding-standards)

---

## Code of Conduct

By participating in this project you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## How to Report a Bug

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template.
Please include:
- Steps to reproduce
- Expected vs. actual behaviour
- Your environment (OS, Docker version, browser)

> **Security vulnerabilities must not be reported as public issues.**
> See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

---

## How to Request a Feature

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue template.
Describe the problem you want to solve rather than jumping straight to a solution.

---

## Development Setup

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| JDK  | 21             |
| Node.js | 20          |
| Docker | 20.10        |
| Docker Compose | 2.0   |

### Run everything via Docker (recommended)

```bash
cd docker
docker compose --profile console up -d --build
```

Access at **http://localhost:3002**.

### Run services natively (for active development)

**Backend — Platform Service (port 8080):**
```bash
cd backend
./gradlew :platform-service:quarkusDev
```

**Backend — Ingester In-Memory (port 8084):**
```bash
cd backend
./gradlew :ingesters:inmemory:quarkusDev
```

**Frontend (port 3001):**
```bash
cd frontend/taktx-console
cp .env.example .env.local   # first time only
npm install                  # first time only
npm run dev
```

### Run tests

```bash
# Backend
cd backend
./gradlew test

# Frontend unit tests
cd frontend/taktx-console
npm test

# Frontend end-to-end tests
npm run test:e2e
```

---

## Release Process

Releases are **tag-driven** and **GitHub Actions is the only supported way** to publish
the production Docker images and create the GitHub Release.

### What happens when a release tag is pushed

Pushing a release tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which:

- normalizes the tag (`v1.2.3` and `1.2.3` both become `1.2.3`)
- builds the frontend, platform service, and ingester from that exact same version
- publishes all three images to GHCR for `linux/amd64` and `linux/arm64`
- adds immutable `sha-<shortsha>` image tags for traceability
- updates `latest` only for stable tags
- creates the GitHub Release automatically after image publication succeeds

No manual image-publish scripts are supported.

### Supported tag formats

- Stable: `v1.2.3` or `1.2.3`
- Prerelease: `v1.2.3-beta.1` or `1.2.3-beta.1`

### How to cut a release

1. Ensure the branch you want to release is merged and green in CI.
2. Check out the exact commit to release, typically on `main`.
3. Create an annotated tag.
4. Push the tag to `origin`.
5. Wait for the release workflow to publish the images and create the GitHub Release.

Stable release example:

```bash
git checkout main
git pull --ff-only origin main
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

Prerelease example:

```bash
git checkout main
git pull --ff-only origin main
git tag -a v1.2.3-beta.1 -m "Release v1.2.3-beta.1"
git push origin v1.2.3-beta.1
```

### Published image tags

For every release, GitHub Actions publishes the same release version for all three images:

- `ghcr.io/<owner>/taktx-community-platform-service:<version>`
- `ghcr.io/<owner>/taktx-community-ingester-inmemory:<version>`
- `ghcr.io/<owner>/taktx-community-console-frontend:<version>`

It also publishes:

- `ghcr.io/<owner>/...:sha-<shortsha>` for each image
- `:latest` for each image only when the tag is a stable release

### Local Docker builds

Local Docker builds are still fine for development and validation, for example via CI or
`docker compose --build`, but they are **not** an official release mechanism and must not
be used to publish production images.

---

## Submitting a Pull Request

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/short-description
   ```
   Use prefixes: `fix/`, `feat/`, `docs/`, `chore/`, `refactor/`.

2. **Make your changes** with focused, atomic commits.

3. **Run tests** and make sure they pass (see above).

4. **Sign off** every commit (see [DCO](#developer-certificate-of-origin-dco)):
   ```bash
   git commit -s -m "fix: describe what you fixed"
   ```

5. **Open a PR** against `main`. Fill in the pull request template completely.

6. A maintainer will review and may request changes. Once approved it will be merged.

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
Signed-off-by: Your Name <you@example.com>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`  
**Scopes (optional):** `frontend`, `platform-service`, `ingester`, `docker`, `ci`

Examples:
```
feat(frontend): add dark mode toggle
fix(platform-service): handle missing Kafka topic gracefully
docs: update Docker quick-start instructions
```

---

## Developer Certificate of Origin (DCO)

This project uses the DCO instead of a CLA. By signing off your commit you certify
that you wrote the code yourself (or have the right to contribute it) and agree it
may be distributed under the Apache 2.0 license.

Add a sign-off automatically with:
```bash
git commit -s
```

This appends the following line to your commit message:
```
Signed-off-by: Your Name <you@example.com>
```

The name and email must match your Git identity. You can configure them with:
```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

## Coding Standards

### Java (backend)

- **Style**: enforced by [Spotless](https://github.com/diffplug/spotless) with the
  Google Java Format. Run `./gradlew spotlessApply` to auto-format before committing.
- **Target**: Java 21, Quarkus framework conventions.
- **Tests**: JUnit 5 + Quarkus test extensions. Aim for unit tests on business logic
  and at least one integration test per REST endpoint.

### TypeScript (frontend)

- **Style**: ESLint + Prettier. Run `npm run lint` and `npm run format` before committing.
- **Framework**: Next.js App Router conventions — server components by default, client
  components only where interactivity is required.
- **Tests**: Jest for unit/component tests, Playwright for end-to-end tests.

---

## Questions?

Open a [Discussion](https://github.com/taktx-io/TaktX-Community-Console/discussions)
rather than an issue for general questions, ideas, or "how do I…" questions.

