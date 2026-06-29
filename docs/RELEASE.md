# Release Guide

Simple maintainer checklist for a production release.

## Release Order

1. Prepare and verify the release locally.
2. Deploy Convex schema and functions.
3. Build and publish Docker images for server, web, and remotion.
4. Deploy the Docker stack with the published image tag.
5. Build and submit native apps with EAS.
6. Verify production health and core user flows.

## Required Environment

Keep production values in the deployment host `.env` and in the CI/build system that publishes images. Do not commit real secrets.

Docker deployment values:

```env
REGISTRY_IMAGE_PREFIX=vanneszias
IMAGE_TAG=<git-sha-or-release-tag>
```

Server and Remotion runtime values:

```env
CONVEX_URL=https://<deployment>.convex.cloud
WORKOS_CLIENT_ID=<workos-client-id>
WORKOS_CLIENT_SECRET=<workos-client-secret>
MOLLIE_API_KEY=<mollie-live-key>
CORS_ORIGIN=https://app.smog.vlaanderen
MUX_TOKEN_ID=<mux-token-id>
MUX_TOKEN_SECRET=<mux-token-secret>
REMOTION_API_KEY=<shared-server-remotion-secret>
INTERNAL_API_KEY=<internal-service-secret>
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM="Smog <no-reply@example.com>"
```

Optional runtime values:

```env
OPENPANEL_API_URL=https://analytics.zias.be/api
OPENPANEL_CLIENT_ID=<web-openpanel-client-id>
OPENPANEL_CLIENT_SECRET=<web-openpanel-client-secret>
IMAP_HOST=<imap-host>
IMAP_PORT=993
IMAP_USER=<imap-user>
IMAP_PASS=<imap-password>
SMTP_REPLY_TO=info@smog.vlaanderen
OTEL_SERVICE_NAME=smog-server
OTEL_EXPORTER_OTLP_ENDPOINT=<otlp-http-endpoint>
OTEL_EXPORTER_OTLP_HEADERS=<otlp-headers>
```

The root `compose.yml` sets container-internal production values for `REDIS_URL`, `REMOTION_URL`, and `SERVER_URL`. The web image bakes Vite values at image build time, so set these before publishing `smog-web`:

```env
VITE_SERVER_URL=https://app.smog.vlaanderen
VITE_WORKOS_CLIENT_ID=<workos-client-id>
VITE_WORKOS_REDIRECT_URI=https://app.smog.vlaanderen/callback
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_OPENPANEL_API_URL=https://analytics.zias.be/api
VITE_OPENPANEL_CLIENT_ID=<web-openpanel-client-id>
```

Native EAS builds need these public build-time values configured in the EAS environment for the `production` profile:

```env
EXPO_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
EXPO_PUBLIC_SERVER_URL=https://app.smog.vlaanderen
EXPO_PUBLIC_WORKOS_CLIENT_ID=<workos-client-id>
EXPO_PUBLIC_OPENPANEL_API_URL=https://analytics.zias.be/api
EXPO_PUBLIC_OPENPANEL_CLIENT_ID=<native-openpanel-client-id>
EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET=<native-openpanel-client-secret>
```

Convex production also needs its deployment environment configured for authentication and any server-called functions. At minimum, set `WORKOS_CLIENT_ID` for Convex auth.

## Preflight

From the repo root:

```bash
bun install
bun run release:check
```

`release:check` runs Biome, TypeScript, all configured tests, the full build, and `knip`. It suppresses Expo configuration hints but still fails on real unused-code or dependency issues. If a test package is unavailable for the release branch, record that in the release notes before continuing.

## Convex

Deploy Convex before application images so new clients and server code can call the latest functions:

```bash
bun -F @smog/convex deploy
```

After deploy, confirm the production deployment URL matches `CONVEX_URL`, `VITE_CONVEX_URL`, and `EXPO_PUBLIC_CONVEX_URL`.

## Docker Images

The `.builds/docker-*.yml` recipes publish these images:

```text
$REGISTRY_IMAGE_PREFIX/smog-server:$IMAGE_TAG
$REGISTRY_IMAGE_PREFIX/smog-web:$IMAGE_TAG
$REGISTRY_IMAGE_PREFIX/smog-remotion:$IMAGE_TAG
```

For a manual image release, run equivalent builds from the repo root:

```bash
docker build --target production -f apps/server/Dockerfile -t "$REGISTRY_IMAGE_PREFIX/smog-server:$IMAGE_TAG" .
docker build --target production -f apps/remotion/Dockerfile -t "$REGISTRY_IMAGE_PREFIX/smog-remotion:$IMAGE_TAG" .
docker build --target production \
  --build-arg "VITE_SERVER_URL=$VITE_SERVER_URL" \
  --build-arg "VITE_WORKOS_CLIENT_ID=$VITE_WORKOS_CLIENT_ID" \
  --build-arg "VITE_WORKOS_REDIRECT_URI=$VITE_WORKOS_REDIRECT_URI" \
  --build-arg "VITE_CONVEX_URL=$VITE_CONVEX_URL" \
  --build-arg "VITE_OPENPANEL_API_URL=$VITE_OPENPANEL_API_URL" \
  --build-arg "VITE_OPENPANEL_CLIENT_ID=$VITE_OPENPANEL_CLIENT_ID" \
  -f apps/web/Dockerfile \
  -t "$REGISTRY_IMAGE_PREFIX/smog-web:$IMAGE_TAG" .
docker push "$REGISTRY_IMAGE_PREFIX/smog-server:$IMAGE_TAG"
docker push "$REGISTRY_IMAGE_PREFIX/smog-remotion:$IMAGE_TAG"
docker push "$REGISTRY_IMAGE_PREFIX/smog-web:$IMAGE_TAG"
```

## Docker Deployment

On the production host, keep the checked-out release and `.env` in the same directory as `compose.yml`, then run:

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

The root compose stack starts Redis, Remotion, server, and web/Caddy. Web is the only public service and binds ports `80` and `443`.

## EAS Native

After backend and web are live, build and submit native apps:

```bash
cd apps/native
eas build --platform all --profile production
eas submit --platform all --profile production
```

Use a new binary release for native dependency, config, permission, or SDK changes. Use an EAS Update only for compatible JavaScript/assets changes on the current runtime version.

## Verification

Run these checks from the production host:

```bash
docker compose ps
docker compose exec redis-session redis-cli ping
docker compose exec server curl -fsS http://localhost:3000/health
docker compose exec remotion curl -fsS http://localhost:3002/health
curl -fsS https://app.smog.vlaanderen/health
```

Then verify the main flows manually:

- Sign in with WorkOS.
- Load gesture data from Convex in web and native.
- Open the admin/sponsor portal.
- Start a Mollie test or low-value payment flow if the release touches payments.
- Trigger a sponsorship render if the release touches Remotion, Mux, or video code.
- Confirm transactional email delivery if the release touches email templates or queues.

## Rollback Basics

Docker rollback:

```bash
IMAGE_TAG=<previous-known-good-tag> docker compose pull
IMAGE_TAG=<previous-known-good-tag> docker compose up -d
docker compose ps
```

Convex rollback means redeploying the previous compatible Convex code. If the release included a data migration, confirm the old code still supports the migrated data before rolling back.

Native rollback depends on the change type. For JavaScript-only updates, republish or select the previous EAS Update group for the `production` channel. For binary changes, submit the previous known-good build or a hotfix build through the stores.

If rollback is expected to take more than a few minutes, start the maintenance page from the production checkout:

```bash
docker compose -f maintenance/compose.yml up -d
```
