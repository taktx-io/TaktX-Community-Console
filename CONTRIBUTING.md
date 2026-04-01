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

