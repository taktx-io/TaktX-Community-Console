#!/bin/bash
#
# Build and push TaktX Community Console images to GitHub Container Registry
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
REGISTRY="${DOCKER_REGISTRY:-ghcr.io}"
ORG="${DOCKER_ORG:-taktx-io}"
TAG="${IMAGE_TAG:-latest}"

INGESTER_IMAGE="${REGISTRY}/${ORG}/taktx-community-ingester-inmemory:${TAG}"
PLATFORM_IMAGE="${REGISTRY}/${ORG}/taktx-community-platform-service:${TAG}"
FRONTEND_IMAGE="${REGISTRY}/${ORG}/taktx-community-console-frontend:${TAG}"

echo "=========================================="
echo "Push TaktX Community Console Images to GHCR"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  Registry: ${REGISTRY}"
echo "  Organization: ${ORG}"
echo "  Tag: ${TAG}"
echo ""
echo "Images to push:"
echo "  - ${INGESTER_IMAGE}"
echo "  - ${PLATFORM_IMAGE}"
echo "  - ${FRONTEND_IMAGE}"
echo ""

# Check if logged in to GHCR
log_info "Checking GitHub Container Registry authentication..."
if ! cat ~/.docker/config.json 2>/dev/null | grep -q "${REGISTRY}"; then
    log_warn "No credentials found for ${REGISTRY}."
    echo ""
    echo "To login, run:"
    echo "  echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
    echo ""
    echo "Or create a GitHub Personal Access Token with 'write:packages' permission at:"
    echo "  https://github.com/settings/tokens"
    echo ""
    read -p "Press Enter once logged in, or Ctrl+C to cancel..."
fi

# Resolve project root (one level up from the docker/ folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log_info "Building taktx-community-ingester-inmemory..."
docker build \
    -t "${INGESTER_IMAGE}" \
    -f "${PROJECT_ROOT}/backend/ingesters/inmemory/Dockerfile" \
    "${PROJECT_ROOT}/backend"

log_info "Building taktx-community-platform-service..."
docker build \
    -t "${PLATFORM_IMAGE}" \
    -f "${PROJECT_ROOT}/backend/platform-service/Dockerfile" \
    "${PROJECT_ROOT}/backend"

log_info "Building taktx-community-console-frontend..."
docker build \
    -t "${FRONTEND_IMAGE}" \
    -f "${PROJECT_ROOT}/frontend/Dockerfile" \
    "${PROJECT_ROOT}/frontend"

log_info "Images built and tagged:"
docker images | grep -E "taktx-community-ingester-inmemory|taktx-community-platform-service|taktx-community-console-frontend"

# Push images
log_info "Pushing taktx-community-ingester-inmemory..."
docker push "${INGESTER_IMAGE}"

log_info "Pushing taktx-community-platform-service..."
docker push "${PLATFORM_IMAGE}"

log_info "Pushing taktx-community-console-frontend..."
docker push "${FRONTEND_IMAGE}"

echo ""
echo "=========================================="
log_info "✅ Images pushed successfully!"
echo "=========================================="
echo ""
echo "Published images:"
echo "  - ${INGESTER_IMAGE}"
echo "  - ${PLATFORM_IMAGE}"
echo "  - ${FRONTEND_IMAGE}"
echo ""
echo "To pull these images:"
echo "  docker pull ${INGESTER_IMAGE}"
echo "  docker pull ${PLATFORM_IMAGE}"
echo "  docker pull ${FRONTEND_IMAGE}"
echo ""

