# syntax=docker/dockerfile:1.4
# Remotion Video Composition Service

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY turbo.json ./
COPY apps/remotion/package.json    ./apps/remotion/
COPY packages/types/package.json   ./packages/types/
COPY packages/config/package.json  ./packages/config/
COPY packages/api/package.json     ./packages/api/
COPY packages/auth/package.json    ./packages/auth/
COPY packages/convex/package.json  ./packages/convex/
COPY packages/hooks/package.json   ./packages/hooks/
COPY packages/i18n/package.json    ./packages/i18n/
COPY packages/styles/package.json  ./packages/styles/
COPY packages/ui/package.json      ./packages/ui/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY --from=deps /app ./
COPY . .

# ── Stage 3: production ───────────────────────────────────────────────────────
# Base: node:22-bookworm-slim (Debian stable/bookworm).
#
# Why NOT oven/bun:1 (Debian trixie/unstable):
#   trixie is a rolling release — packages update constantly and the arm64
#   mirror CDN frequently serves stale/inconsistent package files that cause
#   "Hash Sum mismatch" failures during apt-get. bookworm is the current
#   stable release with immutable, well-replicated packages.
#
# Why NOT install system chromium:
#   The Debian chromium package drags in 150+ transitive deps (systemd, GTK,
#   dbus, libz3, llvm, etc.) none of which are needed for headless rendering.
#   Instead we use `bunx remotion browser ensure` which downloads Remotion's
#   own pinned Chrome Headless Shell (~170 MB, self-contained, no apt needed).
#
# Why NOT Alpine:
#   Remotion's Rust renderer has >10 s startup penalty on musl libc (Alpine).
FROM node:22-bookworm-slim AS production
WORKDIR /app

# Minimal shared libs required by Chrome Headless Shell on bookworm.
# This list is exactly what Remotion documents at https://www.remotion.dev/docs/docker
RUN apt-get update && apt-get install -y --no-install-recommends --fix-missing \
    curl \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    && rm -rf /var/lib/apt/lists/*

# Install bun into the node image so we can run the app
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
COPY --from=oven/bun:1 /usr/local/bin/bunx /usr/local/bin/bunx

ENV NODE_ENV=production

# Copy application files
COPY --from=builder /app/node_modules    ./node_modules
COPY --from=builder /app/apps/remotion  ./apps/remotion
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/config ./packages/config
COPY --from=builder /app/package.json   ./

# Download Remotion's pinned Chrome Headless Shell.
# This runs as root before we drop privileges so it can write to the cache dir.
# The shell is cached in the image layer — no download at container start.
RUN cd apps/remotion && bunx remotion browser ensure

# Temp dir + non-root user in one layer
RUN mkdir -p /app/apps/remotion/temp \
    && groupadd -g 1001 nodejs \
    && useradd -u 1001 -g nodejs -m nodejs \
    && chown -R nodejs:nodejs /app

USER nodejs
WORKDIR /app/apps/remotion

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

CMD ["bun", "run", "src/server/index.ts"]
