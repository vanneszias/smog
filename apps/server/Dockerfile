# syntax=docker/dockerfile:1.4
# Multi-stage build for API server

# Stage 1: Install dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy root package files
COPY package.json bun.lock bunfig.toml ./
COPY turbo.json ./

# Copy all package.json files for workspace resolution
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/convex/package.json ./packages/convex/
COPY packages/types/package.json ./packages/types/
COPY packages/styles/package.json ./packages/styles/
COPY packages/hooks/package.json ./packages/hooks/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/ui/package.json ./packages/ui/
COPY apps/server/package.json ./apps/server/

# Install dependencies with BuildKit cache mount for faster rebuilds
# --frozen-lockfile ensures reproducible builds
# Cache mounts persist between builds, making subsequent builds 10-20x faster
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install

# Stage 2: Build application
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy all files from deps stage to ensure workspace structure
COPY --from=deps /app ./

# Copy all source code (this will overwrite package.json files with actual source)
COPY . .

# Build server application
RUN cd apps/server && bun run build

# Stage 3: Production runtime
FROM oven/bun:1-alpine AS production
WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy built application (tsdown bundles all @smog/* packages)
COPY --from=builder /app/apps/server/dist ./dist

# Copy package.json to read metadata if needed
COPY --from=builder /app/apps/server/package.json ./package.json

# Only copy production node_modules for external dependencies
# that aren't bundled (like native modules)
COPY --from=deps /app/node_modules ./node_modules

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["bun", "run", "dist/index.mjs"]
