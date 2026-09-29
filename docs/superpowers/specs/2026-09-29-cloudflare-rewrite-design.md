# SMOG rewrite on Cloudflare + Bun: design spec

Date: 2026-09-29 · Branch: `develop` (staging) · Status: approved for execution (autonomous run, see `docs/DECISIONS.md`)

This spec describes **how** the new SMOG platform is built. **What** it must do is fixed by the feature inventory (`2026-09-29-feature-inventory.md`), which in turn was derived from the old system (`docs/superpowers/analysis/*.md`, a read of `origin/master`). Where the two disagree, the inventory's business rules win unless this spec explicitly changes them (every change is also recorded in `docs/DECISIONS.md`).

---

## 1. Goals and non-goals

Goals
- Feature parity with the old platform (Convex + Hono + Vite + Expo + Remotion), plus the listed improvements.
- One Cloudflare Worker (`apps/site`) and one Expo app (`apps/mobile`). Everything else is a package.
- Nothing written twice: one API contract, one set of query hooks, one set of design tokens, one set of translations, one search ranking, one pricing function, one state machine.
- Runs fully locally (`bun dev`, Miniflare D1/R2/KV/Queues/Workflows) with no Cloudflare account.
- Newest stable version of every dependency. A deviation needs a concrete incompatibility and a DECISIONS entry.

Non-goals
- No deployment from this run, no custom domains yet (workers.dev), no Payload / Next.js / OpenNext / Convex / WorkOS / Redis / BullMQ / node-cron / nodemailer / IMAP / Docker-hosted site / AWS / Remotion Lambda, no third app, no guest rows in the database.

## 2. Principles

1. **Ecosystem first**: Web standards and Workers runtime APIs → Cloudflare bindings → Bun built-ins (tooling, scripts, tests, container) → approved libraries → anything else (needs a DECISIONS entry).
2. **Workers code never uses `Bun.*`.** Bun is for scripts, tests, the render container and the toolchain.
3. **Thin apps.** Apps contain routing, screens and wiring. Logic lives in packages. Screens compose kit components; no one-off styling in apps.
4. **One-way dependencies** (§4). Enforced by workspace deps, TS project references, knip and `scripts/check-boundaries.ts`.
5. **Validate at the edges.** Env and bindings validated once per runtime (`@smog/config`), every oRPC input validated with Zod, every JSON column validated with Zod on read and write.
6. **Typed errors.** oRPC typed errors in the contract; server logs use the `[serviceName] Failed to …` prefix and rethrow.
7. **Test first.** Every service and router has tests before code (§13).

## 3. Toolchain

| Concern | Choice |
|---|---|
| Runtime / package manager | Bun (latest 1.3.x), workspaces `apps/*`, `packages/*`, `packages/features/*`; Bun catalogs pin shared versions once in the root `package.json` |
| Task runner | Turborepo 2.x (read the installed package's `docs/` before changing config, see `AGENTS.md`) |
| Lint / format | Biome 2.x with `ultracite` presets (`ultracite/biome/core`, `/react`) |
| Unused code/deps | knip 6 (oxc based, no TypeScript API dependency) |
| Dependency direction | `scripts/check-boundaries.ts` (Bun) against the graph in `@smog/config/boundaries` |
| TypeScript | 7.x (native `tsc`), strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, project references (`tsc -b`) |
| Tests | `bun test` (pure packages), Vitest 4 + `@cloudflare/vitest-pool-workers` (anything touching D1/R2/KV/Queues), Playwright (site e2e, Chromium at `/opt/pw-browsers`), Jest + `jest-expo` (mobile) |
| Mobile linker | `bunfig.toml` `[install] linker = "hoisted"` (Expo needs a single copy of each native module) |

Root scripts: `dev`, `build`, `check` (Biome write), `check:ci`, `check-types`, `test`, `test:e2e`, `knip`, `boundaries`, `release:check`.

`release:check` = `check:ci` → `boundaries` → `check-types` → `test` → `build` → `knip` → `bun audit --production` → `mobile:release-check` (runs `expo-doctor` and `expo export` for iOS + Android).

## 4. Repository layout and package graph

```text
apps/
  site/                 TanStack Start on Cloudflare Workers (see §9)
  mobile/               Expo + Expo Router + NativeWind (see §10)
packages/
  config/               tsconfig bases, biome base, env schemas per runtime, constants, boundaries graph
  utils/                genuinely generic helpers only (slugify, normalizeText, ids, dates, money)
  db/                   Drizzle schema, migrations, query helpers, seed, fixtures, test helpers
  auth/                 Better Auth server factory, web + Expo clients, React session provider, roles
  rpc/                  oRPC base: context type, procedure builders, middleware, error map, React RPC provider
  local-store/          typed on-device store (web: localStorage, native: AsyncStorage) + guest data schema
  features/
    gestures/           catalogue, categories, FTS search + ranking, related gestures, recent searches
    favorites/          favorites (server table + local guest store)
    lists/              lists, items, ordering, share links
    account/            profile, consent log, data export, deletion, guest → user import
    sponsorships/       wizard schema, pricing, state machine, lifecycle services, re-edit, renewals
    admin/              dashboard stats, gesture/category CRUD, moderation, users, audit log, CSV export
  payments/             Mollie client wrapper, webhook verification (re-fetch), payment state machine
  video/                Mux client helpers (uploads, assets, master access, webhooks, URLs) + player props
  render/               Remotion compositions, render contract (Zod), container image (Dockerfile + Bun entry)
  email/                React Email templates + EmailSender interface + Cloudflare/dev senders
  jobs/                 typed queue messages, producers, consumers, cron schedule definitions, workflows
  analytics/            OpenPanel wrappers, event taxonomy, consent gate (./web, ./native, ./server)
  i18n/                 en / fr / nl catalogues, typed keys, i18next setup helpers
  styles/               design tokens, generated Tailwind v4 theme CSS + NativeWind Tailwind config
  brand/                logo artwork + icon generator (ported from the reference branch)
  ui-web/               web component kit (Tailwind v4, Radix primitives, cva)
  ui-native/            native component kit (NativeWind)
scripts/
  migrate-from-convex/  one-off data migration (Bun)
  check-boundaries.ts, release-config-check.ts, mobile-release-check.ts
```

Package names: `@smog/<dir>` (`@smog/gestures`, not `@smog/features-gestures`).

### 4.1 Allowed dependencies (enforced)

```text
apps/site    → api, auth, rpc, db, jobs, render, analytics, email, payments, video, features/*, local-store, i18n, styles, brand, ui-web, config, utils
apps/mobile  → api (client only), auth (./expo), rpc (./react), features/* (./client, ./schema), local-store, analytics (./native), i18n, styles, brand, ui-native, config, utils
api          → rpc, features/*, config
features/*   → rpc, db, auth, local-store, payments, video, email, jobs, render (./contract only), analytics (./server), i18n, config, utils
               (a feature may import another feature's ./schema only; never its ./server)
jobs         → db, email, payments, video, render (./contract), config, utils
payments     → config, utils
video        → config, utils
render       → config, utils, styles, brand          (compositions import tokens + logo)
email        → i18n, styles, brand, config, utils
auth         → db, email, config, utils
rpc          → auth, db, config, utils
db           → config, utils
local-store  → config, utils
analytics    → config, utils
ui-web       → styles, i18n, brand, utils
ui-native    → styles, i18n, brand, utils
brand        → styles, config                       (the icon generator reads brand colours from tokens)
i18n, styles, utils → config (or nothing)
```

Circularity note: feature services need jobs (to enqueue email) and jobs consumers need feature logic (for example, expiring sponsorships). The rule is that **jobs owns only message types, producers and scheduling**. The consumer and cron **handlers** that call feature services are wired in `apps/site/src/worker/*`, which may import both.

### 4.2 Feature package shape

Each `packages/features/<name>` exposes subpath exports:

| Subpath | Contents | Runs on |
|---|---|---|
| `./schema` | Zod schemas + inferred types shared by contract, server and UI | everywhere |
| `./contract` | oRPC contract (`oc.input().output().errors()`), no implementation | everywhere |
| `./server` | services (pure functions taking `{ db, env, ... }`) + router implementing the contract | Worker only |
| `./client` | React hooks built on the typed oRPC TanStack Query utils + local-store fallback | site + mobile |
| `./testing` | factories/fixtures (optional) | tests |

The `./client` hooks never import `./server`. Bundlers only see `./client` and `./schema` from the apps.

## 5. Data model (D1 + Drizzle)

Full reference with ER diagram: `docs/DATA_MODEL.md` (written in phase 2 from this section). Conventions:

- IDs: text primary keys, `crypto.randomUUID()` (Better Auth tables use Better Auth's generator). Migrated rows keep their Convex `_id` in a `legacy_id` column (unique, nullable) for redirects and idempotent re-runs.
- Timestamps: `created_at`, `updated_at` as integer milliseconds (`integer({ mode: "timestamp_ms" })`), set by the service layer. Soft delete / publish uses nullable timestamps (`published_at`, `archived_at`, `revoked_at`), never `isActive` booleans.
- Every foreign key is declared with an explicit `ON DELETE` rule. Every column that is queried by gets an index. Uniqueness is enforced by the database, not code.
- Enums are `text` columns with `CHECK` constraints generated from a shared `const` array (Drizzle `text({ enum })` + `check()`).
- JSON columns are `text({ mode: "json" })` and always validated by a Zod schema at the service boundary.

### 5.1 Auth (Better Auth-owned tables)

`user` (id, name, email unique, email_verified, image, created_at, updated_at, **role** `user|admin` default `user`, banned, ban_reason, ban_expires (admin plugin), **locale** `en|fr|nl` nullable, legacy_id), `session` (… + impersonated_by), `account` (provider accounts incl. `credential`), `verification`, `passkey`. Generated with the Better Auth CLI into `packages/db/src/schema/auth.ts`, then owned by us.

App data for a user hangs off `user.id` directly; there is no parallel users table. **Guests never have rows.**

### 5.2 Learning

```text
category        id, slug unique, name, sort_order, published_at?, created_at, updated_at, legacy_id?
gesture         id, slug unique, name, description, playback_id, mux_asset_id?, published_at?,
                created_at, updated_at, legacy_id?
gesture_category gesture_id → gesture ON DELETE CASCADE, category_id → category ON DELETE CASCADE,
                 PK(gesture_id, category_id), index(category_id)
gesture_keyword  gesture_id → gesture ON DELETE CASCADE, keyword, position, PK(gesture_id, keyword)
                 ("concept" in the old model: synonyms / related concepts shown on the detail page)
gesture_fts      FTS5 virtual table (gesture_id UNINDEXED, name, keywords, categories, description),
                 tokenize = "unicode61 remove_diacritics 2"; maintained by the gestures service
                 (reindexGesture in the same D1 batch as every write); created by a hand-written migration
favorite         user_id → user CASCADE, gesture_id → gesture CASCADE, created_at, PK(user_id, gesture_id),
                 index(gesture_id)
list             id, owner_id → user CASCADE, name (1..80), description? (≤280), created_at, updated_at,
                 index(owner_id, updated_at)
list_item        list_id → list CASCADE, gesture_id → gesture CASCADE, position integer, added_by → user SET NULL,
                 created_at, PK(list_id, gesture_id), index(list_id, position)
list_share       id, list_id → list CASCADE, role view|edit, token unique (32 random bytes, base64url),
                 created_by → user SET NULL, created_at, revoked_at?; partial unique (list_id, role) WHERE revoked_at IS NULL
```

- Favorites are **one** model: the `favorite` table. There is no "default favorites" list. The old default list and `user_favorites` are merged into `favorite` by the migration.
- Unpublished gestures and categories (`published_at IS NULL`) are hidden from public queries but kept for admins.
- The sponsored video is **not** written into `gesture.playback_id`. Public gesture queries join the live sponsorship's video (§5.4). Expiry therefore needs no "restore original video" step.

### 5.3 Account, consent, audit

```text
consent_event   id, user_id → user CASCADE, purpose analytics|marketing, granted boolean, policy_version,
                source web|mobile|import, created_at; index(user_id, purpose, created_at)   (append-only)
audit_log       id, actor_id → user SET NULL, action (enum), target_type (enum), target_id, data json (Zod per action),
                created_at; index(created_at), index(target_type, target_id), index(action, created_at)
```

- The consent log is append-only; the current state is the newest row per purpose. IP address and user agent are **not** stored (not required by the privacy policy; data minimisation). Guests keep their consent choice on the device only.
- `audit_log.data` is a discriminated union keyed by `action`, defined in `@smog/admin/schema` and validated on insert. Rows are kept 3 years (monthly cron). When an admin deletes their account, `actor_id` becomes NULL and the rows stay.

### 5.4 Sponsorships

The old single `sponsorships` god-table becomes:

```text
sponsor           id, name (contact full name, 1..120), email (≤254), company? (≤120), locale en|fr|nl,
                  created_at                                   (one row per checkout; the person who pays)
invoice_request   sponsor_id PK → sponsor CASCADE, name (≤160), vat_number (BE, mod-97 validated), email (≤254)
sponsorship       id, sponsor_id → sponsor RESTRICT, gesture_id → gesture RESTRICT, display_name (1..35, shown in video),
                  logo_key? (R2), status (enum §5.5), starts_at?, ends_at?, video_playback_id?, video_asset_id?,
                  reminder_sent_at?, created_at, updated_at, legacy_id?
                  partial unique (gesture_id) WHERE status IN (blocking statuses)   ← one active/pending sponsorship per gesture
                  index(status, ends_at), index(sponsor_id)
payment           id, mollie_id unique?, kind initial|renewal, status open|paid|failed|canceled|expired|refund_needed,
                  amount_cents, currency 'EUR', checkout_url?, paid_at?, created_at, updated_at, index(status, created_at)
payment_item      payment_id → payment CASCADE, sponsorship_id → sponsorship RESTRICT, amount_cents, includes_logo,
                  PK(payment_id, sponsorship_id)
render_job        id, sponsorship_id → sponsorship CASCADE, status queued|running|succeeded|failed, workflow_instance_id,
                  input json (render contract), mux_upload_id?, mux_asset_id?, playback_id?, error?, attempt,
                  created_at, updated_at, finished_at?; index(sponsorship_id, created_at)
sponsorship_event id, sponsorship_id → sponsorship CASCADE, type (enum), actor_id → user SET NULL?, data json (Zod per type),
                  created_at; index(sponsorship_id, created_at)      (review trail: rejection reasons, approvals, re-edits …)
sponsorship_token id, sponsorship_id → sponsorship CASCADE, purpose reedit|renewal, token_hash unique (SHA-256),
                  expires_at, used_at?, created_at
```

- One Mollie payment covers many sponsorships through `payment_item` (the old model duplicated `molliePaymentId` across rows).
- Prices are stored per item (`amount_cents`) and computed only by `@smog/sponsorships` `priceSponsorship()`.
- Tokens are stored hashed. The raw token appears only in the link (email or admin copy button). The admin can regenerate a token, which revokes older ones.

### 5.5 Sponsorship state machine (enforced in `@smog/sponsorships`)

```text
awaiting_payment ──paid──▶ rendering ──render ok──▶ in_review ──approve──▶ live ──reminder cron──▶ expiring ──expiry cron──▶ expired
       │                      │  ▲                     │  │                  │                       │  ▲
       │                      │  └──retry (admin)──┐   │  └──reject──▶ rejected                        │  └── renewal paid (ends_at += 1y) → live
       │                      └──render failed──▶ render_failed           │                          │
       │                                                                  │                          └──force expire (admin) → expired
       ├──stale 24h / payment failed|canceled|expired──▶ cancelled        │
       └──admin "mark paid manually"──▶ rendering                          │
in_review | rejected ──request changes (re-edit link)──▶ changes_requested ──sponsor resubmits──▶ rendering
live | expiring ──force expire (admin)──▶ expired
```

- Blocking statuses (gesture cannot get another sponsorship): `awaiting_payment, rendering, render_failed, in_review, changes_requested, live, expiring`.
- Terminal: `rejected, cancelled, expired`.
- `transition(current, event)` is a pure function with an exhaustive table and tests. Every transition writes a `sponsorship_event` row in the same D1 batch.
- The old flow rendered previews before payment and approved the uploaded preview. The new flow shows a **live Remotion Player preview in the browser** (no server render, no orphan Mux assets) and renders the final video **once, after payment** (§8).
- Approval sets `starts_at = now`, `ends_at = now + 365 days` (old behaviour). A renewal adds 365 days to `ends_at` and moves `expiring → live`.
- A late "paid" webhook for a `cancelled` sponsorship revives it (`→ rendering`) if the gesture is still free. Otherwise the payment is marked `refund_needed`, admins are emailed, and the webhook returns 200 (so Mollie stops retrying).

### 5.6 Pricing (unchanged business rules)

- `PRICE_PER_GESTURE_YEAR_CENTS = 5000` and `LOGO_ADDON_PER_GESTURE_CENTS = 1000`. The duration is fixed at 1 year.
- At most 10 gestures per checkout (`MAX_GESTURES_PER_CHECKOUT = 10`, the documented UI limit; the old API allowed 20).
- `total = n × (5000 + (logo ? 1000 : 0))`.
- A renewal costs the same per gesture, including the logo add-on if the sponsorship has a logo.
- The server always recomputes the price; a total sent by the client is only a consistency check.

## 6. Auth (`@smog/auth`)

- Better Auth with the Drizzle adapter on D1 (`provider: "sqlite"`), `basePath: "/api/auth"`, and secondary storage in KV for rate-limit counters and verification caches.
- Methods:
  - email + password: `requireEmailVerification: true`, reset via email.
  - `emailOTP` plugin: sign-in and verification codes.
  - `magicLink` plugin.
  - Google and Apple social providers.
  - `@better-auth/passkey`.
  - `admin` plugin: roles, bans, user list.
  - `@better-auth/expo` on the server for the mobile app.
  - `captcha` plugin with Cloudflare Turnstile on sign-up, sign-in and password-reset endpoints.
- Account linking: `accountLinking: { enabled: true, trustedProviders: ["google", "apple", "email-password"] }`. Accounts are linked by verified email.
- Migrated users have `email_verified = true` and no credential. They sign in with OTP, magic link, Google or Apple, or set a password via "forgot password". The password-reset flow must create a credential account when none exists; this is verified by a test.
- Mobile uses `@better-auth/expo` with `expo-secure-store` storage and the `smog://` scheme. Sign in with Apple on iOS uses `expo-apple-authentication` (idToken sign-in); Google uses the browser flow. Passkeys on mobile are a known gap at first (web only), unless a maintained Expo passkey module works with SDK 57 (see DECISIONS).
- Trusted origins per environment come from env: the site origin, `smog://`, and in dev `exp://`.
- Session helpers: `getSession(request)` for the server; `requireUser` / `requireAdmin` guards used by the rpc middleware and by route `beforeLoad` server functions.
- Emails that Better Auth sends (verify, OTP, magic link, reset) go through the email queue (§8.3) and use `@smog/email` templates.
- The first admin is bootstrapped with `bun run admin:grant --env <env> <email>` (a D1 SQL script).

## 7. API (`@smog/rpc`, `@smog/api`)

- **Contract first.** Each feature defines `./contract` with `@orpc/contract`. `@smog/api` composes `appContract = { gestures, favorites, lists, account, sponsorships, admin }` and `appRouter` from the feature routers (`implement(contract)`).
- **Transport** (mounted in the site Worker):
  - `/api/rpc/*`: `RPCHandler`, used by both apps.
  - `/api/openapi/*`: `OpenAPIHandler`, the spec is served at `/api/openapi/spec.json` with a reference UI at `/api/openapi` (dev + staging only).
- **Context:**
  - Per-request context: `{ env, db, auth, session, user, request, ctx(waitUntil), ip, locale }`.
  - `db` is Drizzle over the `DB` D1 binding; `env` is the validated `WorkerEnv` from `@smog/config/env/worker`.
- **Middleware** (`@smog/rpc`):
  - `withAuth`: session optional → typed user.
  - `requireUser` returns `UNAUTHORIZED`; `requireAdmin` returns `FORBIDDEN`.
  - `rateLimit(bucket)` uses the Workers Rate Limiting bindings: `RL_API` (300/60 s per IP), `RL_SPONSOR` (20/3600 s per IP), `RL_AUTH` (30/900 s per IP), `RL_ANALYTICS` (120/60 s per IP). These are the old limits.
  - `turnstile` for public mutations (sponsor checkout, re-edit submit).
  - `logErrors` logs with a `[rpc:<path>]` prefix and maps unknown errors to `INTERNAL_SERVER_ERROR` without internals.
- **Errors:** a shared error map (`NOT_FOUND`, `CONFLICT`, `INVALID_STATE`, `GESTURE_UNAVAILABLE`, `PAYMENT_MISMATCH`, `TOKEN_EXPIRED`, `RATE_LIMITED`, …) is declared in contracts and used typed on clients.
- **Clients:**
  - `@smog/api/client` exports `createApiClient({ baseUrl, fetch, headers })` (an `RPCLink`) and `createApiQueryUtils(client)` (`@orpc/tanstack-query`).
  - `@smog/rpc/react` exports `RpcProvider`/`useRpc()`, which feature hooks use through a typed accessor. Apps create the client once (site: same-origin, cookies; mobile: `EXPO_PUBLIC_API_URL` + the Better Auth Expo cookie header).
- **Caching:** TanStack Query with sensible `staleTime` per query, invalidation after mutations, and refetch on focus/reconnect. Optimistic updates for favorites, list items and reorder. Mobile persists the gestures catalogue and favorites (offline cache, §10.4). There are no realtime subscriptions and no Durable Objects for push.

Endpoint inventory (full list in `docs/API.md`): `gestures.{list, bySlug, search, related, categories}`, `favorites.{list, ids, toggle, add, remove}`, `lists.{mine, get, create, update, delete, addItem, removeItem, reorder, share.get, share.create, share.revoke, shared.get, shared.addItem, shared.removeItem}`, `account.{me, updateProfile, consent.get, consent.set, export, delete, importGuestData}`, `sponsorships.{availability, quote, uploadLogo, checkout, paymentStatus, reedit.get, reedit.submit, renewal.get, renewal.checkout}`, `admin.{dashboard, gestures.*, categories.*, sponsorships.*, users.*, audit.list, mux.*, emails.preview, maintenance.*, export.sponsorshipsCsv}`.

## 8. Background work, video, email

### 8.1 Jobs (`@smog/jobs` types + site Worker handlers)

| Trigger | Schedule / queue | Work |
|---|---|---|
| Cron | `0 0 * * *` (UTC) | Expire: `live`/`expiring` with `ends_at < now` → `expired` |
| Cron | `0 8 * * *` (UTC) | Renewal reminders: `live` with `ends_at` within 30 days and no `reminder_sent_at` → `expiring`, enqueue the `renewal_reminder` email (with renewal link) |
| Cron | `0 * * * *` | Stale payments: `awaiting_payment` whose payment was created more than 24 h ago → cancel the Mollie payment if cancelable → `cancelled` |
| Cron | `0 3 1 * *` | Audit log retention (delete rows older than 3 × 365 days); expired-token and orphan R2 logo cleanup |
| Queue `email` | producer: services | Render the React Email template and send through `EmailSender`; `max_retries: 5`, exponential backoff, DLQ `email-dlq`; idempotency key per message kept in KV for 7 days |
| Queue `sponsorship-events` | producer: Mollie webhook | Post-payment fan-out (start the render workflow, queue emails); keeps the webhook fast and idempotent |
| Workflow `RenderSponsorshipVideo` | started per `render_job` | See §8.2 |

All handlers are idempotent, process records one at a time, and can safely be re-run. Cron handlers are exported as testable functions (`runExpirySweep({ db, now })`).

### 8.2 Render pipeline (`@smog/render`, `@smog/video`)

1. **Composition** `SponsoredVideo` in `packages/render/src/compositions` is a port of the old visuals:
   - 30 fps; the size comes from the source video's dimensions and the duration is derived from the source.
   - In the last 5 s the overlay fades in (1 s spring) and slides up 30 px.
   - The logo box is 22 % × 22 % at (50 %, 76 %). The text is `#00805F`, 3.8 % of the video height, at y = 87 %, on two lines: the fixed line "Met de warme steun van:" and the display name (≤ 35 chars).
   - Props are validated by `renderInputSchema` (Zod, `./contract`).
2. **Wizard preview:** `@remotion/player` renders the same composition live in the browser over the gesture's Mux MP4 rendition (`https://stream.mux.com/{playbackId}/highest.mp4`, static renditions enabled on upload). The logo comes from a local object URL until upload. There is no server work.
3. **Final render:**
   1. After payment, `render_job` rows are created and a Workflow instance is started per job.
   2. Step `source` enables Mux temporary master access on the original asset and waits for the `video.asset.master.ready` webhook (via `step.waitForEvent`), falling back to polling with `step.sleep`.
   3. Step `upload` creates a Mux direct upload with `passthrough = render_job.id`.
   4. Step `render` calls the **Cloudflare Container** `SmogRenderer` (a Bun + Remotion + Chromium image built from `packages/render/container/Dockerfile`). Its `POST /render { input, sourceUrl, logoDataUrl?, uploadUrl }` renders H.264 to a temp file and PUTs it to Mux, with a 20 min timeout and 2 retries.
   5. Step `ready` waits for the `video.asset.ready` webhook with that passthrough (1 h timeout, then polling).
   6. Step `commit` stores the playback id on the job and on the sponsorship and transitions `rendering → in_review`.
   7. Any failure after the retries leads to `render_failed` plus an admin email.
4. **Mux webhooks** arrive at `POST /api/webhooks/mux`, verified with the Mux signing secret (Web Crypto HMAC via `@mux/mux-node` `webhooks.unwrap`). They are routed to Workflow events and to admin upload status.
5. **Mux asset lifecycle:**
   - On expiry, the sponsored asset is deleted (old behaviour; failures are logged and swallowed).
   - Admin gesture uploads use direct uploads with `playback_policy: ["public"]`, `static_renditions: [{ resolution: "highest" }]`, and `passthrough = gesture draft id`.

Local dev: the Container needs Docker. When Docker is missing, `RENDER_MODE=local` makes the Workflow call a local Bun render server (`bun -F @smog/render serve`) instead, and `RENDER_MODE=fake` (tests) returns the source playback id immediately.

### 8.3 Email (`@smog/email`)

- `EmailSender` interface (`send({ to, from, replyTo?, subject, html, text })`) with two implementations:
  - `CloudflareEmailSender`, using the `send_email` binding `EMAIL` (Cloudflare Email Service, beta, Workers Paid).
  - `DevEmailSender`, which logs and stores the last 50 messages in KV, viewable at `/dev/mail` in dev and staging.
- Templates (React Email, rendered with `@react-email/render` in the Worker), localized nl/en/fr from `@smog/i18n` with nl as the default:
  - `welcome`, `sponsorship_received`, `payment_confirmed`, `sponsorship_live`, `renewal_reminder`, `admin_new_sponsorship` (sent **after payment**, not at creation), `admin_render_failed`, `admin_refund_needed`.
  - Auth emails: `auth_verify_email`, `auth_otp`, `auth_magic_link`, `auth_reset_password`.
  - Migration: `we_moved` (the optional one-time email after cutover).
- `From`/`Reply-To` come from env (`EMAIL_FROM`, `EMAIL_REPLY_TO` = `info@smog.vlaanderen`).
- Fixed old copy bugs:
  - The live email shows the real post-approval dates.
  - The reminder email says 30 days and links to the renewal page.
  - A missing gesture name falls back to a localized phrase.

## 9. Site app (`apps/site`)

- TanStack Start + `@cloudflare/vite-plugin` (`viteEnvironment: { name: "ssr" }`), React 19, Tailwind v4 via `@tailwindcss/vite`.
- Custom Worker entry `src/worker.ts`:
  - `fetch` is the maintenance middleware, then Start's handler.
  - It also exports `queue`, `scheduled`, the Workflow classes and the `SmogRenderer` Container class.
- Server routes (Start server routes):
  - `/api/rpc/$`, `/api/openapi/$`, `/api/auth/$`.
  - Webhooks: `/api/webhooks/mollie`, `/api/webhooks/mux`.
  - `/api/analytics` (OpenPanel relay), `/api/logos/$key` (R2 logo read for admins and the render workflow), `/api/health`.
- `wrangler.jsonc`:
  - `main: src/worker.ts`, `compatibility_flags: ["nodejs_compat"]`. There are **no bindings at the top level**; everything lives under `env.staging` and `env.production`: D1 `DB`, R2 `MEDIA`, KV `KV`, queues `EMAIL_QUEUE`/`EVENTS_QUEUE` (+ consumers, DLQ), workflow `RENDER_WORKFLOW`, container `RENDERER` (DO class `SmogRenderer`), `send_email` `EMAIL`, rate-limit bindings, cron triggers, vars.
  - `env.dev` is used by `wrangler dev` / `vite dev` with local resources.
  - Placeholder resource ids.
- Routes (no locale prefix; the language comes from a cookie, then `Accept-Language`, then `nl`):

```text
/                          home: hero + search + categories + featured, app banner
/gestures                  browse + search (?q, ?category=slug[,slug]) with SSR results
/gestures/$slug            gesture detail (SSR, SEO meta, JSON-LD); legacy /gestures/<convexId> → 301 via legacy_id
/favorites                 favorites (local for guests, server when signed in)
/lists                     my lists (master–detail, ?id=<listId>)
/lists/$shareToken         shared list (view; edit with an edit-role token + sign in)
/sign-in, /sign-up, /forgot-password, /reset-password, /verify-email, /magic-link
/account                   profile, sign-in methods (passkeys, linked accounts), consent, export, delete
/sponsor                   wizard: select → details → preview (Remotion Player) → Mollie
/sponsor/success           ?payment=<id> status polling
/sponsor/edit              ?token= re-edit
/sponsor/renew             ?token= renewal checkout
/privacy, /terms           localized legal pages (nl canonical; en/fr translations flagged "translation")
/admin                     dashboard
/admin/gestures, /admin/gestures/new, /admin/gestures/$id, /admin/categories,
/admin/sponsorships, /admin/sponsorships/$id, /admin/users, /admin/audit, /admin/emails, /admin/settings (maintenance)
/dev/ui                    component preview (dev + staging only), /dev/mail (dev + staging only)
/.well-known/apple-app-site-association, /.well-known/assetlinks.json (static assets, application/json)
```

- Legacy redirects (301, query string preserved), implemented in one table in `apps/site/src/lib/legacy-redirects.ts` with tests:
  - `/sponsors*` → `/sponsor*`; `/sponsors/re-edit` → `/sponsor/edit`; `/sponsors/success` and `/success` → `/sponsor/success`.
  - `/login` → `/sign-in`; `/callback` → `/`.
  - `/gestures/<convexId>` → `/gestures/<slug>`.
  - `/lists/<token>` stays valid: migrated share tokens keep their value.
- Maintenance mode:
  - The KV key `maintenance` holds `{ enabled, message?, until? }` and is read with a 30 s in-isolate cache.
  - When it is enabled, every HTML request gets a 503 static page (a port of the old maintenance page, nl/en/fr, `Retry-After`), except `/api/webhooks/*`, `/api/health`, `/.well-known/*`, and admins holding a bypass cookie.
  - It is toggled from `/admin/settings` or `wrangler kv key put`.
- Security headers equivalent to the old Caddy set (CSP including Mux, Turnstile and the OpenPanel relay being same-origin; HSTS; `X-Frame-Options DENY`; Permissions-Policy), set by a response middleware. `robots.txt` and a dynamic `sitemap.xml` with every published gesture.

## 10. Mobile app (`apps/mobile`)

- Latest Expo SDK (57), Expo Router, NativeWind, React Native New Architecture.
- Identity kept from the old app: name "SMOG & Co", slug `smog`, owner `smog-and-co`, bundle id / package `be.zias.smog`, scheme `smog`, EAS project `9fa68b63-dfa5-498a-9196-5eba93ecac29`, Apple team `96XKP6MU2A`, `runtimeVersion.policy = fingerprint`, version bumped to `3.0.0`, iOS `smog.icon`, adaptive icon background `#00805F`.
- Navigation: native tabs Home · Search · Favorites · Lists, plus stacks:
  - `gestures/[slug]` (card)
  - `lists/[id]`
  - `shared/[token]`
  - `settings`, `settings/account`, `settings/developer-tools` (unlocked by tapping 5 times; dev and staging builds)
  - `(auth)/sign-in`, `sign-up`, `forgot-password`
- Consent sheet on first launch.
- Deep links: `smog://…` and `https://<site host>/…` (associated domains and Android intent filters generated from `app.config.ts` using `EXPO_PUBLIC_SITE_HOST`). `+native-intent.tsx` maps:
  - `/gestures/<slug|legacyId>` → `gestures/[slug]`
  - `/lists/<token>` → `shared/[token]`
  - `/gestures?q=` → search
  - anything unknown → `/`, without ever throwing
  - the reference branch's go-back fixes (`initialRouteName`) are kept
- Offline cache: TanStack Query persisted to AsyncStorage for the gestures catalogue, categories and favorites (24 h `maxAge`, buster = app version). An offline banner comes from `@react-native-community/netinfo` (see DECISIONS).
- Video: `expo-video` with the Mux HLS URL, the disclaimer banner after 7 completed videos (VIDEO_COMPLETE_COUNT), and a screenshot share prompt via `expo-screen-capture`. The permission-stripping config plugin is kept.
- EAS: profiles `development`, `staging` (channel `staging`, `EXPO_PUBLIC_API_URL` = staging workers.dev URL) and `production` (channel `production`, store, `autoIncrement`).

## 11. Guests (on-device only)

- `@smog/local-store` defines the versioned `GuestData` schema: `{ version: 1, favorites: GestureId[], lists: LocalList[], recentSearches: string[] (max 10), consent: { analytics: boolean|null, decidedAt? }, preferences: { theme, locale } }`.
- It has a reactive store (`subscribe`/`getSnapshot` for `useSyncExternalStore`) and two adapters: `webAdapter` (localStorage, falling back to in-memory) and `nativeAdapter` (AsyncStorage).
- Feature client hooks (`useFavorites`, `useLists`, …) choose the source internally: local store when signed out, API when signed in. Screens never branch on it.
- Recent searches, theme and locale stay on the device for everyone (the old behaviour; they are private).
- **Import on sign-in:** `@smog/account/client` exports `importGuestData({ store, api })`, used by both apps after sign-in and sign-up when local data exists:
  1. It shows a sheet ("Import 12 favorites and 2 lists?").
  2. It calls `account.importGuestData`, which merges and dedupes server-side (favorites become a union; lists are created, or items appended when a same-name list exists; the consent choice is appended to the consent log with source `import`).
  3. On success it clears the imported parts of the local store.
- Sharing a list requires an account. Viewing a shared list does not.

## 12. Analytics (`@smog/analytics`)

- Taxonomy (Zod, single source), carrying the old events and properties:
  - `gesture_viewed`, `gesture_collection_changed`, `search_performed`, `video_playback_completed`, `screen_view`.
  - New: `sign_in_completed { method }`, `guest_data_imported { favorites, lists }`, `sponsorship_checkout_started { gesture_count, has_logo }`.
  - No free text, no search terms.
- Consent gate: nothing is initialised or sent until consent is `true`. Withdrawing consent clears the identity.
- Web: `@smog/analytics/web` posts to the same-origin `/api/analytics` relay. The relay validates the event against the taxonomy, rate-limits it (120/min), and forwards it to OpenPanel with server-only credentials. It never fails a product action.
- Mobile: `@smog/analytics/native` uses `@openpanel/react-native` with a write-only client (the least-privileged setting).
- Identity:
  - Signed-in users are identified by user id only; email and name are no longer sent (data minimisation).
  - Guests are anonymous device profiles.

## 13. Testing strategy

| Layer | Tool | Where |
|---|---|---|
| Pure logic (pricing, state machine, ranking, normalisation, VAT check, redirects, local store, tokens) | `bun test` | package `src/**/*.test.ts` |
| Services, routers, webhooks, cron and queue handlers, migrations | Vitest 4 + `@cloudflare/vitest-pool-workers` (real Miniflare D1/KV/R2/Queues, migrations applied in `setupFiles`) | `packages/features/*/test`, `packages/db/test`, `apps/site/test` |
| UI kits | `bun test` + happy-dom + Testing Library (web); Jest + jest-expo + RNTL (native) | kit packages |
| Site e2e | Playwright (Chromium at `/opt/pw-browsers`, `vite dev` with local bindings, Mollie mocked by a local fake server, `RENDER_MODE=fake`) | `apps/site/e2e`: sign up/in, search, favorite, list share, sponsor checkout, admin CRUD |
| Mobile | Jest + jest-expo | `apps/mobile/src/**/*.test.tsx` (native intent, guest import, screens) |
| Visual review | Playwright screenshots, light/dark × 390/1280 px | `apps/site/e2e/screenshots.spec.ts` (artifacts, not asserted) |

External services are faked at the adapter boundary. `@smog/payments/testing` provides a Mollie fake, `@smog/video/testing` a Mux fake, and `@smog/email` has `MemoryEmailSender`.

## 14. Environments and deployment

- Environments:
  - `dev`: local Miniflare, `.dev.vars`.
  - `staging`: deployed from `develop`.
  - `production`: deployed from `master`.
  - Each env has its own D1 (`smog-staging` / `smog-production`), R2 (`smog-*-media`), KV, queues, workflow, container, rate-limit namespaces and secrets.
- workers.dev URLs for now. `SITE_URL` is configurable per env, as are the trusted origins, the Mollie redirect/webhook base, and email links.
- GitHub Actions:
  - `ci.yml` (push + PR): install → Biome → boundaries → typecheck → tests (incl. workers pool) → build → knip → expo-doctor + export → Playwright e2e.
  - `deploy.yml` (push to `develop`/`master`): `wrangler d1 migrations apply DB --env <env> --remote` then `wrangler deploy --env <env>`, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Skipped with a warning when the secrets are absent.
- Docs: `docs/deployment.md` (first-time setup) and `docs/cutover-runbook.md` (production switch-over including the data migration), in the reference branch's style.

## 15. Data migration (`scripts/migrate-from-convex`)

- Input: `npx convex export` ZIP, or a directory of per-table JSONL files.
- Pipeline:
  1. `read` streams each table.
  2. `transform`: pure functions per entity, with an ID map; unit-tested with fixture exports.
  3. `emit` writes SQL batch files (`INSERT … ON CONFLICT(legacy_id) DO UPDATE`, which makes re-runs idempotent) and `report.json` + `report.md`.
  4. Apply with `wrangler d1 execute DB --env <env> --remote --file <batch>`.
- `--dry-run` produces only the report.
- Rules:
  - Guests (a `guestId` with no `workosId`/email) and all their rows are skipped, and counted.
  - WorkOS users become Better Auth `user` rows (same email, `email_verified = true`, `role`, `created_at`) with no credential.
  - `user_favorites` plus default-list items become `favorite`.
  - Non-default lists become `list` + `list_item` (positions kept). Share tokens become `list_share` rows (view token → `view`, edit token → `edit` when `allowSharedEditing`).
  - Gestures, categories and concepts become `gesture` + `gesture_category` + `gesture_keyword`, with slugs generated and deduped. `isActive` maps to `published_at`.
  - Sponsorships are split into `sponsor`, `invoice_request`, `sponsorship`, `payment` + `payment_item` (grouped by `molliePaymentId`), and `sponsorship_event`. Statuses are mapped:
    - `pending_payment` → `awaiting_payment`
    - `pending_approval` → `in_review`
    - `pending_resubmission` → `changes_requested`
    - `active` → `live`, or `expiring` when a reminder was sent
    - `expired`, `rejected` and `cancelled` keep their names
    - legacy `pending` → `cancelled`
  - Consents become `consent_event`; `adminLogs` become `audit_log` (unknown shapes go to `data: { legacy: … }` under action `legacy`).
  - Mux ids carry over unchanged.
- The `we_moved` email job is optional and enqueued by `--send-we-moved`.

## 16. UI/UX design brief

**Principles:** calm, clear, consistent. The video is the hero on gesture screens; everything else steps back. Both apps share one visual language built from the same tokens and the same component names. Content first, one primary action per screen, generous whitespace, no decoration that doesn't carry meaning. The brand is the SMOG & Co logo, the green (`#00805F`) and the orange accent (`#EE971C`), plus the illustrated hands used sparingly on the home and empty states.

**Type scale** (system font stack; Inter on web through Google Fonts, SF/Roboto on native):

| Token | Size/line | Use |
|---|---|---|
| `display` | 40/48 (web ≥ md: 56/64) | home hero |
| `title-1` | 28/34 | screen titles |
| `title-2` | 22/28 | section titles, gesture name |
| `title-3` | 18/24 | card titles |
| `body` | 16/24 | default |
| `body-sm` | 14/20 | secondary text |
| `caption` | 12/16 | meta, badges |

Weights: regular 400, medium 500, semibold 600. Maximum reading line length is 72ch.

**Spacing scale** (4 pt grid): 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Screen gutters: 16 on mobile, 24 on tablet, 32 on desktop, with a max content width of 1200 (admin: fluid).

**Colour roles** (light / dark), defined once in `@smog/styles/tokens`:

| Role | Light | Dark |
|---|---|---|
| `background` | `#F7F9F7` | `#0F1210` |
| `surface` | `#FFFFFF` | `#171B18` |
| `surface-raised` | `#FFFFFF` | `#1E2320` |
| `surface-sunken` | `#EEF3EE` | `#0B0D0C` |
| `border-subtle` | `#E4EAE4` | `#262C28` |
| `border` | `#D2DAD3` | `#343B36` |
| `foreground` | `#17211A` | `#EEF3EF` |
| `foreground-muted` | `#55635A` | `#A5B2A9` |
| `primary` | `#00805F` | `#2BB38A` |
| `primary-foreground` | `#FFFFFF` | `#04140E` |
| `primary-subtle` | `#E3F2EC` | `#0F2A21` |
| `accent` | `#EE971C` | `#F5AB45` |
| `success` | `#1F8A4C` | `#4CC27E` |
| `warning` | `#B7791F` | `#E9B24A` |
| `danger` | `#C62828` | `#F16B6B` |
| `focus-ring` | `#EE971C` | `#F5AB45` |

All text and background pairs must pass WCAG AA (4.5:1 for body text, 3:1 for large text and UI), checked by a unit test in `@smog/styles`.

**Radius:** `sm` 6, `md` 10, `lg` 14, `xl` 20, `full`. Cards use `lg`, inputs and buttons `md`, chips `full`.
**Elevation:** `0` flat (default), `1` card hover/raised (a subtle shadow; in dark mode a border and surface-raised instead of a shadow), `2` sheet/dialog, `3` toast.
**Motion:** durations 120 / 200 / 320 ms, standard easing `cubic-bezier(0.2, 0, 0, 1)`. Motion is used only for state changes (sheet in/out, toast, favorite pop). `prefers-reduced-motion` and the native reduce-motion setting disable non-essential motion.
**Interaction:** tap targets ≥ 44 × 44 pt, a visible 2 px focus ring in `focus-ring` colour with 2 px offset, a hover state on every clickable web element, haptics on native for toggle, success and error.

**Component inventory** (same name, props and variants in `ui-web` and `ui-native` where the platform allows):

- Primitives: Button (`primary|secondary|ghost|danger`, `sm|md|lg`, `loading`, `icon`), IconButton, Input, Textarea, SearchField, Select, Checkbox, Switch, RadioGroup, Field (label + hint + error), Card, ListItem, Badge (`neutral|primary|accent|success|warning|danger`), Chip (selectable), Avatar, Tabs, SegmentedControl, Sheet (bottom on mobile, side on desktop), Dialog / AlertDialog, Menu, Toast, Tooltip (web), Skeleton, EmptyState, ErrorState, OfflineBanner, Spinner (reserved for button loading only), ProgressBar, Stepper, Table (web, admin), Pagination, Text / Heading.
- Domain: GestureCard, GestureRow, GestureGrid, CategoryChips, VideoPlayer (Mux player on web, expo-video on native, same props: `playbackId`, `autoPlay`, `loop`, `onNearEnd`, `aspect`), FavoriteButton, ListPicker (sheet), ShareSheet / ShareLink, CourseBanner (the disclaimer), ConsentBanner, AppBanner, StatusBadge (sponsorship statuses), PriceSummary, SponsorPreview (the Remotion Player wrapper, web only), Logo.

**Key flows:**
1. *Learning:* Home → search field (focus shows recent searches) → results update as you type (debounced 250 ms) with category chips → gesture detail. The video is on top with a 3:4 frame; the name, category chips, description, keywords ("related concepts") and related gestures follow. Favorite and add-to-list sit in the header or sticky bar; share and QR are in the overflow menu. On desktop web, browse is a two-column master–detail at ≥ 1024 px.
2. *Favorites and lists:* the heart toggles instantly (optimistic, haptic). Lists: overview cards → list detail with drag reorder (handle and keyboard; move up/down in the menu) → share sheet (view link / edit link, copy, revoke). Guests get everything except sharing, which shows a sign-in prompt.
3. *Account:* sign in or sign up on a single screen, with email first and methods revealed progressively (password, code, magic link, Google, Apple, passkey). After sign-in comes the import sheet if there is local data. Account page sections: Profile, Sign-in methods, Privacy (analytics consent toggle, export, delete), Preferences (theme, language).
4. *Sponsor wizard (web):*
   - Step bar: Choose gestures → Your details → Preview & pay.
   - Choose: a searchable grid with availability badges and a sticky selection bar showing the total.
   - Details: display name (live character counter, ≤ 35), optional logo (+€10 per gesture; drag and drop, 2 MB, PNG/JPEG/WebP), contact, optional invoice (BE enterprise number with mod-97 check).
   - Preview: a Remotion Player per gesture, a summary and Turnstile, then pay.
   - Success: polling status with a clear "what happens next" timeline.
   - Re-edit and renew reuse the same steps.
5. *Admin:* a dense, table-first layout with a left rail (Dashboard, Sponsorships, Gestures, Categories, Users, Audit log, Emails, Settings). Every list is a sortable, filterable table with URL-synced filters and a row click opening a detail side panel or page. Moderation queue: video, metadata, Approve / Request changes / Reject (reason required). Gesture editor: Mux upload or pick, publish toggle, categories, keywords.

**States:** every data view has Skeleton (loading), EmptyState (with a next action), ErrorState (retry) and OfflineBanner (network lost). Spinners are only allowed inside buttons.
**Responsive:** 360 px → desktop; breakpoints `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
**Accessibility:** semantic landmarks, skip link, labelled controls, `aria-live` for toasts and search result counts, focus management in dialogs and sheets, captions/alt for media where available, and screen-reader labels on icon buttons (i18n keys `a11y.*`).
**Preview:** `/dev/ui` renders every web component in every variant in light and dark. The mobile equivalent is `settings/developer-tools` → "Component gallery".

## 17. Phases

0. Analysis, inventory, spec, plans (this document).
1. Monorepo skeleton (tooling, config, CI, empty site on Workers, empty Expo app).
2. Foundations: db, auth, rpc + api, local-store + guest import, styles/brand/i18n, design tokens, ui-web/ui-native kits, `/dev/ui`.
3. Learning: gestures, categories, search, favorites, lists, sharing (site + mobile).
4. Account, consent, analytics, legal, deep links, legacy redirects, maintenance mode.
5. Admin panel.
6. Payments, sponsorships, jobs, emails.
7. Render: compositions, container, Workflow, Mux upload, wizard preview.
8. Environments (wrangler envs, EAS profiles, deploy workflow) and the Convex → D1 migration script.
9. Hardening: e2e, accessibility, performance, docs pass, parity audit.

Every phase ends with `bun run release:check` green, `docs/PROGRESS.md` updated, and `develop` pushed.
