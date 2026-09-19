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
| Video composition | Remotion Lambda | An AWS account and per-render cost |
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
- Package manager is **bun**, matching the existing monorepo, whose root
  `package.json` declares `bun@1.3.14`. Payload documents pnpm/npm/yarn; bun
  compatibility was verified in Stage 0 and passes. Note the verification ran on
  bun 1.3.11, which is what the build container ships.
- Linting and formatting is **Biome 2.3.13** extending `ultracite/core` and
  `ultracite/react`. `bun check` must pass before any commit.
- Builds are orchestrated by **Turborepo 2.11**. Every new package registers
  its `build`, `check-types` and `test` tasks in `turbo.json`.
- TypeScript strict mode. Type-only imports use the `type` keyword.
- Workspace imports use `@smog/<package>`; app-local imports use `@/`.
- **Security advisories in transitive dependencies are pinned through root
  `overrides`**, the pattern this repo already used before the migration.
  `bun audit --production` runs inside `release:check` and must exit clean.
  `apps/site` introduced advisories in `esbuild`, `image-size`, `sharp`, `undici`,
  `dompurify` and `drizzle-orm` — the last a high-severity SQL-injection issue in
  the very ORM Payload uses for every D1 query — all now pinned to patched
  versions.

### Pinned versions

Taken from the official `templates/with-cloudflare-d1` template.

```
next                          16.3.3
react / react-dom             19.2.6
payload                       3.89.0
@payloadcms/next              3.89.0
@payloadcms/db-d1-sqlite      3.89.0
@payloadcms/storage-r2        3.89.0
@payloadcms/richtext-lexical  3.89.0
@payloadcms/plugin-search     3.89.0
@opennextjs/cloudflare        ^1.11.0
wrangler                      ~4.116.0
```

Payload packages must all sit on the same patch version. Upgrading one means
upgrading all of them together.

**Why exactly 3.89.0 — it is the only version that works.** There is a
one-release window, and both walls are hard:

| Version | PBKDF2 iterations | Clears GHSA-jg8r-5jh2-v2xj | Runs on workerd |
|---|---:|---|---|
| ≤ 3.88.0 | 25,000 | no | yes |
| **3.89.0** | **25,000** | **yes** | **yes** |
| 3.90.0, 3.90.1 | 600,000 | yes | **no** |

Payload 3.90.x switched password hashing to a `pbkdf2-sha256-v1` scheme at
600,000 iterations. **workerd caps PBKDF2 at 100,000**, so on 3.90.x no password
can be hashed at all: every registration and password change fails with
`Pbkdf2 failed: iteration counts above 100000 are not supported`. The count is a
hardcoded module constant in `generatePasswordSaltHash.js`, not configurable.

This was found the hard way — upgraded to 3.90.1 for the advisory, deployed, and
registration broke on staging. Pin 3.89.0 and do not upgrade Payload past it
without first checking `currentPasswordHashIterations` against workerd's ceiling.

**Why not the template's 3.82.1.** Every version up to and including
3.88.0 carries GHSA-jg8r-5jh2-v2xj — Payload's default account-unlock access lets
an authenticated user reset another account's lockout. `bun audit --production`
is part of `release:check`, so the pinned version failed CI outright. Upgrading
was also the cheapest it will ever be: two collections in, rather than at Stage 5
with the sponsor flow built on top. The 3.90.1 detour added two optional columns
(`users.resetPasswordRequestedAt`, `media._objectKey`); dropping back to 3.89.0
removes them again, so the migration chain carries an add-then-drop pair rather
than rewriting migrations already applied to staging.

The template's own source has drifted from the versions it pins. **Four**
confirmed instances, all fixed during Stage 0:

| Template says | Reality in 3.89.0 |
|---|---|
| `storage: [r2Storage(...)]` | no such `Config` key — belongs in `plugins` |
| `generatePayloadViewport` | does not exist in `@payloadcms/next` |
| import map → `@payloadcms/ui/rsc` | the generator emits `@payloadcms/next/rsc` |
| `"build": "payload build"` | no such command — it is `next build` |

The first silently dropped R2 storage, so uploads could never have worked. The
last would have failed every deploy at its first step. Treat vendored template
code as needing verification against the installed packages, not as known-good.

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
                    │  Mollie │   │   Mux    │   │  Remotion  │
                    │  (HTTP) │   │  (HTTP)  │   │   Lambda   │
                    └─────────┘   └──────────┘   │   (AWS)    │
                                                 └────────────┘
      Expo app ──────► /api/*  (REST, Payload auth cookies/JWT)
```

One Worker. One deploy. Remotion runs on AWS Lambda, which the Worker submits
renders to over HTTP and polls for completion — the same asynchronous shape the
current Remotion service already uses.

### Repository layout

```text
apps/
  site/          NEW   Next 16 + Payload. Admin, API, public web.
  mobile/        NEW   Expo, Payload REST, own component library.
  render/        NEW   Remotion Lambda deployment config and compositions.
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
  plugins: [r2Storage({ bucket: cloudflare.env.R2, collections: { media: true } })],
  // ...
})
```

Note `plugins`, not `storage`. The published `with-cloudflare-d1` template writes
`storage: [r2Storage(...)]`, but `payload@3.89.0`'s `Config` type has no top-level
`storage` key and `r2Storage` returns a `Plugin`. The template as shipped does not
type-check against the version it pins; this was found and corrected in Stage 0
Task 2. Expect the same class of skew elsewhere in the template.

`wrangler.jsonc` uses `main: ".open-next/worker.js"`, compatibility date
`2025-08-15`, and the compatibility flags `nodejs_compat` and
`global_fetch_strictly_public`.

Bindings live **only** inside named `env.staging` and `env.production` blocks,
never at the top level, so neither environment can be reached by accident and a
deploy with no `CLOUDFLARE_ENV` refuses rather than guessing. That choice has a
typing consequence worth knowing before it surprises someone: `wrangler types`
then emits `D1` and `R2` as *optional* on the base `CloudflareEnv`, so
`cloudflare.env.D1` is `D1Database | undefined`. Assert bindings at runtime
through `requireBinding()` rather than silencing the type with a non-null
assertion — the same fail-loudly posture `requireEnv()` takes for secrets.

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
mutations becomes one relationship field.

An earlier draft of this spec claimed the one-favorite-per-pair rule thereby
became *structural*. It does not. Payload's `hasMany` relationship stores
whatever array it is given, duplicates included — verified against a real
database in Stage 1 Task 4, where `favorites: [id, id]` round-tripped as
`[3, 3]`. The rule is enforced by a `beforeChange` hook on the field instead.
Less elegant than the claim, and true.

A related consequence worth knowing before Stage 3: a favorite pointing at an
inactive gesture is not removed from the array and not nulled. `publicReadActive`
prevents population, so the entry stays as a bare numeric id sitting beside
populated objects. The generated type is `(number | Gesture)[]`, so TypeScript
forces consumers to narrow before reading a field — no read-side hook is needed,
and adding one would be fragile, since at `depth: 0` every entry is legitimately
a number.

Guest identity (`guestId`) does not survive. Payload auth has no anonymous user
concept worth emulating; the mobile app keeps guest state locally and prompts
for an account when the user wants it synced. This is a deliberate product
simplification, confirmed by the product owner on 2026-09-19, not an oversight.

### `lists`

`owner` relationship, `name`, optional `description`, `visibility`
(`private` | `shared`), `viewShareToken`, `editShareToken`,
`allowSharedEditing`, `isDefaultFavorites`, and `items` as an **ordered array
field** of gesture relationships.

**`gesture_list_items` is deleted.** Array order replaces the `position`
integer and all the reindexing logic around it, and the admin panel gets
drag-to-reorder for free.

#### Sharing is inert until Stage 3

Stage 1 builds the storage and the access rules for share links, but **not the
feature**. Four gaps are deliberate, recorded here so Stage 3 closes them
rather than rediscovering them:

1. **Nothing generates the tokens.** `viewShareToken` and `editShareToken` are
   never written, so both columns are always NULL and every share link is
   inert. This is why the tokenless guard in `listReadAccess` /
   `listUpdateAccess` — `if (!token) return false;` — is load-bearing: without
   it a request carrying no token would build `{ equals: undefined }` and match
   every private list in the table. Stage 3 must add token minting (a
   `beforeChange` hook, or an endpoint the owner calls) *and* keep that guard.
2. **A signed-in user cannot follow a share link.** Both access functions
   short-circuit on `if (req.user)` and return `{ owner: { equals: ... } }`, so
   an authenticated recipient of a share link sees nothing. Anonymous-only
   sharing is not the product intent; Stage 3 has to let a signed-in
   non-owner's token widen their filter rather than be ignored.
3. **`visibility` is never consulted.** Setting a list back to `private` does
   not revoke access — only clearing the token does. Stage 3 must either fold
   `visibility` into the access filters or make un-sharing rotate the tokens.
   Two mechanisms that can disagree is the worse option; prefer rotation.
4. **`gesture_id` and `owner_id` are `NOT NULL` with `ON DELETE set null`.**
   Not a `lists` quirk — the same contradiction appears in `sponsorships` and
   `user_consents`. See "Referential integrity" below, which rules on all of
   them at once.

### `sponsorships`

Carried over close to its current shape, because the payment flow depends on it:
gesture relationship, sponsor and contact fields, the three Mux playback IDs
(original, preview, sponsored), `status` as a select over the seven existing
values, dates, Mollie payment reference and amount, admin review fields, the
re-edit token and expiry, invoice fields, and the renewal reminder timestamp.

Status transitions and their side effects move from oRPC mutations into
collection hooks.

#### Deferred from Stage 1

Stage 1 defines the shape only. Four things are knowingly absent:

- **No public read path for overlay data (Stage 2/3).** `read: isAdmin` is
  correct for the row — it carries contact details, a VAT number and an email
  — but the public gesture page needs `overlayText`, `sponsoredVideoPlaybackId`,
  `hasLogo` and `overlayImage` for whichever sponsorship is active and in term.
  That needs a narrow access filter or a server-side projection; widening
  `read` is not an option.
- **No status-transition enforcement (Stage 5).** Every status is currently
  reachable from every other. The seven-value tuple is pinned by test, but
  nothing stops `active` → `pending_payment`.
- **Nothing writes `admin-logs` or `user-consents` yet (Stage 5 / the consent
  stage).** Both are append-only to everyone including admins, so the only way
  in is a hook running with `overrideAccess`. The integration tests pin the
  exact write path those hooks have to use.
- **Payload's generated create types mark `status` and `durationYears` as
  required despite both having defaults (Stage 5).** The very call the default
  exists to serve does not typecheck. Stage 1 carries one narrow documented
  cast in a fixture; Stage 5's callers will hit the same wall and should fix it
  once, centrally, rather than casting at each call site.

#### A Stage 9 import hazard

`analytics_consent` is emitted as `integer DEFAULT false NOT NULL`. A raw-SQL
import that simply omits the column therefore records an explicit *refusal* of
analytics consent rather than an absent answer — silently, for every row. The
Convex migration in Stage 9 must set this column explicitly for every row it
writes, and its dry run must assert the resulting distribution against the
source data rather than trusting the insert.

### `media`

R2-backed uploads collection. Replaces Convex file storage for sponsor logos.

### `admin-logs` and `user-consents`

Kept as collections. Both are audit trails with legal retention requirements —
admin logs for three years, consents for GDPR evidence — so they stay
append-only records rather than becoming document versions.

### Referential integrity

Payload emits every `relationship` column as `NOT NULL` (when `required`) with
`ON DELETE set null`. Those two contradict each other: SQLite cannot null a
`NOT NULL` column, so deleting a referenced row fails with a raw
`Failed query: delete from "gestures" where ...` rather than either cleaning up
or refusing politely. Confirmed against a real database in Stage 1 for
`lists.owner`, `lists.items.gesture`, `sponsorships.gesture` and
`user_consents.user`.

This is one defect with four instances, so it gets one decision rather than
four local ones. The right behaviour is not uniform, though — it follows from
what each row *is*:

| Reference | On delete of the target | Why |
|---|---|---|
| `user_consents.user` | Nullable, set null | A consent record is legal evidence with its own retention period. It must outlive the account it describes, anonymised rather than destroyed — deleting the user is often precisely the event the record has to survive. |
| `sponsorships.gesture` | Refuse, with a real message | Someone paid for this. A sponsorship pointing at nothing is meaningless, and silently discarding it is worse than blocking the delete. The admin gets told which sponsorships block the gesture. |
| `lists.owner` | Cascade | A private list has no meaning without its owner, and leaving ownerless rows behind would strand them where no access filter can ever reach them. |
| `lists.items.gesture` | Drop the array row | The list survives; it just loses an entry. This is the only case where partial cleanup is the obviously correct answer. |

The `user_consents` and `sponsorships` rows exist from Stage 1, so their
behaviour is Stage 1's to fix. The two `lists` cases are Stage 3, alongside the
sharing work above.

Whatever the mechanism, it must be tested by actually deleting the target
against a real database. A schema-level assertion cannot tell a working
`ON DELETE` from one SQLite will reject at runtime — that is exactly how this
defect survived being written four times.

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
| 6 | Video pipeline | Remotion Lambda, Mux integration, preview and final renders |
| 7 | Email and jobs | Email adapter, templates, three scheduled tasks |
| 8 | Native | Expo app on Payload REST with its own component library |
| 9 | Data migration | Scripted Convex → D1 migration, verified by dry run |
| 10 | Cutover | DNS switch; old apps and packages deleted |

Stages 0–5 are strictly ordered. Stage 8 depends on Stage 4. Stages 9 and 10
depend on everything.

## Stage 0 gates

Three things were unverified when this spec was written. All three are now
resolved; measurements are in
[`2026-09-19-stage-0-findings.md`](./2026-09-19-stage-0-findings.md).

1. **Remotion in a Cloudflare Container** — **abandoned by decision, 2026-09-19.**
   The spike never ran: the available environment had no Docker daemon, and the
   container was always the least proven part of this design. Rather than hold
   Stage 6 hostage to an environment change, video composition moves to
   **Remotion Lambda**, the mature documented serverless path. The decision
   table above is updated accordingly. Stage 6 is now plannable.
2. **Worker bundle size** — **measured: 6.45 MiB gzipped of 10 MiB, 64.5%
   consumed.** Below the 40% headroom threshold this spec set, so it is flagged.
   Bundle size is now a standing constraint on every later stage rather than a
   Stage 0 checkbox. See the findings document for what is recoverable.
3. **Bun compatibility** — **PASS.** All Payload CLI commands run under bun with
   no workarounds. The pnpm fallback is unused.

A failed gate changes the design. Gate 1 did exactly that, and the change is
recorded above rather than worked around.

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
| **Worker size limit reached mid-migration** | **Live risk.** 64.5% consumed at Stage 0. CI enforces a budget; re-measure every stage and justify each delta. Measured: the Payload + Next runtime alone is 57.9% of budget before any product code. `drizzle-kit` was tested and is not uploaded. The only identified lever is 602 KiB of unused `ImageResponse` assets — there is no large easy win. |
| Lambda cold starts on first render | Renders are already asynchronous with polling; sponsor UX unchanged |
| Users lost at the auth cutover | Migration creates accounts and sends a set-password mail; favorites and lists survive keyed by email |
| Mollie webhook replay during cutover | Endpoint is idempotent; old and new stacks both reconcile against Mollie as the source of truth |
| Translation backlog | `en` and `fr` fall back to `nl`; no empty pages ship |
