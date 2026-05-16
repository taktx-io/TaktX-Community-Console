####
# TaktX Ingester InMemory - Multi-stage Docker build
#
# Stage 1: Build stage using Gradle (JDK)
# Stage 2: Runtime using BellSoft Liberica JRE Alpine (222MB, has shell, Alpine security model)
####

# Stage 1: Build
FROM eclipse-temurin:21.0.10_7-jdk AS builder

ARG TAKTX_APP_VERSION=0.0.0-dev
ENV TAKTX_APP_VERSION=$TAKTX_APP_VERSION

WORKDIR /build

# Copy Gradle wrapper and build files
COPY gradlew .
COPY gradle gradle/
COPY build.gradle.kts .
COPY settings.gradle.kts .

# Copy ingester source
COPY ingesters ingesters/

# Build the application (skip tests in Docker build for speed)
RUN chmod +x ./gradlew
RUN ./gradlew :ingesters:inmemory:build -x test --no-daemon

# Stage 2: Runtime
FROM bellsoft/liberica-openjre-alpine:21.0.11

ARG TAKTX_APP_VERSION=0.0.0-dev

WORKDIR /app

# Install wget for healthchecks and create non-root user (Alpine syntax)
RUN apk add --no-cache wget && \
    addgroup -S taktx && \
    adduser -S -G taktx -h /home/taktx taktx && \
    mkdir -p /home/taktx/.taktx && \
    chown -R taktx:taktx /app /home/taktx

COPY --from=builder /build/ingesters/inmemory/build/quarkus-app/ /app/

RUN chown -R taktx:taktx /app

USER taktx

ENV HOME=/home/taktx
ENV TAKTX_APP_VERSION=$TAKTX_APP_VERSION
ENV QUARKUS_HTTP_PORT=8084

EXPOSE 8084

# ECS: ALB target group healthcheck - Protocol: HTTP  Port: 8084  Path: /q/health/ready
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8084/q/health/ready || exit 1

ENTRYPOINT ["java", "-jar", "/app/quarkus-run.jar"]

