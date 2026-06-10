# Architecture

> Last updated: June 10, 2026

## System

```text
Native (Expo 55) ───────────────┐
  WorkOS OAuth                  │ Convex SDK
  Convex queries/mutations      ├──────────────► Convex
  Mux playback                  │                 data + functions + cron
  OpenPanel after consent       │
                                │
Web (Vite + React) ─────────────┤
  public learning UI            │
  accounts and lists            │
  sponsor wizard + admin        │
  OpenPanel after consent       │
             │ oRPC             │
             ▼                  │
Server (Hono + Bun) ────────────┘
  WorkOS token exchange
  Mollie webhook
  email queue + scheduled jobs
  Remotion orchestration
             │
             ▼
Remotion service ──► Mux
  preview/final sponsor video composition
```

## Applications

### Native

`apps/native` uses Expo Router, WorkOS OAuth with PKCE, Convex real-time
queries/mutations, and Mux playback. SecureStore holds refresh tokens;
AsyncStorage holds non-secret preferences, guest identity, recent searches, and
analytics consent.

The previous SQLite gesture cache and offline favorites queue are no longer
present. Server-backed content currently needs network access.

### Web

`apps/web` is a Vite SPA with TanStack Router and TanStack Query. It provides
the public gesture library, lists, account tools, sponsor purchase flow, and
admin dashboard. It calls Convex directly for real-time data and the Hono/oRPC
server for workflows that require secrets or external services.

### Server

`apps/server` owns server-only credentials and:

- exchanges and refreshes WorkOS tokens;
- exposes oRPC and OpenAPI handlers;
- creates and verifies Mollie payments;
- handles Mollie webhooks;
- queues transactional email through BullMQ/Redis;
- runs sponsorship expiration, renewal, and stale-payment jobs;
- grants authenticated Remotion access to Mux source videos.

### Remotion

`apps/remotion` composes sponsor overlays. The API submits jobs and polls for
completion; Remotion obtains a temporary source URL from the server and uploads
the result to Mux.

## Packages

| Package | Responsibility |
|---|---|
| `@smog/api` | oRPC routers and request context |
| `@smog/auth` | WorkOS types/config/token helpers and Mollie client |
| `@smog/config` | Shared constants and URLs |
| `@smog/convex` | Schema, generated bindings, functions, and cron jobs |
| `@smog/hooks` | Shared React behavior |
| `@smog/i18n` | Locale resources |
| `@smog/shared` | Analytics event types, logging, errors, OpenTelemetry |
| `@smog/styles` | Design tokens |
| `@smog/types` | Domain types |
| `@smog/ui` | Shared web components |

## Security Boundaries

- WorkOS and Mollie secrets exist only on the server.
- The web receives only public `VITE_*` configuration and never an OpenPanel
  client secret.
- Native OpenPanel uses a separate least-privileged client credential.
- Internal email and Remotion routes require service bearer tokens.
- Convex validates WorkOS JWTs for authenticated functions.
- Optional analytics is disabled until explicit consent.

See [Data Flow](./DATA_FLOW.md), [Payment Flow](./PAYMENT_FLOW.md), and
[Privacy and Analytics](./PRIVACY_AND_ANALYTICS.md).
