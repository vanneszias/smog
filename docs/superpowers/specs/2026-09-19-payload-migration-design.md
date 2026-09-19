# SMOG → Payload CMS Migration: Design

> Status: approved 2026-09-19
> Supersedes the Convex + oRPC + Hono architecture described in `docs/ARCHITECTURE.md`.

## Why

SMOG runs four applications and ten packages over a hand-written data layer.
Roughly 10,000 lines exist only to do what a CMS does for free: 4,600 lines of
Convex schema, queries, mutations and access checks; 2,600 lines of oRPC routers
and request context; 2,700 lines of Hono server handling webhooks, an email
queue and three cron jobs; and about twenty React components implementing an
admin panel by hand.

None of that is product. All of it is maintenance.

Payload replaces it with configuration: collections instead of schema plus
queries, access control functions instead of per-router auth checks, hooks
instead of mutation side effects, a jobs queue instead of BullMQ and `node-cron`,
and a generated admin panel instead of the hand-built one.

## Goal

One Next.js application, deployed as a single Cloudflare Worker, that serves the
Payload admin panel, the public API and a redesigned public website. The Expo
app is rebuilt against that API. Everything else is deleted.

## Non-goals

- Changing the product. Gestures, lists, favorites, sponsorships and the
  sponsor purchase flow keep their current behavior unless a section below says
  otherwise.
- Changing pricing, the Mollie integration's commercial terms, or the Mux
  account.
- Rewriting the Remotion compositions themselves. They move hosts; the
  composition code is carried over.

## Decisions

Each of these was chosen deliberately during brainstorming. Where a decision
carries a cost, the cost is stated.

| Decision | Choice | Cost accepted |
|---|---|---|
| Database | Cloudflare D1 (SQLite) | Less battle-tested than the Postgres adapter |
| Storage | Cloudflare R2 | — |
| Scope | Full migration, native included | An app-store release is in the critical path |
| Auth | Payload built-in + social providers | WorkOS password hashes cannot move; users re-authenticate |
| Video composition | Remotion in a Cloudflare Container | Least proven option; spiked in Stage 0 |
| Layout | One Next.js app, `apps/site` | Admin-panel faults and public-site faults share a blast radius |
| Components | Separate web and native libraries, shared philosophy | Two implementations of every primitive |
| Data | Full scripted migration of all nine tables | A real migration stage with dry runs |
| Cutover | Parallel run, single switch | Old and new stacks coexist in the repo until Stage 10 |
| Search | `@payloadcms/plugin-search` | A synced collection to maintain |
| i18n | Payload localization on content fields | A translation backlog for existing content |
| Email | Cloudflare Email Service `send_email` binding | No official Payload adapter; ~50 lines written in-house |

## Global constraints

These apply to every stage. Exact values; do not substitute.

- **Cloudflare Workers Paid plan is required.** The official Payload Cloudflare
  template states it "can only be deployed on Paid Workers right now due to
  size limits." Sending email to arbitrary recipients also requires it.
- Package manager is **bun 1.3.14**, matching the existing monorepo. Payload
  documents pnpm/npm/yarn; bun compatibility is a Stage 0 verification gate.
- Linting and formatting is **Biome 2.3.13** extending `ultracite/core` and
  `ultracite/react`. `bun check` must pass before any commit.
- Builds are orchestrated by **Turborepo 2.11**. Every new package registers
  its `build`, `check-types` and `test` tasks in `turbo.json`.
- TypeScript strict mode. Type-only imports use the `type` keyword.
- Workspace imports use `@smog/<package>`; app-local imports use `@/`.

### Pinned versions

Taken from the official `templates/with-cloudflare-d1` template.

```
next                          16.3.3
react / react-dom             19.2.6
payload                       3.82.1
@payloadcms/next              3.82.1
@payloadcms/db-d1-sqlite      3.82.1
@payloadcms/storage-r2        3.82.1
@payloadcms/richtext-lexical  3.82.1
@payloadcms/plugin-search     3.82.1
@opennextjs/cloudflare        ^1.11.0
wrangler                      ~4.116.0
```

Payload packages must all sit on the same patch version. Upgrading one means
upgrading all of them together.

## Architecture

### Deployment topology

```text
                    ┌─────────────────────────────────────┐
  Cron Trigger ────► │  Worker: smog-site                  │
  (*/5 * * * *)      │                                     │
                     │  Next.js 16 + Payload 3.82          │
                     │    /admin      Payload admin panel  │
                     │    /api/*      REST + GraphQL       │
                     │    /*          public website       │
                     │                                     │
                     │  bindings:                          │
                     │    D1          database             │
                     │    R2          media                │
                     │    SEND_EMAIL  transactional mail   │
                     └───┬─────────────┬───────────────┬───┘
                         │             │               │
                    ┌────▼────┐   ┌────▼─────┐   ┌─────▼──────┐
                    │  Mollie │   │   Mux    │   │ Container: │
                    │  (HTTP) │   │  (HTTP)  │   │ smog-render│
                    └─────────┘   └──────────┘   │  Remotion  │
                                                 └────────────┘
      Expo app ──────► /api/*  (REST, Payload auth cookies/JWT)
```

One Worker. One deploy. The container is a separate Cloudflare resource the
Worker calls over its binding.

### Repository layout

```text
apps/
  site/          NEW   Next 16 + Payload. Admin, API, public web.
  mobile/        NEW   Expo, Payload REST, own component library.
  render/        NEW   Remotion in a Cloudflare Container.
  web/                 deleted in Stage 10
  native/              deleted in Stage 10
  server/              deleted in Stage 10
  remotion/            source of truth for compositions; deleted in Stage 10
packages/
  styles/        REWRITTEN  design tokens, consumed by both platforms
  ui-web/        NEW   Tailwind v4 + Radix components
  ui-native/     NEW   NativeWind + RN components (built in Stage 8)
  config/              kept, trimmed
  i18n/                kept
  shared/              kept, trimmed
  types/               kept, regenerated from Payload
  api/                 deleted in Stage 10
  auth/                deleted in Stage 10
  convex/              deleted in Stage 10
  hooks/               deleted in Stage 10
  ui/                  deleted in Stage 10
```

### Payload configuration

`apps/site/src/payload.config.ts` follows the official template's binding
resolution exactly: `getCloudflareContext({ async: true })` in production, and
`getPlatformProxy()` from wrangler when running the CLI or in development. That
indirection is what lets `payload migrate` and `payload generate:types` reach D1
outside a request context.

```ts
const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

export default buildConfig({
  db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
  storage: [r2Storage({ bucket: cloudflare.env.R2, collections: { media: true } })],
  // ...
})
```

`wrangler.jsonc` uses `main: ".open-next/worker.js"`, compatibility date
`2025-08-15`, and the compatibility flags `nodejs_compat` and
`global_fetch_strictly_public`.

Deployment is two steps in order: `payload migrate` against the remote D1
database, then `opennextjs-cloudflare build && opennextjs-cloudflare deploy`.
Schema first, code second — the reverse leaves a deployed Worker querying
columns that do not exist.

## Data model

Nine Convex tables become seven collections. Two tables disappear into field
types, which is the point of the exercise.

### `gestures`

Localized `name`, `info` and `concepts`. `categories` is a `hasMany`
relationship. `playbackId` is the Mux playback identifier. `isActive` gates
public visibility. Payload supplies `createdAt`/`updatedAt`, replacing the
hand-maintained `lastUpdated`.

### `categories`

Localized `name`, plus `isActive`.

### `users`

Payload auth collection. Email/password plus social providers. Fields: `role`
(`user` | `admin`), and `favorites` as a `hasMany` relationship to `gestures`.

**`user_favorites` is deleted.** A join table maintained by hand-written
mutations becomes one relationship field. The one-favorite-per-pair rule that
mutations enforced is now structural.

Guest identity (`guestId`) does not survive. Payload auth has no anonymous user
concept worth emulating; the mobile app keeps guest state locally and prompts
for an account when the user wants it synced. This is a deliberate product
simplification, not an oversight.

### `lists`

`owner` relationship, `name`, optional `description`, `visibility`
(`private` | `shared`), `viewShareToken`, `editShareToken`,
`allowSharedEditing`, `isDefaultFavorites`, and `items` as an **ordered array
field** of gesture relationships.

**`gesture_list_items` is deleted.** Array order replaces the `position`
integer and all the reindexing logic around it, and the admin panel gets
drag-to-reorder for free.

### `sponsorships`

Carried over close to its current shape, because the payment flow depends on it:
gesture relationship, sponsor and contact fields, the three Mux playback IDs
(original, preview, sponsored), `status` as a select over the seven existing
values, dates, Mollie payment reference and amount, admin review fields, the
re-edit token and expiry, invoice fields, and the renewal reminder timestamp.

Status transitions and their side effects move from oRPC mutations into
collection hooks.

### `media`

R2-backed uploads collection. Replaces Convex file storage for sponsor logos.

### `admin-logs` and `user-consents`

Kept as collections. Both are audit trails with legal retention requirements —
admin logs for three years, consents for GDPR evidence — so they stay
append-only records rather than becoming document versions.

### Localization

`localization` is enabled with locales `en`, `nl`, `fr` and `nl` as the default,
matching the current locale files. Localized fields: `gestures.name`,
`gestures.info`, `gestures.concepts`, `categories.name`. Everything else is
global. Existing content migrates into the `nl` locale; `en` and `fr` start
empty and fall back.

### Access control

Replaces every hand-written check in the oRPC routers:

- `gestures`, `categories`: public read where `isActive`; admin write.
- `users`: read and update self; admin reads all.
- `lists`: owner has full access; `shared` visibility grants read by share
  token; `allowSharedEditing` grants update by edit token.
- `sponsorships`: sponsor reads own by token; admin has full access.
- `admin-logs`, `user-consents`: admin read; written only by hooks.

### Search

`@payloadcms/plugin-search` maintains a `search` collection synced from
`gestures`, with priority weighting across `name` and `concepts`. This replaces
the Convex `search_content` index.

## Jobs and scheduling

Payload's jobs queue replaces `node-cron`, BullMQ and Redis entirely.

Tasks, carried over from `apps/server/src/cron.ts`:

- `expire-sponsorships` — daily. Restores original videos, deletes sponsored
  Mux assets.
- `send-renewal-reminders` — daily. One reminder ~30 days before expiry.
- `cleanup-stale-payments` — hourly. Cancels `pending_payment` rows older than
  24 hours.
- `send-email` — queued on demand by hooks.

Workers cannot run a long-lived scheduler, so `autoRun` is not available. A
Cloudflare Cron Trigger calls `GET /api/payload-jobs/run`, which handles both
schedule evaluation and job execution. This is Payload's documented serverless
pattern.

## Custom endpoints

Payload custom endpoints replace the Hono routes:

- `POST /api/webhooks/mollie` — verifies the payment with Mollie and advances
  sponsorship status. Must remain idempotent; Mollie retries.
- `POST /api/render/callback` — Remotion reports a finished composition.
- `GET /api/mux/source/:id` — issues a short-lived Mux source URL to the
  render container, behind a service token.

WorkOS token exchange and refresh endpoints are deleted, not ported.

## Design language

The redesign is "simple and modern" and shares a philosophy across platforms
without sharing code.

**Shared:** `@smog/styles` holds the single source of truth for color, spacing,
radius, type scale, elevation and motion tokens, exported in a form each
platform can consume — CSS custom properties for web, a plain object for
native. The existing brand palette is kept (`#00805F` primary, `#97C699`
secondary, `#EE971C` accent) and extended into a full scale with tested
contrast ratios. Component names and prop vocabularies match deliberately
across platforms: a `Button` takes the same `variant` and `size` values on web
and native, so moving between the two is muscle memory.

**Not shared:** implementations. Web is Tailwind v4 with Radix primitives,
composed the way the existing `apps/web/src/components/ui` already works, so
the redesign is an evolution of a pattern the team knows. Native is NativeWind
over React Native primitives. Each stays idiomatic to its platform.

Component inventory for web, built in Stage 2 and consumed everywhere after:
Button, Input, Textarea, Select, Checkbox, Switch, Badge, Card, Dialog,
Sheet, DropdownMenu, Tabs, Table, Toast, Skeleton, EmptyState, Avatar,
Tooltip, Pagination, and the domain components GestureCard, GestureGrid,
SearchBar, CategoryFilter, VideoPlayer, StatusBadge.

## Stages

Eleven stages. Each ends in something deployable and independently testable,
and each gets its own plan document under `docs/superpowers/plans/`.

| # | Stage | Deliverable |
|---|---|---|
| 0 | Foundation and spikes | Empty Payload admin live on a staging Worker; three risks resolved |
| 1 | Content model | Admins can CRUD localized gestures and categories with working search |
| 2 | Design system | Token package and web component library, with a kitchen-sink route |
| 3 | Public web | Redesigned gestures, search, detail, lists, favorites |
| 4 | Auth | Payload auth with social login; account pages |
| 5 | Sponsorships | Collection, sponsor wizard, Mollie endpoints |
| 6 | Video pipeline | Remotion container, Mux integration, preview and final renders |
| 7 | Email and jobs | Email adapter, templates, three scheduled tasks |
| 8 | Native | Expo app on Payload REST with its own component library |
| 9 | Data migration | Scripted Convex → D1 migration, verified by dry run |
| 10 | Cutover | DNS switch; old apps and packages deleted |

Stages 0–5 are strictly ordered. Stage 6 depends on the Stage 0 container
spike. Stage 8 depends on Stage 4. Stages 9 and 10 depend on everything.

## Stage 0 gates

Three things are unverified, and a plan written around an unverified assumption
is fiction. Stage 0 resolves them before later stages are planned in detail.

1. **Remotion in a Cloudflare Container.** Headless Chromium in Containers is
   the least proven part of this design. Gate: a container renders one
   composition end to end. Fallback: Remotion Lambda.
2. **Worker bundle size.** Payload plus Next 16 through OpenNext, against the
   Paid-plan Worker size limit, with room left for five more stages of code.
   Gate: a deployed Worker with the full content model, measured, with headroom
   recorded.
3. **Bun compatibility.** Payload documents pnpm, npm and yarn. This monorepo
   is bun. Gate: `payload migrate`, `payload generate:types` and
   `payload generate:importmap` all run under bun. Fallback: pnpm scoped to
   `apps/site` only.

A failed gate changes the design. It does not get worked around quietly.

## Testing

- **Unit** — Vitest, matching the existing apps. Access control functions,
  hooks, pricing, and the migration's transform functions are pure and get
  direct tests.
- **Integration** — Payload's local API against a local D1 instance via
  `getPlatformProxy`. Covers collection behavior, access control and job
  handlers.
- **End to end** — Playwright over the sponsor purchase flow, the admin
  approval flow, and public search and browse.
- **Migration** — the Stage 9 script runs dry against a copy of production data
  and asserts row counts and referential integrity per table before any write.

## Risks

| Risk | Mitigation |
|---|---|
| D1 adapter immaturity | Schema avoids D1-specific features; Postgres via Hyperdrive stays a config-level escape hatch |
| Worker size limit reached mid-migration | Measured in Stage 0 with headroom recorded; re-measured at every stage |
| Container cold starts on first render | Renders are already asynchronous with polling; sponsor UX unchanged |
| Users lost at the auth cutover | Migration creates accounts and sends a set-password mail; favorites and lists survive keyed by email |
| Mollie webhook replay during cutover | Endpoint is idempotent; old and new stacks both reconcile against Mollie as the source of truth |
| Translation backlog | `en` and `fr` fall back to `nl`; no empty pages ship |
