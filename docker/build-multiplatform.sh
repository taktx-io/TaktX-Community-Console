#!/bin/bash
#
# Build TaktX Community Console images for multiple platforms (amd64 + arm64)
#
# This script builds Docker images for both linux/amd64 and linux/arm64 platforms.
# WARNING: This can take 30-60 minutes due to QEMU emulation for cross-platform builds.
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Configuration
REGISTRY="${REGISTRY:-ghcr.io}"
ORG="${ORG:-taktx-io}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH="${PUSH:-true}"
TAG="${TAG:-latest}"

INGESTER_IMAGE="${REGISTRY}/${ORG}/taktx-community-ingester-inmemory:${TAG}"
PLATFORM_IMAGE="${REGISTRY}/${ORG}/taktx-community-platform-service:${TAG}"
FRONTEND_IMAGE="${REGISTRY}/${ORG}/taktx-community-console-frontend:${TAG}"

echo "=========================================="
echo "Multi-Platform Docker Build"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  Registry: ${REGISTRY}/${ORG}"
echo "  Platforms: ${PLATFORMS}"
echo "  Tag: ${TAG}"
echo "  Push to registry: ${PUSH}"
echo ""
log_warn "This build can take 30-60 minutes!"
echo ""

# Check if buildx is available
if ! docker buildx version &>/dev/null; then
    log_warn "Docker Buildx is not available. Please install Docker Desktop or Docker Buildx."
    exit 1
fi

# Create or use existing builder
log_step "Setting up Docker Buildx builder..."
if docker buildx inspect taktx-multiplatform &>/dev/null; then
    log_info "Using existing builder: taktx-multiplatform"
    docker buildx use taktx-multiplatform
else
    log_info "Creating new builder: taktx-multiplatform"
    docker buildx create --name taktx-multiplatform --driver docker-container --bootstrap
    docker buildx use taktx-multiplatform
fi

# Inspect builder
docker buildx inspect --bootstrap

cd "$PROJECT_ROOT"

# --load is not supported for multi-platform builds; use --push to push to registry
# or --output type=image for a dry build without exporting locally
if [ "$PUSH" = "true" ]; then
    OUTPUT_FLAG="--push"
else
    OUTPUT_FLAG="--output type=image"
    log_warn "PUSH=false: images will be built but not pushed or loaded locally."
    log_warn "Multi-platform images cannot be loaded into the local Docker daemon."
    log_warn "Set PUSH=true to push to the registry."
fi

# Build ingester-inmemory
log_step "Building ingester-inmemory for ${PLATFORMS}..."
START_TIME=$(date +%s)

docker buildx build \
    --platform "${PLATFORMS}" \
    --file backend/ingesters/inmemory/Dockerfile \
    --tag "${INGESTER_IMAGE}" \
    ${OUTPUT_FLAG} \
    --cache-from type=local,src=/tmp/.buildx-cache-ingester \
    --cache-to type=local,dest=/tmp/.buildx-cache-ingester-new,mode=max \
    --progress=plain \
    backend/

INGESTER_END_TIME=$(date +%s)
INGESTER_DURATION=$((INGESTER_END_TIME - START_TIME))
log_info "Ingester built in ${INGESTER_DURATION} seconds (~$((INGESTER_DURATION / 60)) minutes)"

rm -rf /tmp/.buildx-cache-ingester
mv /tmp/.buildx-cache-ingester-new /tmp/.buildx-cache-ingester 2>/dev/null || true

# Build platform-service
log_step "Building platform-service for ${PLATFORMS}..."
PLATFORM_START_TIME=$(date +%s)

docker buildx build \
    --platform "${PLATFORMS}" \
    --file backend/platform-service/Dockerfile \
    --tag "${PLATFORM_IMAGE}" \
    ${OUTPUT_FLAG} \
    --cache-from type=local,src=/tmp/.buildx-cache-platform \
    --cache-to type=local,dest=/tmp/.buildx-cache-platform-new,mode=max \
    --progress=plain \
    backend/

PLATFORM_END_TIME=$(date +%s)
PLATFORM_DURATION=$((PLATFORM_END_TIME - PLATFORM_START_TIME))
log_info "Platform service built in ${PLATFORM_DURATION} seconds (~$((PLATFORM_DURATION / 60)) minutes)"

rm -rf /tmp/.buildx-cache-platform
mv /tmp/.buildx-cache-platform-new /tmp/.buildx-cache-platform 2>/dev/null || true

# Build frontend
log_step "Building frontend for ${PLATFORMS}..."
FRONTEND_START_TIME=$(date +%s)

docker buildx build \
    --platform "${PLATFORMS}" \
    --file frontend/Dockerfile \
    --tag "${FRONTEND_IMAGE}" \
    ${OUTPUT_FLAG} \
    --cache-from type=local,src=/tmp/.buildx-cache-frontend \
    --cache-to type=local,dest=/tmp/.buildx-cache-frontend-new,mode=max \
    --progress=plain \
    frontend/

FRONTEND_END_TIME=$(date +%s)
FRONTEND_DURATION=$((FRONTEND_END_TIME - FRONTEND_START_TIME))
log_info "Frontend built in ${FRONTEND_DURATION} seconds (~$((FRONTEND_DURATION / 60)) minutes)"

# Move cache
rm -rf /tmp/.buildx-cache-frontend
mv /tmp/.buildx-cache-frontend-new /tmp/.buildx-cache-frontend 2>/dev/null || true

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo ""
echo "=========================================="
log_info "✅ Multi-platform build complete!"
echo "=========================================="
echo ""
echo "Build times:"
echo "  Ingester:         ${INGESTER_DURATION}s (~$((INGESTER_DURATION / 60))m)"
echo "  Platform service: ${PLATFORM_DURATION}s (~$((PLATFORM_DURATION / 60))m)"
echo "  Frontend:         ${FRONTEND_DURATION}s (~$((FRONTEND_DURATION / 60))m)"
echo "  Total:            ${TOTAL_DURATION}s (~$((TOTAL_DURATION / 60))m)"
echo ""
echo "Images:"
echo "  - ${INGESTER_IMAGE}"
echo "  - ${PLATFORM_IMAGE}"
echo "  - ${FRONTEND_IMAGE}"
echo ""

if [ "$PUSH" = "false" ]; then
    echo "Note: Images were built but not pushed (dry run)."
    echo "To push, run: PUSH=true $0"
fi

echo ""
log_info "To inspect the images:"
echo "  docker buildx imagetools inspect ${INGESTER_IMAGE}"
echo "  docker buildx imagetools inspect ${PLATFORM_IMAGE}"
echo "  docker buildx imagetools inspect ${FRONTEND_IMAGE}"

