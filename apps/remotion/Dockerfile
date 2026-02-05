# Remotion Video Composition Service
# Builds the Remotion app with all dependencies for server-side rendering

FROM oven/bun:1 AS deps
WORKDIR /app

# Install dependencies - copy all workspace package.json files first
COPY package.json bun.lock bunfig.toml ./
COPY turbo.json ./
COPY apps/remotion/package.json ./apps/remotion/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/convex/package.json ./packages/convex/
COPY packages/hooks/package.json ./packages/hooks/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/styles/package.json ./packages/styles/
COPY packages/ui/package.json ./packages/ui/
RUN bun install --frozen-lockfile

# Build stage
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/remotion/node_modules ./apps/remotion/node_modules
COPY . .

# Build packages if needed
WORKDIR /app/packages/types
RUN bun run build 2>/dev/null || true

WORKDIR /app/apps/remotion

# Production stage
FROM oven/bun:1
WORKDIR /app

# Install Chrome dependencies for Remotion rendering
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/remotion ./apps/remotion
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/config ./packages/config
COPY --from=builder /app/package.json ./

# Create temp directory for video processing
RUN mkdir -p /app/apps/remotion/temp && chmod 777 /app/apps/remotion/temp

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/apps/remotion

EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

CMD ["bun", "run", "src/server/index.ts"]
