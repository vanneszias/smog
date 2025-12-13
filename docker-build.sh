#!/bin/bash
# Docker build helper script with BuildKit optimizations
# This script ensures BuildKit is enabled for faster, cached builds

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Smog Docker Build (with BuildKit)${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Enable Docker BuildKit
export DOCKER_BUILDKIT=1
export BUILDKIT_PROGRESS=plain

echo -e "${GREEN}✓ BuildKit enabled${NC}"
echo -e "${YELLOW}ℹ BuildKit provides:${NC}"
echo "  • Faster builds with cache mounts (10-20x faster)"
echo "  • Better layer caching and parallelization"
echo "  • Progress output for debugging"
echo ""

# Check if user wants to build specific services
if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Building all services...${NC}"
    docker compose build
else
    echo -e "${YELLOW}Building services: $@${NC}"
    docker compose build "$@"
fi

echo ""
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  • Run: docker compose up"
echo "  • Or: docker compose up -d (detached mode)"
echo ""
echo -e "${YELLOW}Performance tips:${NC}"
echo "  • Subsequent builds will be much faster due to cache mounts"
echo "  • Only changed layers will rebuild"
echo "  • First build typically takes 2-3 minutes"
echo "  • Subsequent builds: 10-30 seconds"
