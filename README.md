# SMOG

Sign-language learning platform with native, web, API, video composition,
payments, and administration.

## Stack

- **Native:** React Native 0.83 + Expo 55 + Expo Router
- **Web:** React 19 + Vite + TanStack Router/Query
- **API:** Hono + oRPC on Bun
- **Data:** Convex real-time database and functions
- **Authentication:** WorkOS
- **Video:** Mux streaming + Remotion composition
- **Payments:** Mollie
- **Analytics:** consent-gated, self-hosted OpenPanel
- **Monorepo:** Turborepo + Bun

## Quick Start

```bash
cp .env.example .env
bun install
bun dev
```

Web runs on `http://localhost:3001`, the API on
`http://localhost:3000`, and Remotion on `http://localhost:3002`.

## Commands

```bash
bun check
bun check-types
bun run build

bun -F web test
bun -F native test
bun -F @smog/convex test
bun -F @smog/hooks test
bun -F @smog/shared test
```

## Layout

```text
apps/
  native/       Expo mobile app
  web/          Vite web app and admin/sponsor portal
  server/       Hono API, auth callbacks, webhooks, email jobs
  remotion/     Sponsorship video renderer
packages/
  api/          oRPC routers
  auth/         WorkOS utilities and Mollie client
  convex/       Schema, queries, mutations, and cron jobs
  config/       Shared constants
  hooks/        Shared React hooks
  i18n/         Locale resources
  shared/       Analytics taxonomy, logging, and utilities
  styles/       Design tokens
  types/        Domain types
  ui/           Shared web UI
docs/           Architecture and operating documentation
```

Start with [Getting Started](./docs/GETTING_STARTED.md), then read
[Architecture](./docs/ARCHITECTURE.md),
[Privacy and Analytics](./docs/PRIVACY_AND_ANALYTICS.md), and the
[Release Guide](./docs/RELEASE.md).
