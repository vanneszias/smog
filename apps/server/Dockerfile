# syntax=docker/dockerfile:1.4
# API Server (Hono/Bun)

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY turbo.json ./
COPY packages/api/package.json     ./packages/api/
COPY packages/auth/package.json    ./packages/auth/
COPY packages/config/package.json  ./packages/config/
COPY packages/convex/package.json  ./packages/convex/
COPY packages/types/package.json   ./packages/types/
COPY packages/styles/package.json  ./packages/styles/
COPY packages/hooks/package.json   ./packages/hooks/
COPY packages/i18n/package.json    ./packages/i18n/
COPY packages/ui/package.json      ./packages/ui/
COPY apps/server/package.json      ./apps/server/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY --from=deps /app ./
COPY . .

RUN cd apps/server && bun run build

# ── Stage 3: production ───────────────────────────────────────────────────────
# The bun build bundles all @smog/* workspace packages and most npm deps into a
# single ESM file. Only `nodemailer` is kept external (see build.ts), so we
# install just that package instead of copying the full monorepo node_modules.
FROM oven/bun:1-alpine AS production
WORKDIR /app

RUN apk add --no-cache curl

# Install only the external runtime dependency
COPY apps/server/package.json ./package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun add nodemailer

# Copy the bundled output
COPY --from=builder /app/apps/server/dist ./dist

RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001 \
    && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["bun", "run", "dist/index.js"]

# ── Stage 4: development ──────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS development
WORKDIR /app

COPY --from=deps /app ./
# Source is bind-mounted at runtime via docker-compose volumes.

EXPOSE 3000
ENV NODE_ENV=development

CMD ["sh", "-c", "cd apps/server && bun run --hot src/index.ts"]
