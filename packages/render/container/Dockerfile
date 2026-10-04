# syntax=docker/dockerfile:1
#
# The SmogRenderer image (phase 7 rulings 3 and 17): Bun, Remotion and
# Chrome Headless Shell, running the render server (`src/server/main.ts`)
# on port 8080. linux/amd64 only, the one architecture Containers run.
#
# Build context: the repository root (`.dockerignore` there), as
# `apps/site/render-config.ts` gives it to wrangler, and as CI builds it:
#   docker build --platform linux/amd64 -f packages/render/container/Dockerfile .
#
# Both Bun images are Debian trixie, pinned by digest (the multi-arch index;
# checked against Docker Hub on 2026-10-04).

# 1. prune: only the workspaces @smog/render needs, and their lockfile.
FROM oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS prune
WORKDIR /repo
COPY . .
# turbo is the root devDependency's version (package.json).
RUN bunx turbo@2.11.5 prune @smog/render --docker --out-dir /out

# 2. build: every dependency (the bundler is a devDependency), then the
# Remotion bundle, made once here and never at request time.
FROM oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS build
WORKDIR /app
COPY --from=prune /out/json/ ./
RUN bun install --frozen-lockfile
COPY --from=prune /out/full/ ./
WORKDIR /app/packages/render
RUN RENDER_BUNDLE_DIR=/app/bundle bun src/server/bundle.ts

# 3. deps: the runtime tree. Production dependencies of @smog/render only,
# the sources it runs (no tests), and Chrome Headless Shell, which Remotion
# downloads into packages/render/node_modules/.remotion (it resolves that
# directory from the working directory, so the server runs from there too).
FROM oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS deps
WORKDIR /app
COPY --from=prune /out/json/ ./
RUN bun install --frozen-lockfile --production --filter @smog/render
COPY --from=prune /out/full/packages/config/ ./packages/config/
COPY --from=prune /out/full/packages/styles/ ./packages/styles/
COPY --from=prune /out/full/packages/utils/ ./packages/utils/
COPY --from=prune /out/full/packages/render/src/ ./packages/render/src/
# The pruned manifests of workspaces the server never loads, and every test.
RUN rm -rf packages/email packages/i18n packages/jobs \
  && find packages \( -name '*.test.ts' -o -name '*.test.tsx' \) -delete
WORKDIR /app/packages/render
RUN bun src/server/ensure-browser.ts

# 4. runtime: the slim image, Chrome's shared libraries and the fonts.
FROM oven/bun:1.3.11-slim@sha256:478281fdd196871c7e51ba6a820b7803a8ae97042ec86cdbc2e1c6b6626442d9 AS runtime

# Chrome Headless Shell's libraries (Remotion's Docker list, with trixie's
# 64-bit time_t names). `apt-cache policy` prints each installed version in
# the build log, which proves every name.
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    libasound2t64 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libcairo2 \
    libcups2t64 \
    libdbus-1-3 \
    libgbm1 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2; \
  apt-cache policy ca-certificates libasound2t64 libatk-bridge2.0-0t64 \
    libatk1.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libgbm1 libnss3 \
    libpango-1.0-0 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
    libxrandr2; \
  rm -rf /var/lib/apt/lists/*

# Noto for the scripts Inter lacks (Arabic, Hebrew, Devanagari, Thai, …;
# task 3 review, I-1). Its own layer, so the lane can log what it adds. No
# CJK (fonts-noto-cjk, about 100 MB).
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends fonts-noto-core; \
  apt-cache policy fonts-noto-core; \
  rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 renderer \
  && useradd --uid 1001 --gid 1001 --create-home renderer

ENV NODE_ENV=production \
  PORT=8080 \
  RENDER_BUNDLE_DIR=/app/bundle \
  RENDER_TMP_DIR=/tmp/smog-render

COPY --from=deps --chown=1001:1001 /app /app
COPY --from=build --chown=1001:1001 /app/bundle /app/bundle

USER 1001
WORKDIR /app/packages/render
EXPOSE 8080
CMD ["bun", "src/server/main.ts"]
