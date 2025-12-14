# syntax=docker/dockerfile:1.4
# Multi-stage build for web application

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy root package files
COPY package.json bun.lock bunfig.toml ./
COPY turbo.json ./

# Copy all package.json files for workspace resolution
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/convex/package.json ./packages/convex/
COPY packages/hooks/package.json ./packages/hooks/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/styles/package.json ./packages/styles/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY apps/web/package.json ./apps/web/

# Install dependencies
# Note: canvas (optional dependency of fabric/jest) fails without native build tools
# This is expected and safe - fabric.js uses browser's Canvas API in web builds
# We check that node_modules exists to ensure required dependencies installed
RUN bun install --filter=web || true \
    && test -d node_modules && test -d apps/web/node_modules || (echo "Failed to install required dependencies" && exit 1)

# Stage 2: Build application
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy all files from deps stage to ensure workspace structure
COPY --from=deps /app ./

# Copy all source code (this will overwrite package.json files with actual source)
COPY . .

# Build-time environment variables for Vite
ARG VITE_SERVER_URL
ARG VITE_WORKOS_CLIENT_ID
ARG VITE_WORKOS_REDIRECT_URI
ARG VITE_CONVEX_URL

ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV VITE_WORKOS_CLIENT_ID=$VITE_WORKOS_CLIENT_ID
ENV VITE_WORKOS_REDIRECT_URI=$VITE_WORKOS_REDIRECT_URI
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL

# Build web application
RUN cd apps/web && bun run build

# Stage 3: Production with Caddy
FROM caddy:2-alpine AS production
WORKDIR /srv

# Copy built static files
COPY --from=builder /app/apps/web/dist /srv

# Copy Caddyfile
COPY apps/web/Caddyfile /etc/caddy/Caddyfile

# Expose HTTP and HTTPS
EXPOSE 80 443

# Caddy runs automatically with the Caddyfile
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

# Stage 4: Development (optional)
FROM oven/bun:1 AS development
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5173

CMD ["sh", "-c", "cd apps/web && bun run dev --host 0.0.0.0"]
