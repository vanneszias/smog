# SMOG Architecture

> Last updated: June 10, 2026

## Overview

SMOG is a sign-language learning platform consisting of:

- **Native app** — Expo/React Native offline-first mobile app
- **Web app** — Vite/React sponsor purchase and admin portal
- **Server** — Hono/Bun API server (oRPC, email, webhooks)
- **Convex** — Real-time cloud database and serverless functions
- **Remotion** — Server-side video composition for sponsorship overlays

All apps live in a **Turborepo monorepo** managed with **Bun**.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        SMOG Monorepo                            │
│                                                                 │
│  apps/native ──────────────────────────────────────────────┐   │
│  (Expo/React Native)                                        │   │
│  ├─ Offline-first SQLite (databaseService)                  │   │
│  ├─ Convex real-time sync (convexSyncService)               │   │
│  └─ Gesture video playback (VideoPlayer → expo-video)       │   │
│                                              │ Convex SDK   │   │
│  apps/web ─────────────────────────────────┐│              │   │
│  (Vite + React + TanStack Router/Query)     ││              │   │
│  ├─ Sponsor purchase wizard (3-step)        ││              ▼   │
│  ├─ Admin dashboard                         ││    ┌──────────┐  │
│  └─ oRPC client → apps/server               ││    │  Convex  │  │
│                              │ HTTP/oRPC    ││    │  Cloud   │  │
│  apps/server ────────────────┘              ││    │(database │  │
│  (Hono + Bun)                               ││    │+ cron)   │  │
│  ├─ oRPC API routers (packages/api)         ││    └──────────┘  │
│  ├─ Mollie payment webhooks                 ││         ▲        │
│  ├─ Email queue (BullMQ + Redis)            ││         │        │
│  └─ Remotion render jobs                    ││    Convex SDK    │
│                    │ HTTP API                ││         │        │
│  apps/remotion ────┘                        ││         │        │
│  (Remotion v4)                              ││    packages/convex│
│  ├─ Sponsorship video composition           ││    (@smog/convex) │
│  └─ MUX upload                             ─┘│         │        │
│                                              │    mutations/     │
│  packages/                                   │    queries/       │
│  ├─ @smog/api       — oRPC routers           │    schema         │
│  ├─ @smog/auth      — Better Auth + Mollie   │                   │
│  ├─ @smog/config    — constants + URLs       │                   │
│  ├─ @smog/convex    — generated Convex API   │                   │
│  ├─ @smog/hooks     — shared React hooks     │                   │
│  ├─ @smog/i18n      — locale JSON files      │                   │
│  ├─ @smog/shared    — logger + error handler │                   │
│  ├─ @smog/styles    — design tokens          │                   │
│  ├─ @smog/types     — domain types           │                   │
│  └─ @smog/ui        — shared web components  │                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package Dependency Graph

```
@smog/config  (no deps)
    ↑
@smog/types   (no runtime deps)
@smog/styles  (no runtime deps)
@smog/i18n    (no runtime deps)
    ↑
@smog/shared  (@smog/config)
@smog/convex  (convex)
    ↑
@smog/auth    (@smog/convex, zod)
    ↑
@smog/api     (@smog/auth, @smog/convex, zod, orpc)
    ↑
@smog/hooks   (@smog/types, react, fuse.js)
@smog/ui      (@smog/types, @smog/hooks, react, mux-player)
    ↑
apps/native   (all @smog/* packages)
apps/web      (all @smog/* packages)
apps/server   (@smog/api, @smog/auth, @smog/convex)
apps/remotion (@smog/types)
```

---

## Key Architectural Decisions

### 1. Offline-First Native App

The native app stores all gesture and category data locally in SQLite (`gestures.db`). The `convexSyncService` syncs data in the background every 2 hours. This means:

- Gestures are available immediately without network
- Users can browse and favourite gestures offline
- Sync failures are graceful (retried with exponential backoff)

See [SYNC_STRATEGY.md](./SYNC_STRATEGY.md) for details.

### 2. Convex as the Source of Truth

Convex is the authoritative backend database. The native SQLite and web TanStack Query caches are derived views. Convex provides:

- Real-time subscriptions (gestures, categories)
- Server-side mutations with validation
- Scheduled cron jobs (sponsorship expiry)
- GDPR data deletion

### 3. oRPC for Type-Safe HTTP API

The `apps/server` Hono server exposes an oRPC API consumed by `apps/web`. All routes are defined in `packages/api/src/routers/` with Zod input/output schemas. The oRPC client in `apps/web` provides end-to-end type safety without code generation.

### 4. Remotion for Video Composition

When a sponsor purchases a sponsorship, `apps/server` enqueues a Remotion render job. The Remotion server composes the sponsor overlay (name + optional logo) onto the gesture video and uploads the result to MUX. The MUX playback ID is then stored in Convex.

### 5. Mollie for Payments

The sponsorship purchase flow uses Mollie as the payment provider:

1. Sponsor selects gestures and fills in details
2. Web app calls `POST /api/sponsorships/create-bulk-payment`
3. Server creates a Mollie payment and returns a checkout URL
4. Sponsor completes payment on Mollie's hosted checkout page
5. Mollie sends a webhook to `POST /api/webhooks/mollie`
6. Server updates sponsorship status to `pending_approval`
7. Admin reviews and approves/rejects

See [PAYMENT_FLOW.md](./PAYMENT_FLOW.md) for the full flow.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Mobile | React Native + Expo | SDK 54 |
| Web | Vite + React | React 19 |
| Routing (web) | TanStack Router | v1 |
| Data fetching | TanStack Query + oRPC | v5 |
| Backend | Hono + Bun | latest |
| Database | Convex + SQLite | latest |
| Auth | Better Auth | latest |
| Payments | Mollie | v3 |
| Video | MUX + expo-video | latest |
| Composition | Remotion | v4 |
| Monorepo | Turborepo + Bun | latest |
| Types | TypeScript | 5.8+ |
| Linting | Biome | latest |
