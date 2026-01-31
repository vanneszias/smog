# syntax=docker/dockerfile:1.4
# Multi-stage build for video worker with FFmpeg

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Install build dependencies for native modules (if needed)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy root package files
COPY package.json bun.lock bunfig.toml ./
COPY turbo.json ./

# Copy all package.json files for workspace resolution
COPY packages/convex/package.json ./packages/convex/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/styles/package.json ./packages/styles/
COPY packages/hooks/package.json ./packages/hooks/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/ui/package.json ./packages/ui/
COPY apps/video-worker/package.json ./apps/video-worker/

# Use Sharp pre-built binaries instead of building from source
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1

# Install dependencies with BuildKit cache mount for faster rebuilds
# --frozen-lockfile ensures reproducible builds
# Cache mounts persist between builds, making subsequent builds 10-20x faster
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install

# Stage 2: Build application
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy all files from deps stage to ensure workspace structure
COPY --from=deps /app ./

# Copy all source code (this will overwrite package.json files with actual source)
COPY . .

# Build video worker application
RUN cd apps/video-worker && bun run build

# Stage 3: Production runtime with FFmpeg
FROM oven/bun:1 AS production
WORKDIR /app

# Install FFmpeg and required dependencies
RUN apt-get update && apt-get install -y \
  ffmpeg \
  fonts-dejavu-core \
  fonts-liberation \
  fonts-noto \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation
RUN ffmpeg -version

# Copy built application (tsdown bundles all @smog/* packages)
COPY --from=builder /app/apps/video-worker/dist ./dist

# Copy package.json to read metadata if needed
COPY --from=builder /app/apps/video-worker/package.json ./package.json

# Copy custom font for video overlays
COPY --from=builder /app/apps/video-worker/assets/font.ttf ./assets/font.ttf

# Only copy production node_modules for external dependencies
# that aren't bundled (like native modules: sharp)
COPY --from=deps /app/node_modules ./node_modules

# Create symlinks for workspace-specific dependencies that don't have root-level symlinks
# Sharp is kept external because it has native bindings
RUN ln -sf .bun/sharp@0.34.5/node_modules/sharp node_modules/sharp

# Create temp directory for video processing
RUN mkdir -p /tmp/video-processing && \
  chmod 777 /tmp/video-processing

# Create a non-root user
RUN groupadd -g 1001 -r nodejs && \
  useradd -r -u 1001 -g nodejs nodejs

# Change ownership
RUN chown -R nodejs:nodejs /app /tmp/video-processing

USER nodejs

EXPOSE 3002

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

CMD ["bun", "run", "dist/server.js"]
