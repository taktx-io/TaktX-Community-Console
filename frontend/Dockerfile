# syntax=docker/dockerfile:1
# Multi-stage build for TaktX Community Console Frontend
#
# Usage:
#   docker compose --profile console up --build
#
# Build runs npm ci + next build inside Docker.
# npm and Next.js caches are mounted so subsequent builds are faster.
#

# ── Stage 1: install deps ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY taktx-console/package.json taktx-console/package-lock.json* ./

# Cache mount keeps the npm cache on the Docker build host between runs.
# On a clean build this saves ~30-60s of package downloads.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY taktx-console/ ./

ARG NEXT_PUBLIC_PLATFORM_SERVICE_URL=
ENV NEXT_PUBLIC_PLATFORM_SERVICE_URL=$NEXT_PUBLIC_PLATFORM_SERVICE_URL

ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

ENV NEXT_TELEMETRY_DISABLED=1

# Cache mount keeps .next/cache on the Docker build host between runs.
# Only pages whose source has changed are recompiled — saves 1-3 min on incremental builds.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ── Stage 3: runtime image ────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
