# syntax=docker/dockerfile:1.4
# Web application (Vite/React → Caddy static file server)

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY turbo.json ./
COPY packages/api/package.json     ./packages/api/
COPY packages/auth/package.json    ./packages/auth/
COPY packages/config/package.json  ./packages/config/
COPY packages/convex/package.json  ./packages/convex/
COPY packages/hooks/package.json   ./packages/hooks/
COPY packages/i18n/package.json    ./packages/i18n/
COPY packages/shared/package.json    ./packages/shared/
COPY packages/styles/package.json  ./packages/styles/
COPY packages/types/package.json   ./packages/types/
COPY packages/ui/package.json      ./packages/ui/
COPY apps/web/package.json         ./apps/web/

# Install workspace dependencies with a cached Bun package store.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install \
    && test -d node_modules \
    && test -d apps/web/node_modules \
    || (echo "ERROR: required node_modules directories are missing" && exit 1)

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS builder
WORKDIR /app

COPY --from=deps /app ./
COPY . .

# Build-time variables baked into the Vite bundle
ARG VITE_SERVER_URL
ARG VITE_WORKOS_CLIENT_ID
ARG VITE_WORKOS_REDIRECT_URI
ARG VITE_CONVEX_URL
ARG VITE_PUBLIC_POSTHOG_API_KEY
ARG VITE_PUBLIC_POSTHOG_HOST

ENV VITE_SERVER_URL=$VITE_SERVER_URL \
    VITE_WORKOS_CLIENT_ID=$VITE_WORKOS_CLIENT_ID \
    VITE_WORKOS_REDIRECT_URI=$VITE_WORKOS_REDIRECT_URI \
    VITE_CONVEX_URL=$VITE_CONVEX_URL \
    VITE_PUBLIC_POSTHOG_API_KEY=$VITE_PUBLIC_POSTHOG_API_KEY \
    VITE_PUBLIC_POSTHOG_HOST=$VITE_PUBLIC_POSTHOG_HOST

RUN cd apps/web && bun run build

# ── Stage 3: production ───────────────────────────────────────────────────────
# Caddy serves the static bundle and proxies API/auth routes to the server.
FROM caddy:2-alpine AS production
WORKDIR /srv

COPY --from=builder /app/apps/web/dist /srv
COPY apps/web/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

# ── Stage 4: development ──────────────────────────────────────────────────────
# Used by docker-compose for local dev with hot-reload via volume mounts.
FROM oven/bun:1-alpine AS development
WORKDIR /app

COPY --from=deps /app ./
# Source is bind-mounted at runtime; no COPY . . needed here.

EXPOSE 5173

CMD ["sh", "-c", "cd apps/web && bun run dev --host 0.0.0.0"]
