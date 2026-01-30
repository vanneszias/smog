#!/bin/bash
set -euo pipefail

# Configuration
readonly GIT_SHA=$(git rev-parse --short HEAD)
readonly VERSION="v0.1.0"
readonly DOCKER_USERNAME="vanneszias"
readonly IMAGES=("smog-web" "smog-server" "smog-video-worker")
readonly TAGS=("latest" "${VERSION}" "sha-${GIT_SHA}")

# Colors for output
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Enable BuildKit
export DOCKER_BUILDKIT=1

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Docker Image Build & Push Pipeline${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Version:${NC} ${VERSION}"
echo -e "${YELLOW}Git SHA:${NC} ${GIT_SHA}"
echo -e "${YELLOW}Username:${NC} ${DOCKER_USERNAME}"
echo ""

# Build images
echo -e "${GREEN}► Building Docker images...${NC}"
./docker-build.sh
echo ""

# Tag and push images
for image in "${IMAGES[@]}"; do
    echo -e "${GREEN}► Processing ${image}${NC}"

    # Tag all versions
    for tag in "${TAGS[@]}"; do
        local_tag="${image}:latest"
        remote_tag="${DOCKER_USERNAME}/${image}:${tag}"

        echo -e "  Tagging: ${remote_tag}"
        docker tag "${local_tag}" "${remote_tag}"
    done

    # Push all tags
    for tag in "${TAGS[@]}"; do
        remote_tag="${DOCKER_USERNAME}/${image}:${tag}"
        echo -e "  Pushing: ${remote_tag}"
        docker push "${remote_tag}"
    done

    echo ""
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All images pushed successfully!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
