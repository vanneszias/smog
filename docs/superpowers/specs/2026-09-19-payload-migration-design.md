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
- **Nothing writes `admin-logs` or `user-consents` yet.** `admin-logs` gets
  its writer in Stage 5 (sponsorship status transitions). `user-consents`
  gets Stage 8.5 — decided 2026-09-21, after the Stage 5 plan's self-review
  found that "the consent stage" named here did not exist in the stage
  table and so belonged to nobody. The collection has shipped since Stage 1
  with a GDPR retention rationale, a nullable `user` column so a record
  outlives the account it describes, and not one row; Stage 4's test that
  account deletion preserves consent records proves a property nothing in
  the product could reach until then. Its writer is the cookie and analytics banner, which is
  a public-site concern and not a sponsorship one. It must precede Stage 9
  because of the `analytics_consent` hazard recorded below: an import into a
  table nobody has defined a write path for cannot know whether a missing
  value means "no answer" or "declined". **Correction, Stage 8.5:** an earlier
  draft of this line said that test "proves a property of an empty table",
  and that is wrong. `account.int.test.ts:1181-1203` creates a `user-consents`
  fixture row, **reads it back** to confirm the fixture really set the user
  before asserting anything, and only then deletes the account. The property
  it proves is real and the test is sound; what was missing was a *production*
  write path, not a row. Both are append-only to everyone including admins, so the only way
  in is a hook running with `overrideAccess`. The integration tests pin the
  exact write path those hooks have to use.
- **Payload's generated create types mark `status` and `durationYears` as
  required despite both having defaults (Stage 5).** The very call the default
  exists to serve does not typecheck. Stage 1 carries one narrow documented
  cast in a fixture; Stage 5's callers will hit the same wall and should fix it
  once, centrally, rather than casting at each call site.

#### Correction: `molliePaymentId` must not be unique

Stage 1 declared `molliePaymentId` as `index: true, unique: true`, with
the rationale that "the Mollie webhook resolves a payment to a
sponsorship through this column, so two rows sharing one id means the
webhook marks the wrong sponsorship paid".

That rationale describes a one-to-one relationship the product does not
have. `packages/convex/convex/schema.ts` declares
`.index("by_payment_id", ["molliePaymentId"])` — a **plain index** — and
`apps/server/src/webhooks/mollie.ts` writes `molliePaymentId: paymentId`
to *every* sponsorship named by a bulk payment. One payment covering many
sponsorships is the shipped behaviour, and `apps/site` makes it the norm
rather than the exception by writing one row per selected gesture.

So the constraint is wrong, and it fails closed: the second row a bulk
checkout writes is refused by the index. Stage 5 Task 7 drops it and
keeps the plain index.

**Uniqueness does not leave the design, it moves to where it works.**
`webhook-deliveries.paymentId` is one row per Mollie payment and is the
claim that makes the webhook exactly-once — see "A `where` on an update
is a SELECT" below for why that is the only atomic primitive available.

#### A Stage 9 import hazard

`analytics_consent` is emitted as `integer DEFAULT false NOT NULL`. A raw-SQL
import that simply omits the column therefore records an explicit *refusal* of
analytics consent rather than an absent answer — silently, for every row. The
Convex migration in Stage 9 must set this column explicitly for every row it
writes, and its dry run must assert the resulting distribution against the
source data rather than trusting the insert.

#### Findings from Stage 8.5, so a later stage does not re-learn them

- **Redis-backed anything cannot cross to the Worker, and the replacement is a
  unique index.** The shipped limiter,
  `apps/server/src/services/rateLimit.ts`, is a Hono middleware over a
  module-level `ioredis` client using `INCR` — atomic in the store. `apps/site`
  declares no Redis client, no Redis is reachable from a Cloudflare Worker in
  this infrastructure, and `wrangler.jsonc`'s whole binding inventory is
  `ASSETS`, `D1`, `R2` and `EMAIL`: no KV, no Durable Object, no Cloudflare
  Rate Limiting binding, no Analytics Engine. The store therefore has to be the
  application's own D1, and — as `lib/claims.ts` already established for the
  Mollie webhook and the render callback — **a unique index is the one atomic
  primitive this adapter has**, because SQLite evaluates it inside the INSERT.
  `lib/rateLimit.ts` is `INSERT … ON CONFLICT(key) DO UPDATE SET count = count
  + 1 RETURNING count` through `payload.db.drizzle`, one statement, below
  Payload's API on purpose.
- **The limiter's two candidate designs are not near neighbours, and the
  measurement is why the gate existed.** At 20 parallel calls with a limit of
  10: upsert-and-return allows **10**; count-then-insert (`payload.count` then
  `payload.create`, using only shipped primitives) allows **20**; and
  upsert-and-return with the unique index removed allows **0**, because SQLite
  rejects an `ON CONFLICT` target matching no constraint and the fail-closed
  path takes over. Count-then-insert is not an approximate limiter — at that
  concurrency it is no limiter at all, while passing every sequential
  functional test. Anyone tempted to simplify this should reproduce those three
  numbers first.
- **Fail-open does not transfer when the store becomes the app's own
  database.** The Redis original swallows store failures because Redis is a
  separate service. In a Worker whose limiter counts in the same D1 that serves
  every page, there is no "limiter down, site up" to stay available for, and
  failing open converts any provokable fault into an unlimited public write
  endpoint. `lib/rateLimit.ts` refuses instead, and logs.
- **knip does not report an entry file's own exports, which makes the same
  construct fail in one workspace and pass in another.** `knip.json`'s
  `workspaces` map covers eight workspaces; `packages/ui-web` is not one of
  them, so knip falls back to its `package.json` `main`/`types`/`exports` — all
  `./src/index.ts` — and treats everything that file exports as public API. An
  export nothing imports therefore **fails CI in `apps/site/src/lib` and passes
  in `packages/ui-web`'s `index.ts`**. That is correct behaviour for a library,
  but it means moving a symbol between the two changes whether CI can see it,
  and an unused component can sit in `ui-web` indefinitely. This is not Stage
  8's `apps/mobile` defect, where an entry glob of `src/**/*.ts` swallowed
  ordinary internal modules and hid genuinely dead code.
- **A randomised test fixture is not an isolated one.** A helper in
  `endpoints/analytics.int.test.ts` returned a random address out of 254 under
  a doc comment promising "a fresh `cf-connecting-ip` per test, so no two tests
  share a budget". An address *is* a budget in this limiter, so ten tests over
  254 values is a birthday collision at a few percent per run — ten green CI
  runs, then a red one. Stages 9 and 10 will write more tests against this same
  limiter: allocate keys from a counter that throws when it runs out, and clear
  the namespace in `beforeEach`, because unique keys hold only while every
  future test remembers to ask for one, and a test that forgets falls into the
  shared `"unknown"` bucket silently. Note also that `.wrangler/state/vitest`
  is persisted, so a run that dies before its cleanup leaves spent rows for the
  next run to inherit.
- **Unbounded `payload.delete` still bites, in three places now.** D1 refuses
  at 100 bound parameters and `payload.delete` emits one per *deleted document*
  on the trailing `delete from "payload_preferences" where key in (…)`.
  `jobs/cleanupOrphanedMedia.ts` documents it, `pruneRateLimits` was fixed for
  it in Stage 8.5, and `endpoints/account.int.test.ts`'s `afterAll` still has
  it — invisible in CI, which starts from an empty persistence directory, and
  fatal locally once enough runs accumulate in `.wrangler/state/vitest`.

### `media`

R2-backed uploads collection. Replaces Convex file storage for sponsor logos.

### `admin-logs` and `user-consents`

Kept as collections. Both are audit trails with legal retention requirements —
admin logs for three years, consents for GDPR evidence — so they stay
append-only records rather than becoming document versions.

### The mounted REST API leaks account existence

Stage 4 Task 2 closed email enumeration on the site's own sign-in and sign-up
endpoints — identical bytes for unknown, wrong-password and locked, plus a
500 ms floor because the timing ranges were disjoint enough to classify in one
request. **That is not the whole attack surface**, and the task said so rather
than claiming the criterion met.

`app/(payload)/api/[...slug]/route.ts` mounts Payload's REST API. Reproduced
against a running dev server:

```
POST /api/users  {fresh address}     -> 201
POST /api/users  {existing address}  -> 400
   "A user with the given email is already registered."
POST /api/users/login  {locked}      -> 401
   "This user is locked due to having too many failed login attempts."
```

`POST /api/users` is public because `users.access.create` is `() => true` —
deliberate, so people can register. It is also a more direct oracle than
anything the sign-in flow exposed.

**So Stage 4 exit criterion 5 is met for the site's own endpoints and not for
the site as deployed.** Do not let it close on the strength of the sign-in
tests.

Neither fix is small, which is why this is recorded rather than rushed:

- **Shadowing `/api/users/login`** is mechanically possible — `sanitize.js`
  appends Payload's built-ins *after* a collection's own endpoints and
  `handleEndpoints` takes the first match — but it means reimplementing
  `loginHandler` for the admin panel, which would lose its lockout message.
- **Closing REST registration** changes semantics that
  `Users.escalation.int.test.ts` pins, and `Users.ts` already records that
  public registration is revisited "when social login lands".

Social login is Task 3, so that is where this belongs.

**Closed in Stage 4 Task 3, and both of them, not one.** Recorded here rather
than deleted, because the reasoning above is the reasoning that produced the
fix and the next person meeting a mounted REST API should read it:

- `users.access.create` is now `isAdminOrSelfRegistration` — admins, plus the
  site's own `/auth/sign-up`, which identifies itself with
  `req.context[SELF_REGISTRATION]`. That is sound because
  `createPayloadRequest` sets `context: {}` **unconditionally** for every REST
  and GraphQL request (a literal, verified at the call site), so only the
  Local API can populate it. `POST /api/users` now answers 403 for a
  registered address and a free one alike, byte for byte.
- `POST /api/users/login` is shadowed by a collection endpoint on `users`,
  using exactly the `sanitize.js` / `handleEndpoints` ordering described
  above. It flattens every credential failure into a real
  `AuthenticationError` — so `routeError` emits the *same bytes* as the
  unknown-address case rather than a hand-matched copy — and applies the same
  500 ms floor as `/auth/sign-in`.

The trade the note above anticipated was made deliberately: **the admin panel
no longer tells an admin that their account is locked.** It says "the email or
password provided is incorrect", like every other refusal. A message only a
registered address can provoke is a registered-address oracle whoever reads
it, and the public sign-in page already makes the same trade.

One thing the note did not anticipate, found by driving `/admin/login` in a
browser: **Payload's admin panel posts `multipart/form-data` with the body in
a `_payload` field**, not JSON. `wrapInternalEndpoints` is what gives
Payload's own endpoints `req.data`, and it does not wrap a collection's. A
shadowing endpoint that reads only JSON passes every test and every `curl`
and locks the admin panel out.

**Stage 4 exit criterion 5 is now met for the site as deployed.** Verified
with real requests against a running dev server before and after; the
transcripts are in
`.superpowers/sdd/2026-09-20-stage-4-auth/task-3-report.md`.

### A three-character password could be set through password reset — closed in Stage 4 Task 5

**Status: closed.** `users.hooks.beforeOperation` now carries
`enforcePasswordPolicyOnReset` (`apps/site/src/hooks/enforcePasswordPolicy.ts`),
which applies the same twelve-character floor to `resetPassword`.
`Users.password.int.test.ts` fails by name — `rejects a three-character
password` and `rejects a common password that clears the length floor` — if
the hook is removed, and `Users.test.ts` pins the wiring. **Stage 7 can
configure the email adapter without re-opening this.** The rest of this
section is the original finding, kept because the mechanism is worth knowing
before anybody touches that hook.

The fix is *not* the endpoint override this section originally costed. Read
`enforcePasswordPolicyOnReset` before changing it: `resetPasswordOperation`
calls `buildBeforeOperation` as the first step inside its transaction, before
the token is looked up and long before `generatePasswordSaltHash`, and hands
every `beforeOperation` hook the operation's own `args` — `data.password`
included, as plaintext
(`payload/dist/collections/operations/utilities/buildBeforeOperation.js`,
verified at the call site). A hook therefore costs nothing in bundle terms and
covers the REST endpoint, the GraphQL mutation, the admin panel's reset screen
and `payload.resetPassword` from server code, where an endpoint override would
have covered one of the four.

Found in Stage 4 Task 1 and verified in `node_modules`.

`auth/operations/resetPassword.js` hashes the new password **first** and calls
`beforeValidate` afterwards, with the *user document* as `data`. By the time
any collection hook runs, `data.password` is undefined — so the password
policy added in Stage 4 Task 1 cannot see the plaintext and cannot reject it.
Payload's own floor at that entry point is a hard-coded 3 characters.

`app/(payload)/api/[...slug]/route.ts` mounts the REST API, and
`auth/endpoints/index.js` registers `/forgot-password` and `/reset-password`
for every auth collection. The endpoints exist and respond today. **The only
reason nobody can walk through them is that no email adapter is configured**,
so the reset token is written to the console instead of being delivered.

**Stage 7 configures the email adapter.** Before Stage 4 Task 5 that would
have re-opened a three-character password floor on a production site —
silently, because every existing test still passed. It no longer does; see the
status note at the top of this section.

**What Stage 7 still has to decide, because Task 5 deliberately did not.**
Closing the floor is not the same as building the reset flow, and three
things are still missing:

- **Nothing rate-limits `/forgot-password`.** Payload's own endpoint will
  happily mint and mail a token per request, and it answers a registered and
  an unregistered address differently enough to be worth measuring against
  Review Focus item 5 the way Task 2 measured sign-in.
- **`resetPasswordToken` is stored in the clear**, unlike the address-change
  token `endpoints/account.ts` added, which is stored as a SHA-256. That is
  Payload's behaviour, not a choice this project made, and closing it means
  shadowing the endpoint after all.
- **A completed reset does not revoke other sessions**, where a password
  change through `/account/password` does. The two ought to agree.

No characterization test was added asserting the old behaviour. A green test
whose assertion is "this weakness still exists" reads as approval of it to the
next person who greps for the endpoint.

### A relationship field accepts an id for a row that does not exist

Found in Stage 4 Task 4 and verified at the call site. This is not specific to
favorites; it applies to **every** relationship field in the project.

`payload/dist/utilities/isValidID.js` is the whole of Payload's relationship
validation, and for a numeric key it is:

```js
if (type === 'number' && typeof value === 'number' && !Number.isNaN(value)) {
    return true;
}
```

A `typeof` test. No query, no existence check. So `favorites: [999000001]`
writes a dangling reference, and the same is true of any `relationship` or
`hasMany` field written through the Local or REST API.

Two consequences worth carrying:

- **A caller that accepts ids from a request must resolve them itself**, with
  `overrideAccess: false`, before writing. Task 4's favorites endpoint does
  this, which also stops a non-admin favouriting an *inactive* gesture — the
  access check comes for free with the lookup and would not have happened
  otherwise.
- **The same function rejects string ids on a numeric key.** Every other layer
  in this app carries ids as strings, so anything writing a relationship has to
  convert, and a silent no-op is the failure if it does not. Assert the stored
  type rather than trusting the round trip.

Stages 5 and 9 both write relationships from external input — the sponsorship
flow from a form, the Convex import from a file — and neither gets existence
checking from the framework.

**Correction, Stage 4 Task 7: the dangling row does not reach the database.**
The `isValidID` reading above is right, and the conclusion drawn from it —
"`favorites: [999000001]` writes a dangling reference" — is wrong. Measured
against this project's own local D1 rather than inferred, on both of the
tables in question:

```
dangling users.favorites  -> Failed query: insert into "users_rels" …
  Caused by: D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT
             (extended: SQLITE_CONSTRAINT_FOREIGNKEY)
dangling lists.items.gesture -> Failed query: insert into "lists_items" …
  Caused by: the same
```

Payload's validation lets the id through; the schema's foreign key stops it.
That is the same `NOT NULL` + `ON DELETE set null` relationship column
"Referential integrity" below rules on, seen from the insert side.

**The advice does not change, but its reason does.** A caller that accepts
ids from a request must still resolve them with `overrideAccess: false`, for
two reasons neither of which is data integrity:

- the unresolved id is an unhandled `DrizzleQueryError` — a 500 with a JSON
  body in a browser window — where every other refusal on the same surface is
  a sentence. The foreign key protects the row; it does nothing for the
  person.
- the lookup is where the *access* check happens, and no constraint in the
  schema expresses "not a gesture an editor has deactivated". That half was
  always the load-bearing one, and it is the half a mutation can prove:
  flipping `overrideAccess` to `true` fails a test in both
  `endpoints/favorites.int.test.ts` and `endpoints/lists.int.test.ts`,
  while deleting the whole lookup fails on the constraint.

A second, narrower correction from the same task. The screen that keeps a
non-numeric id out of a query — `isGestureId` and friends — is about
`parseFloat` inside `sanitizeQueryValue`, which is the path a **`where`
clause** takes. A `findByID` on the primary key does not take it: measured,
it answers `null` for `1abc`, `007` and `abc`, and resolves `1.0` to row 1,
which `Number` reads identically. So a screen in front of a `findByID` is
unprovable and was removed from `endpoints/lists.ts`; a screen in front of a
`Number` that feeds a filter is not, and stays.

### There are no transactions on any write path

Found in Stage 3 Task 8 by a mutation that should not have been able to fail,
and verified at the call site rather than inferred:

- `payload.config.ts` builds `sqliteD1Adapter({ binding })` with no
  `transactionOptions`.
- `@payloadcms/db-d1-sqlite/dist/index.js:83` therefore sets
  `beginTransaction: defaultBeginTransaction()`.
- `payload/dist/database/defaultBeginTransaction.js` returns
  `() => Promise.resolve(null)`.

A null transaction id makes `initTransaction` return false, so nothing is ever
begun and `killTransaction` rolls nothing back. **Every multi-step write in
this project is partially committed on failure.**

This is a property of the adapter configuration, not of any one hook, and it
changes how the rest of the migration must be written:

- **Hook order is load-bearing, not defensive.** On `gestures.beforeDelete`,
  `blockDeleteWhenSponsored` must run before `dropDeletedGestureFromLists`:
  reversed, a refused delete still strips the gesture from every list first,
  and nothing puts it back. Proven by mutation against a real database —
  `refuses a sponsored gesture without stripping it from any list` fails.
- **A cascade is not atomic.** `cascadeListsOnUserDelete` runs in
  `beforeDelete` rather than `afterDelete` for this reason: the alternative
  failure mode is orphan lists with a dangling `owner_id` that no access
  filter can reach.
- **Stages 5 and 9 need to plan for it.** Sponsorship status transitions with
  side effects, the Mollie webhook, and the Convex import are all multi-step
  writes. Each needs to be either idempotent or ordered so that the
  irreversible step is last.

Enabling `transactionOptions` would fix all of this, and is deliberately *not*
done here: it is an adapter-wide change touching every write path, and it
needs measuring against a real Worker rather than miniflare. Recorded as a
decision to revisit, not an oversight.

A Stage 1 comment in `hooks/blockDeleteWhenSponsored.ts` claimed its lookup
ran "inside the delete's transaction". That was wrong and has been corrected
in place.

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
| 8.5 | Consent | Cookie and analytics banner; the first writer `user-consents` has ever had |
| 9 | Data migration | Scripted Convex → D1 migration, verified by dry run |
| 10 | Cutover | DNS switch; old apps and packages deleted |

Stages 0–5 are strictly ordered. Stage 8 depends on Stage 4. Stages 9 and 10
depend on everything.

**Stages 0 through 8 have landed**, each with its exit assessment appended to
its own plan under `docs/superpowers/plans/`. Stage 8 met nine of its ten exit
criteria; the tenth is "works on a real device", which no environment this
project has run in can satisfy — see that plan's exit section for exactly what
is unverified. **Stage 8.5 is the next plan to write.**

**Stage 8.5 is numbered rather than inserted** so that the four plan documents
and every cross-reference already written against stages 9 and 10 keep
meaning what they say. It must land *before* Stage 9, which is the whole
reason it exists as a stage rather than as a wish — see below.

## Carried out of Stage 2

Stage 2 met all nine of its exit criteria. Three things survived it anyway and
belong to Stage 3, recorded here because none of them fails a test today.

### The light theme has no visible surface hierarchy

Measured in a real browser, not inferred: light `background` and
`surface-raised` are **the same colour** (`#ffffff`, ratio 1.00), `background`
to `surface` is 1.06, and the only thing separating a raised component from the
page is a `borderSubtle` edge at **1.32:1**. Dark mode is fine (1.13 / 1.26 /
1.41, edge 1.97).

Every existing test passes, and would keep passing if the hierarchy were
invisible, because contrast tests assert text legibility rather than whether a
card can be told apart from the page behind it. Three token options are written
up in the Task 8 report; this is a design decision for Stage 3, not something to
paper over by adding borders to individual components as they are built.

### Two copies of `@radix-ui/react-dismissable-layer`

Tooltip pins 1.1.11, Dialog pins 1.1.19, so they maintain independent layer
stacks: an open tooltip `preventDefault()`s Escape and the dialog then declines
to close. Diagnosed with an instrumented listener trace and confirmed at the
call site.

**Not fixed.** A root `overrides` entry did not dedupe under bun — the nested
exact pins survived — and forcing it needs a clean reinstall plus revalidation
of all four apps, which is not a thing to do at the end of a stage. Escape works
on the kitchen-sink route today only because the page no longer pins a tooltip
open; the cause is still installed. Stage 3 should fix it properly before
building overlay-heavy pages on top of it.

### The strongest style guard does not run in CI

Three layers now guard the spacing scale: the named-alias hazard at the token
source (`css.test.ts`, in CI), numeric off-scale classes in both packages
(in CI), and the *compiled stylesheet in a real browser* — which is the only one
that would have caught `max-w-lg` collapsing to 24px, and it runs only under
`test:e2e`, which CI does not run.

Worse, `bun -F site test:e2e` is broken independently of this work: its
`--import=tsx/esm` fights Playwright's own loader on Node 22
(`ERR_INVALID_RETURN_PROPERTY_VALUE`), so nobody can run the e2e suite through
the package script at all. Stage 3 should fix the script first, then decide
whether CI runs it — a guard nobody executes is documentation.

**Resolved in Stage 3, 2026-09-20. CI runs it.** Task 1 fixed the script; Task 9
took the decision with measurements rather than a preference, because the cost
of getting it wrong is a browser job that is red one run in five, ignored within
a week and then disabled.

- **Flakiness: 6 runs, 69 specs, 0 failures, 0 retries.** Five consecutive runs
  at the CI configuration (`--workers=1`, retries disabled locally so a flake
  could not be papered over), plus a sixth against a deleted
  `.wrangler/state/v3` — the state a fresh checkout starts in.
- **Runtime: 96-101 s wall per run**, dev-server boot included. It is therefore
  a separate parallel `site-e2e` job rather than another step in
  `release-check`, which is ~5 minutes on its own.
- The suite is still flaky at two or more workers, and that is understood
  rather than tolerated: a spec helper's Payload instance and the dev server
  both write `.wrangler/state/v3`, and SQLite answers the second writer with
  `SQLITE_BUSY`. `playwright.config.ts` pins one worker on CI, which is why the
  measurement was taken there.

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

## A locked account answers "no" to every password, including the right one

Found in Stage 4 Task 5, and it is the cleanest example yet of the pattern
this document keeps recording: a test that passes while the thing it guards
is broken.

`endpoints/account.int.test.ts` checked that a refused password change had
not changed the password, by trying to sign in with the new one and
expecting failure:

```ts
await lockOut(member.email);
// …the endpoint refuses, because the account is locked…
expect(await canSignIn(member.email, NEXT)).toBe(false);
```

The account is locked at that point, and Payload raises `LockedAuth` from
`authenticateLocalStrategy` **before it compares any hash**. So the call
answers `false` for every password there is. The assertion could not fail.

Measured, not argued: a probe locked an account, changed its password
through `payload.update`, then signed in with the *correct new* password and
still got `false`.

Proved in both directions with the same mutation — `changePassword` writing
the new password *before* honouring the credential refusal:

| Assertion | Mutant |
|---|---|
| `canSignIn(email, NEXT) === false` alone | **survived** |
| `unlock()`, then `NEXT === false` *and* `PASSWORD === true` | **caught** |

Two lessons that generalise past this one test. A negative assertion needs a
positive one beside it: "the new password does not work" is worth nothing
without "the old one still does", because a broken account satisfies the
first for free. And a lockout is a state that silences every other signal
the account can give, so a fixture that locks an account must unlock it
before asking it anything else.

## A Playwright absence assertion passes on a page that has not rendered yet

Stage 4 Task 6. The same lesson as the locked-account section above, in a
different runner, and this one was caught by a mutation rather than by
reading.

The merge that carries a guest's favorites into their new account has to run
on the page **sign-in lands on** — `endpoints/auth.ts` answers a successful
sign-in with `seeOther(homePath(locale))`, and `FavoriteButton`, the only
component that merged, renders on gesture pages alone. So as first built,
Stage 4 exit criterion 6 was really "merges on the first gesture page after
sign-in", which for a reader who never opens one is never. The fix is
`components/GuestFavoritesSync.tsx` in the locale layout.

The e2e test written to prove it did not:

```ts
await expect(async () => {
  await page.goto(`${SITE}/nl/favorites`);
  await expect(
    page.getByRole("heading", { name: "Nog geen favorieten" })
  ).toBeHidden();
}).toPass();
```

`FavoritesList` opens in a `loading` state that renders neither the cards nor
the empty state, and **Playwright's `toBeHidden()` is satisfied by an element
that does not exist**. So the assertion passed on the loading frame, and
deleting `GuestFavoritesSync` from the layout — the one thing the test exists
to catch — still passed. Asserting the card is *present* fixed it; the
mutation then failed as it should.

The rule: **assert presence, not absence**, whenever the absence is also what
an unfinished render looks like. An absence assertion is only meaningful
once something else proves the page has settled.

## A saved request is not worth an unprovable guard

Also Stage 4 Task 6, and recorded because the reasoning generalises past it.

Two components now trigger the guest merge — the layout's sync on every
signed-in page, and `FavoriteButton` on a gesture page — so on a gesture page
both fire and the same ids are posted twice. An in-flight guard in
`syncGuestFavorites` collapsing concurrent callers onto one promise was
written and worked.

It was reverted. Handing both callers the *same* promise fixes the order in
which their `.then` handlers run: the abandoned caller's always settles
before the live one's, so the live answer always lands last. That made
`FavoriteButton`'s `live` cleanup flag unprovable — the mutation deleting it
stopped failing anything, because the stale write could no longer win. The
guard still mattered; nothing could show that it did.

The duplicate POST is precisely the case the server half's idempotency was
built for, and that idempotency *is* mutation-proven. Trading a proven guard
for an unproven optimisation is the wrong direction, so the optimisation
went.

## A client built at module scope from an unset variable is dead on import

Stage 5 Task 3, found by a throwaway probe build rather than by reading.

`@mollie/api-client` validates in its constructor: `createMollieClient({ apiKey: "" })`
throws `Parameter "apiKey" is an empty string.` The shipped
`packages/auth/src/lib/payments.ts` is

```ts
export const mollieClient = createMollieClient({
  apiKey: process.env.MOLLIE_API_KEY || "",
});
```

at **module scope**, so in any environment where `MOLLIE_API_KEY` is unset,
*importing that module throws* — not the request that needed Mollie, the
import. The probe build died in `next build`'s page-data collection for
exactly this reason.

The failure mode is what makes it worth recording: a secret read at module
scope turns a missing-configuration problem into a build or boot failure in
a file that may have nothing to do with payments, and the stack trace names
the importer rather than the cause. Read at call time, the same missing
variable is one endpoint answering 500 with a message that says which
variable is missing.

`apps/site/src/lib/mollie.ts` reads the key per call for this reason. **Stage
7's email adapter has the same shape and the same temptation**, and Stage 10
should not port `packages/auth/src/lib/payments.ts` as it stands.

## Two more ways a test can prove nothing, both from Stage 5 Task 3

The list this document keeps is now at eight. These two are cheap to repeat.

**An assertion whose inputs cannot violate it.** The plan asked for
`it("returns whole cents, never a fraction")`, looping integer counts through
a function built from integer constants. Integers times integers are
integers, so no mutation of the arithmetic could fail it. The function can
only produce a fraction from a non-integer *count*, so the guard is
`Number.isInteger(gestureCount)` and what proves it is the positive case —
`sponsorshipAmountCents(2.5, false)` must throw.

**An equivalent mutation, deleted rather than recorded.**
`...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {})` and a plain
`webhookUrl: input.webhookUrl` serialise to identical bytes, because
`JSON.stringify` drops `undefined` values. No test can distinguish them. The
conditional spread reads as a guard and is not one, so it went — the same
ruling as the `isGestureId` screen in Stage 4 Task 7 and the empty-token
early return in `confirmEmailChange`.

A third from the same task is the more dangerous kind, because the guard was
real and only *looked* redundant: a bare `typeof value !== "string"` check on
Mollie's decimal amount survived its mutation because a downstream
`Number.isFinite` caught the `undefined` case. Strengthening the test to list
every way the field can be missing then failed against the implementation —
`Number("")` is **0**, so a payment carrying `value: ""` was being read as
`amountCents: 0`. A guard that appears masked may be masking a bug.

## A `where` on an update is a SELECT, so it cannot serialise anything

Stage 5 Task 4, and the most consequential finding of the stage — because it
is the mechanism the plan proposed for the one hazard "There are no
transactions on any write path" creates.

The idea was a **conditional update**: move a row with an `update` whose
`where` names the status being moved *from*, and treat "zero rows changed"
as "somebody else got there first". It reads like SQL's
`UPDATE … WHERE status = 'pending_payment'`, which is atomic. It is not that.

Measured against this project's own D1, twice, independently:

```
two concurrent conditional updates on one row  ->  both report docs.length === 1
five concurrent conditional updates on one row ->  all five report docs.length === 1
```

The source says why. `payload/dist/collections/operations/update.js` resolves
the `where` with a **separate `payload.db.find`** and then calls
`updateDocument` per id; `@payloadcms/drizzle/dist/updateOne.js` does the same
one layer down — `select id … limit 1`, then upsert. So the `where` is a
SELECT that happens before the write, with nothing joining them. Every
concurrent caller selects the same row and every one of them "succeeds".

Related but weaker in the same way: **Payload's own `unique` pre-check is a
read followed by a write**, so it does not stop two concurrent creates
either.

**What does work is a unique index, because SQLite evaluates it inside the
INSERT.** `collections/WebhookDeliveries.ts` is one row per Mollie payment
id, `unique: true`, claimed before any sponsorship is touched. Of two
concurrent creates exactly one succeeds; of five, exactly one. The loser
arrives as a raw `Failed query: insert into "webhook_deliveries" …` rather
than a Payload `ValidationError` — precisely *because* the pre-check did not
fire — so the claim confirms a failure by reading the row back, and a
database outage cannot masquerade as a replay.

Three things follow for the rest of this migration:

- **Any "exactly once" requirement needs a unique index, not a `where`.**
  Stage 7's jobs (`expire-sponsorships`, `cleanup-stale-payments`) and Stage
  9's import all have this shape.
- **A claim must be handed back when the work did not complete**, or a
  half-applied delivery leaves a record saying it was handled.
- **A `where` clause on an update is still useful** — it selects the rows
  that still need moving — but naming it a guard is how the next person
  stops looking. The webhook says so at the line.

## A helper named for a loop that it does not contain

Stage 5 Tasks 6-7. The tenth entry on the list of tests that pass while the
thing they guard is unproven — and the first one where the test was *right*
and its helper was lying.

`tests/e2e/overlay-layers.spec.ts` had:

```ts
async function hoverUntilTooltipOpens(page, trigger) {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.hover();               // once
  ...
}
```

It hovers exactly once. A server-rendered trigger is inert until React
hydrates it, so a hover that lands early wires nothing up — and because the
pointer is then already inside the element, **no further pointer-enter is
coming**. The caller's `toBeVisible` spends its entire timeout waiting for a
tooltip that was never going to appear.

The same hazard `FavoriteButton` grew its `data-ready` attribute for, and it
does not announce itself: it passes on an idle machine and fails on a busy
one. It surfaced only when Stage 5's sponsor spec was added ahead of this
file and made the dev server slower to serve the route.

Measured rather than guessed, which is what separated cause from coincidence:

| run | result |
|---|---|
| full suite, with the sponsor spec | flaky, 2 of 2 |
| this spec alone | clean, 3 of 3 |
| full suite, sponsor spec excluded | clean |
| full suite, after the fix | clean, 2 of 2 |

The fix is for the helper to do what its name says: hover, wait briefly,
move the pointer away, hover again, up to five times. **It weakens nothing.**
The caller still asserts the tooltip is visible and every later assertion is
untouched; a mutation that removes the tooltip content entirely still fails
the test. What it stops is the test depending on hydration having finished
before the first hover.

The general shape is worth keeping: **a helper whose name promises a loop
should contain one**, and a name that describes a retry is the easiest place
in a suite for a missing retry to hide.

## The test suite was starting 152 miniflare instances and disposing none

Found when `release-check` went red on a **documentation-only commit**, with
eleven failures in `search/search.int.test.ts` that no local run reproduced.
The error was not ours:

```
AssertionError: (message?.id === id)
  at assert                miniflare/.../proxy/fetch-sync.ts:147
  at ProxyStubHandler.#syncCall  miniflare/.../proxy/client.ts:674
```

That is miniflare's proxy delivering a response to the wrong request.

**The cause.** `payload.config.ts` calls `getPlatformProxy()` at module
scope. Vitest's default `isolate: true` gives every test *file* a fresh
module registry, so every file evaluated that line again — while the
underlying miniflare instances are OS-level resources in a reused worker
process and nothing ever disposed them. Measured:

| | `isolate: true` | `isolate: false` |
|---|---:|---:|
| miniflare instances started | **152** | **13** |
| suite duration | 245.8s | **99.1s** |

Thirteen is about one per worker. A hundred and fifty-two live instances
sharing one sync-fetch proxy is what made an id collision possible — and it
also explains the `SQLITE_BUSY` noise (many instances, one persist
directory) and an unexplained `EXIT=1` that reported every test passing.

**The fix that looked obvious does not work.** The upstream this was adapted
from caches the context on `globalThis[Symbol.for("__cloudflare-context__")]`
and our adaptation dropped that, so restoring it was the first idea. Probed
before writing it: a value set on `globalThis` in one test file reads back
`undefined` in the next, because Vitest's isolation replaces the global too.
The cache would have been a no-op.

**`isolate: false` works, and introduced one flake of its own.** Sharing one
jsdom environment across a worker's files means `localStorage` survives from
file to file, and `guestStore.test.ts`'s "returns an empty list when nothing
is stored" started failing intermittently. That test had been passing
because Vitest handed it a fresh environment, not because anything cleared
the store — the same shape as every other entry on this list. A global
`beforeEach` clear in `vitest.setup.ts` fixes it at the runner, where the
property belongs; none of the eight files that touch `localStorage` seeds it
in a `beforeAll`, so nothing is taken away.

Four consecutive clean runs afterwards, at 1232 tests, and the suite is 2.5x
faster. **An intermittent failure in an unrelated file is worth the same
suspicion as a reproducible one**: this one had been visible for two stages
as "SQLITE_BUSY noise" and a single unexplained exit code before it finally
failed a build.

## A collection `beforeChange` hook sees the whole document, so "no change" reads as an allowed change

Stage 6 Task 3, and it invalidates a security assumption written into that
stage's plan.

`hooks/enforceStatusTransitions.ts` refuses any move the table forbids, and
is deliberately subject to `overrideAccess` so that every writer is held to
it. The Stage 6 plan leaned on that: a render finishing after its
sponsorship was cancelled would, it said, be refused by the hook, so the
callback merely had to handle its own refusal gracefully.

**It is not refused.** By the time a collection `beforeChange` runs, `data`
is the *whole merged document* — Payload 3.89.0 fills absent fields from
`originalDoc` in `fields/hooks/beforeValidate/promise.js`. So an update that
writes only a playback id arrives carrying the status the row already had,
`from === to`, and `canTransition` allows it by design (it must: every
ordinary edit re-submits the status).

Measured rather than argued — a cancelled sponsorship, updated with nothing
but a playback id:

```
### outcome: ACCEPTED — the hook did not refuse
```

**What follows is general.** The transition table protects *transitions*. It
does not protect a row from being written to while it sits in a state where
writing is wrong. Any guard of the form "this must not happen to a cancelled
/ rejected / expired row" has to be written where the write is made, and is
the only thing standing there.

`rejected` is the sharpest case, and shows why "which statuses are dead" is
not safe to reason about casually: `lib/sponsorshipStatus.ts` allows
`rejected -> pending_resubmission`, so a composed video attached to a
rejected sponsorship goes live the moment the sponsor's re-edit is approved.

`endpoints/render.ts` therefore carries `STATUSES_AWAITING_A_COMPOSITION`
and pins it two ways: a test that performs the write the handler declines to
make and watches Payload accept it, and a mutation that disables the guard
and shows the refusal tests failing *while the "answers 200" test still
passes* — which is only possible because no hook raised anything.

## A signed URL protects nothing when the asset is public

Stage 6 Task 4. The spec asks for `GET /api/mux/source/:id` to issue "a
short-lived Mux source URL to the render container, behind a service token",
and Stage 6 made that exit criterion 5. The endpoint exists, the token is
checked in constant time, the URL is signed and verifiably short-lived — and
**Mux will serve the same video to anyone who asks without it.**

Mux enforces a playback token only on an asset whose `playback_policy` is
`signed`. Every asset in this product is `public`: the gesture pages stream
them to anonymous visitors, and `lib/mux.ts:190` creates the composed ones
`playback_policy: ["public"]` to match.

So what the endpoint actually protects is **enumeration** — which playback
ids exist, and which gesture each belongs to — not the video. That is worth
having and the endpoint keeps it. But "short-lived" is a property of the URL
and not of the access, and a reader who sees the expiry test pass will
believe otherwise.

**Whether to change it is an asset-policy decision, not a code change.**
Moving to `signed` means every public gesture page has to mint a token per
play, which is a different product. Recorded here so Stage 6's exit states
criterion 5 as half met rather than met.

The general shape is one this document has recorded before in other clothes:
**a control can be real, tested, and aimed at the wrong thing.** The test
that the URL expires is honest; the belief it invites is not.

## "The mutation landed" is not "the mutation is the mutation"

Stage 6 Task 5, and it is a flaw in the mutation-testing discipline this
whole project rests on rather than in any one test.

The harness every task here uses does the right things: it diffs the file to
confirm the edit applied, runs the whole file, parses the runner's own
`Tests` line rather than an exit code, and byte-compares after restoring.
All of that verifies that *something* changed. None of it verifies that what
changed is what the mutation was supposed to be.

The case: the mutation was "swap the restore and the delete", which is the
ordering Review Focus 5 exists to protect. The first spelling *added* a
deletion pass before the restore instead of moving the existing one — so the
happy path still deleted after restoring, and all thirty tests passed. Read
as written, that says the ordering is unguarded. Re-spelled as a true swap,
it fails six tests including the happy path.

**A SURVIVED verdict on a safety property is a claim about the tests, and it
deserves the same suspicion as a passing test.** Before recording one, read
the mutated code and ask whether it expresses the defect named — not whether
the bytes differ. The failure mode is quiet: it reports a guard as missing
when the guard is fine, which is the direction that wastes a day, and the
opposite spelling would have reported a real gap as covered.

## Restoring a video that was never moved

Same task, and a bug the plan would have caused if followed literally.

Stage 6's Review Focus 5 says expiry "restores the gesture's original video
**and** deletes the sponsored asset". That is true of the shipped Convex
product: `packages/convex/convex/sponsorships.ts` overwrites
`gestures.playbackId` on approval and writes `originalVideoPlaybackId` back
over it on expiry. There, the gesture row is the pointer.

**`apps/site` never writes `gestures.playbackId` at all.** Verified: no
writer exists, and the detail page composes at read time —
`overlay?.sponsoredVideoPlaybackId ?? gesture.playbackId`. The composite
lives on the sponsorship and is selected by `fetchGestureOverlay`'s
active-and-in-term filter.

So there is nothing to put back, and writing the checkout-time
`originalVideoPlaybackId` onto the gesture would be a no-op wherever the two
agree — and **wherever they do not, because an admin replaced the gesture's
video during the term, it would silently revert that admin's newer video to
a snapshot taken at checkout.** The restore is the status move to `expired`,
and nothing else.

The lesson generalises past this stage: **a requirement inherited from the
system being replaced can describe its data model rather than the
behaviour.** Stage 9's import has the same exposure, since it reads the old
model directly.

## An omitted access rule is not a closed door — it is "any signed-in user"

Stage 7 Task 2, found by strengthening a test that had been passing
vacuously, and it had been true of two shipped collections since Stage 5.

`collections/Claims.ts` (and `WebhookDeliveries` and `RenderCompletions`
before it) writes an `access` block naming `create`, `update` and `delete`.
Deleting those three does **not** leave the collection closed. Payload falls
back to `defaultAccess`, which is exactly:

```js
export const defaultAccess = ({ req: { user } }) => Boolean(user)
```

**Any signed-in account.** For a claims table that is not a tidiness question: a
claim row is a *receipt* saying "this render has already been uploaded", and
the render callback honours it by doing nothing. So any account that could
sign up could have forged one and made a real render silently disappear.

The mutation survived at first because the test only posted **anonymously**,
which `defaultAccess` refuses anyway — so the guard looked proven while
testing nothing beyond Payload's own default. It bites once the test tries
three callers: anonymous, a signed-in non-admin, and an admin.

Two things follow.

**An access test needs a signed-in non-admin.** Anonymous-only is the shape
that passes against a collection with no rules at all. The same applies to
`read`: neither replaced collection ever tested its own `read: isAdmin`, so
that rule had never been proven either.

**This is the "assert presence, not absence" rule wearing different
clothes.** Asserting that the wrong caller is refused proves nothing unless
some caller is admitted, and unless the refused caller is one the *fallback*
would have admitted.

## A lease and a receipt cannot share an expiry policy

Same task, and the most dangerous line in a table that now serves four
consumers.

`claims` holds two kinds of row that look identical:

- a **lease** — "this job runner is working" — which **must lapse**, or one
  crashed worker ends all scheduled work for ever;
- a **receipt** — "this Mollie payment / this render job has been handled" —
  which must **never** lapse, because AWS Lambda and Mollie both deliver at
  least once, and an expired receipt lets a retried callback create a second
  Mux asset. That is a bill every month, for ever, which is why
  `RenderCompletions` was built in the first place.

So `expiresAt` is nullable and the choice belongs to the consumer, not the
table. Both mistakes are silent and they fail in opposite directions: a
receipt given a TTL duplicates paid work, a lease given none stops the
scheduler after a single crash.

The sweep that clears lapsed leases is written so neither can be caught by
accident — the `expiresAt` comparison lives in the delete's own query, and
no comparison against NULL is ever true.

## Payload's `defaultAccess` fallback produced two vulnerabilities in one stage

Stage 7. The first was Task 2's: an omitted `create`/`update`/`delete` on a
collection falls back to `Boolean(user)`. The second is the same mechanism a
layer up, and it is worse, because **nothing in this repository asked for the
door that opened.**

Registering the first job task flips `config.jobs.enabled`, and Payload then
mounts its own `GET /api/payload-jobs/run` on the jobs collection. Its gate,
verified at the source (`payload/dist/queues/endpoints/run.js`):

```js
const accessFn = jobsConfig.access?.run ?? defaultAccess;
```

So **any signed-in account could run the whole queue** — sending mail,
sweeping payments, expiring sponsorships — completely bypassing
`endpoints/jobs.ts`, its secret, its constant-time comparison and its run
lease. Those protect a *different* URL. The collection's own CRUD access is
`() => false` for all four operations, which makes the endpoint easy to miss:
the collection looks sealed.

`jobs.access.run` is now `() => false`, tested against anonymous, a
signed-in non-admin and an admin.

**The general rule this stage earned twice: in Payload, a missing access rule
is an open one, and enabling a feature can mount an endpoint you did not
write.** After turning any Payload feature on, list what it added and gate
each thing explicitly. "I did not create that route" is not a reason to
believe it is closed.

## A credential cannot travel in a job's input

Same stage, and it changed what "queue it instead of logging it" could mean.

Payload logs the **whole job row, `input` included**, when a task fails
(`queues/errors/handleTaskError.js`), and a retry policy makes failure
ordinary rather than exceptional. So queueing a message with the re-edit
token or the email-change link in its payload would have written those
capability URLs into the logs on the first transient refusal — replacing a
deliberate, single, documented log line with an undeliberate recurring one.

Both tokens are therefore resolved **at send time**: the confirmation token
is minted by the send, and the re-edit token is read back out of the row with
`showHiddenFields: true`.

One consequence had to be chased down rather than assumed: because the
confirmation token is now minted at send time, `POST /account/email` has to
clear `pendingEmailToken` when a new change is started, or a link sitting in
the **old** address's mailbox would confirm the **new** one.

**A job's input is not private storage. Treat it as a log line that has not
happened yet.**

## A count asserted against a database nobody clears is a count of test runs

Stage 7 Task 5, and the third finding in this project about the *method*
rather than the code. The other two are above: "the mutation landed is not
the mutation is the mutation", and a SURVIVED verdict deserving the same
suspicion as a passing test.

`.wrangler/state/vitest` is persisted and never cleared — a deliberate
property, recorded in nine test files, that keeps the suite honest about
non-empty databases. The consequence nobody had written down: **an assertion
of the form "the queue has one row" is an assertion about how many times the
suite has been run.**

It surfaced during a mutation sweep as
`expected [ …(12) ] to have a length of 1` — in a test that had passed four
times. The mutation was innocent; the test was wrong, and had been wrong
since it was written. Read the other way it is worse: such a test passes on
a clean checkout, passes in CI, and starts failing on a developer's machine
weeks later for reasons that have nothing to do with their change.

**Scope every count to the row under test**, and have an integration file
delete its own leftovers before seeding rather than trusting the state it
inherits.

## Turning a framework feature on can require schema nobody mentions

Same task. Adding a `schedule` to a Payload task is one line, and it needs
three pieces of storage that fail silently when missing:

- **`payload-jobs-stats`**, a global. `handleSchedules` reads
  `lastScheduledRun` from it via `db.findGlobal` — verified at the source —
  and throws without it, **after** the run lease has been taken. The first
  tick would be the last.
- **`payload_jobs.meta`**, where `{ scheduled: true }` lives and which
  Payload's own `defaultBeforeSchedule` counts on. Without it an hourly cron
  queues a daily job twenty-four times a day.
- The column the starvation fix writes (`renders.settledAt`).

This is the same shape as the `defaultAccess` findings above and belongs
beside them: **enabling a Payload feature can add an endpoint you did not
write and require storage you were not told about.** After turning one on,
enumerate what it added — routes, access rules and tables — and gate or
migrate each.

## An index cannot fix starvation; only a column the sweep writes can

Stage 6 recorded that the readiness sweep could starve on a backlog larger
than one page, and said to "key it off an index". That instruction was
wrong, and Stage 7 had to find out why: indexing the existing candidate
column changes nothing, because **the candidate set is still every healthy
live asset ever made.** An index makes the scan faster, not smaller.

What ends starvation is a column the sweep *writes* — `renders.settledAt`,
stamped only when Mux reports `ready`, which is terminal. Settled rows leave
the candidate set for ever.

The same defect was found next door and it had money attached: the orphan
sweep read one page of every render holding an asset and filtered for
`sponsorship === null` **in memory**, so with more live assets than fit a
page, an orphan behind them was never in the page at all. An orphaned Mux
asset is a bill every month for a video nothing points at. It now has its own
query on the indexed column.

**"Filter in memory after a bounded read" is a starvation bug wearing the
clothes of a pagination detail.**

### A distinctness assertion cannot detect a missing member

Stage 8 Task 3's guard on the cross-platform prop vocabulary asserted that
each of the five `Button` variant names renders a *distinct* class string.
The mandated mutation — delete `ghost` from the native `buttonVariants` — was
supposed to fail it. All twenty-two tests passed with a variant missing.

`class-variance-authority` 0.7.1 resolves `variants[variant][variantKey]`,
and for a name it does not recognise that is `undefined`, which `cx()`
silently drops. The dimension's classes vanish and the base classes remain —
so an unimplemented variant renders **one string, the same string whichever
name produced it**. Five names therefore still yield five distinct outputs
when one of them is not implemented: four real ones plus the fallback. The
set-size check can never see the gap.

The plan's own self-check missed it for the same reason: it appended **one**
unknown name and required a collision, and one fallback value collides with
nothing. Two unknown names would have collided with each other and exposed
it.

The fix is to compare every variant against an explicit *unimplemented*
control render, so "fell through to the fallback" is distinguishable from
"has its own classes". Its known limit: a variant whose own classes are
legitimately the empty string would equal the control and slip through. None
exists in either library today.

**Distinctness over a set is not coverage of the set.** Where "every member
is implemented" is the property, assert against a known-absent member, not
against the other members. The same shape recurs wherever a lookup has a
silent fallback — a translation table returning the key, a router returning
a catch-all, a colour map returning a default.

### A tie-breaker cannot be tested by fixtures that never tie

`lib/gestureQuery.ts` sorts `["name", "id"]`, and its comment explains why:
`name` is localized and optional, so in a locale nothing is translated into
every row sorts equal, and an unstable order across two requests shows one
gesture twice and another never. Stage 8 Task 10 was told to prove that by
deleting `"id"` and watching the stability tests fail. **All 1488 site tests
stayed green.**

Three readings, each wrong until the last. The implementer concluded the
adapter "self-heals" with a `-id` fallback, so `id` was decoration. The
controller said removing `id` yields `["name", "-createdAt"]` — right about
the result, wrong about the cause. The reviewer read
`@payloadcms/drizzle`'s `buildOrderBy`: its gate checks whether the sort
mentions **`createdAt`**, not `id`, so `-createdAt` is appended either way.
Production orders by `name, id, createdAt DESC`; the mutation removes the
only *unique* key and leaves `name, createdAt DESC`, and `createdAt` is not
unique — two rows sharing a name and a creation millisecond tie, order
undefined.

Underneath all three: **every seeded gesture in both fixtures gets a unique
zero-padded name.** No two rows ever share one. Ordering by `name` alone is
already total, so the tie the sort exists to break never occurs and the
mutation could not have been observed whatever the adapter did.

The guard is real and the tests cannot see it. Fixing it means seeding rows
that collide on `name` *and* on `createdAt` — the case the third key exists
for. Until then the sort is protected by a comment, not by a test.

**Where a guard exists for a collision, the fixture has to collide.** The
same shape hides wherever test data is generated to be conveniently distinct:
unique names defeat a sort tie-breaker, unique timestamps defeat an ordering
fallback, unique ids defeat a dedupe.


### An `entry` glob over a source tree turns knip off for that workspace

`knip` does not report unused exports *from entry files* — an entry is a
package's public surface, and flagging its exports would flag every library.
That default is correct, and it is why `packages/ui-native` could ship
`Button` through `src/index.ts` in Stage 8 Task 3 with nothing importing it
and still keep CI green, though the plan had provisioned an `ignoreIssues`
exemption for exactly that commit. The exemption was never needed and the
reason was never noticed.

The same mechanism was load-bearing in the other direction three tasks later.
`apps/mobile` was created with `"entry": ["app/**/*.{ts,tsx}", "src/**/*.ts",
…]`. Every file under `src/` was therefore an entry, so **knip was
structurally unable to report an unused export anywhere in that app** and had
reported none since the app existed. Narrowing the entry to the Expo Router
route directory and the two config files surfaced ten exported types nothing
imports, in four files, on the first run.

This matters more than ten types. `AGENTS.md` names knip as the check that
catches people out — "an exported symbol nothing imports fails the build, so a
helper type exported 'for later' turns the pipeline red on a commit that
otherwise passes every local check". A workspace whose entry glob covers its
whole source tree has opted out of that, silently, while still appearing in
the config as a configured workspace.

**A tool's silence is only evidence if the tool could have spoken.** The
reviewable form of "this export is deliberate" is a named `ignoreIssues`
entry, which a reader can see and challenge. An entry glob is not that; it is
an exemption with no name, no scope and no expiry, and it reads like
configuration rather than like a decision.

### A session token is a valid exchange code unless a claim says it is not

Stage 8 Task 9 hands a native app a single-use code at a custom-scheme
redirect and lets it trade the code for a session over HTTPS, because a
session token in a `smog://` URL is readable from the browser history, the OS
log and any app that claims the same scheme. The exchange endpoint therefore
has to refuse *anything that is not that code* — and the thing most likely to
be presented is a real session token, which is signed with the same secret by
the same issuer.

Nothing distinguishes them but an explicit `purpose` claim. The endpoint pins
HS256, checks `purpose`, and burns the `jti` through the `Claims` unique index
so a stolen code cannot be replayed.

The sharper half is how nearly it went unproven. The test that was supposed to
show a session token is not a valid exchange code was built on a token from
`payload.login()` — and `getFieldsToSign` signs `{id, collection, email, sid?}`
with **no `sub`**, so the fixture would have been refused whether the `purpose`
check existed or not. It was found by running the mutation and watching the
test stay green, then rebuilt on a real `createOAuthSession` token, with the
password-login case kept and relabelled as explicitly *not* mutation-sensitive
rather than left to read as coverage.

**Two tokens that are refused for different reasons look identical from the
test's side.** When a guard exists to tell two similar things apart, the
fixture has to be the thing that would pass without it.

### A style gate that only runs under the test runner proves only the test runner

Stage 8 Task 1 was a gate: fifteen components were about to be written in
NativeWind, and the stage was to change shape immediately if a `className`
did not become a real style. The gate passed, and it proved less than it
looked like it proved. `jest.setup.ts` compiles `global.css` with postcss and
calls `setupAllComponents()` by hand, because `react-native-css-interop`
short-circuits under `NODE_ENV=test` and Jest has no bundler. The path that
produced the passing style was **not** the path a phone runs.

The real proof came six tasks later and it is worth copying. There was no
simulator, emulator or browser in the environment, and no screenshot was
claimed. Instead: a real `expo export`, and a direct read of the CSS Metro
compiled — 11,854 bytes containing `#00805f` and `border-style:dashed` under
the three content globs, and 6,781 bytes with both gone when the third glob
was removed. **A substitution that reproduces the failure beats an
unfalsifiable claim of success**, and the reviewer re-ran both exports and
matched them byte for byte.

Generalised: when a test harness has to reconstruct by hand what a bundler
does in production, the test proves the reconstruction. The question to ask of
any such gate is which of its steps the shipped pipeline also performs, and
the answer belongs next to the gate.

### The keychain outlives the app, so a reinstall resumes a deleted session

`expo-secure-store` writes to the iOS keychain, which survives deleting the
app. A session token stored there is therefore still present on a fresh
install — including one whose account has since been deleted, which answers
401 for ever unless the app notices.

Stage 8's fix is a marker in `AsyncStorage`, which does *not* survive: a
keychain token with no marker beside it belongs to a previous installation and
is cleared before it is used. The mechanism is cheap and the failure it
prevents is not — a user whose only recovery is deleting an app they have
already deleted.

It is also, as of Stage 8, **unverified against a real keychain**: every test
of it runs against a mock, and a mock cannot show what the keychain does
across an uninstall. Stage 10 ships this app to a store; that is the first
point at which the guarantee is testable, and it should be tested there rather
than assumed to have been tested here.


## Risks

| Risk | Mitigation |
|---|---|
| D1 adapter immaturity | Schema avoids D1-specific features; Postgres via Hyperdrive stays a config-level escape hatch |
| **Worker size limit reached mid-migration** | **Live risk.** 64.5% consumed at Stage 0. CI enforces a budget; re-measure every stage and justify each delta. Measured: the Payload + Next runtime alone is 57.9% of budget before any product code. `drizzle-kit` was tested and is not uploaded. The only identified lever is 602 KiB of unused `ImageResponse` assets — there is no large easy win. |
| Lambda cold starts on first render | Renders are already asynchronous with polling; sponsor UX unchanged |
| Users lost at the auth cutover | Migration creates accounts and sends a set-password mail; favorites and lists survive keyed by email |
| Mollie webhook replay during cutover | Endpoint is idempotent; old and new stacks both reconcile against Mollie as the source of truth |
| Translation backlog | `en` and `fr` fall back to `nl`; no empty pages ship |

## Decisions taken 2026-09-22, after Stage 8.5 landed

These were put to the user and answered; they govern the remaining stages.

**Stage order changes.** Mobile consent and analytics move *before* Stage 9, as
**Stage 8.6**. `apps/mobile` today has no analytics and no consent prompt at all,
while `apps/native` — which Stage 10 deletes — has both. Cutting over without it
would ship a native app that either collects nothing or, worse, gains collection
later without a prompt. Numbered rather than inserted, for the same reason 8.5 was.

**Stage 9 imports no consent at all.** Every user is re-asked on the new site.
The old stacks store a boolean; the new one stores a tri-state where `null` means
"never asked", and neither old store can express that. Mapping an old `false` to
`denied` would record an explicit refusal for people who were never asked, in the
one table that exists to be evidence and that nothing can delete. Importing only
the `true` values was rejected too: a grant given under the old policy wording is
not a grant under the new one.

**Cutover is big-bang with a maintenance window.** Writes freeze, the migration
runs once, verification runs, DNS switches. Chosen over dual-write because two
writers need a conflict rule per collection and there are no transactions on the
D1 side to lean on — and because a single source of truth at any instant is what
makes the dry run a genuine rehearsal rather than an approximation.

**Stage 9 waits for a real Convex export** rather than being built against the
schema. `packages/convex/convex/schema.ts` is the authority on shape, but this
project has repeatedly found the code and the schema disagreeing, and a migration
is the worst place to discover it. The export will contain real user data: it is
never printed, quoted, or logged — only aggregates (counts, distributions,
null-rates, integrity checks) leave the sandbox.

**Mobile analytics goes direct to OpenPanel from the device**, as `apps/native`
does, rather than relaying through `apps/site`. Recorded with its consequence
stated: anything `EXPO_PUBLIC_*` ships inside the bundle, so the native client
secret is extractable from any installed copy of the app. The existing mitigation
stands and must be kept — `.env.example` already provisions a *separate
least-privileged* native client, distinct from the web pair, and the web stack
continues to relay so its secret stays server-side.

**The mobile consent prompt is non-blocking**, matching the web banner rather
than `apps/native`'s full-screen modal. Same reasoning as Ruling 11's: a prompt
standing between a person and the privacy policy it links to is the pattern
regulators single out.

**Credentials are not tracked per stage.** One consolidated deployment checklist,
each entry naming the exact command that sets it and what breaks without it.

**The privacy policy gets EN and FR drafts**, visibly marked unreviewed and
pending legal sign-off, rather than staying Dutch-only while the banner is
trilingual. Professional translation and legal review remain launch blockers on
the checklist.

**The favourites-listing analytics emitter stays out.** `apps/web` never tracked
that interaction, so adding it would be new collection rather than a migration.

## What the production export actually contains (read 2026-09-22)

Measured from the Convex production export, aggregates only — no row was
printed, quoted or logged. The export lives outside the repository and is never
committed.

| table | rows | Stage 9 |
|---|---|---|
| `categories` | 27 | import |
| `gestures` | 496 | import into the `nl` locale |
| `user_favorites` | 5 | drop — see below |
| `users` | 0 | nothing to migrate |
| `sponsorships` | 0 | nothing to migrate |
| `user_consents` | 0 | nothing to migrate (and the decision is to import none regardless) |
| `adminLogs` | 0 | nothing to migrate |
| `gesture_lists` | absent | never deployed to production |

**Stage 9 is therefore two tables, not seven.** The spec anticipated migrating
accounts, sponsorships and consent; production holds none of them. Every person
signs up fresh on the new site, which removes the password-hash and WorkOS-mapping
questions this section used to anticipate.

**`packages/convex/convex/schema.ts` is ahead of production.** It defines
`gesture_lists`, but that table is absent from the export entirely — not even
present as an empty table, the way `users` and `sponsorships` are. Confirmed by
the user: production was never deployed with it. The schema file is not a
reliable picture of what production holds, which is exactly why Stage 9 waited
for an export rather than building against the schema.

**The old stack's GDPR deletion does not cascade to `user_favorites`.** All five
favourites reference `v.id("users")` values — Convex-format ids, not WorkOS ids —
for users who no longer exist. `gdpr.ts` and `gdprCron.ts` both delete, so the
likeliest cause is a deletion that removed the user and left their favourites.
They are dropped, not migrated: they cannot be attached to anyone, and the person
they belonged to asked to be deleted, so carrying them forward would partly undo
that request. The migration's verification report states the count so the drop
is visible rather than silent.

**Gestures are single-language in the source.** `name` and `info` are plain
strings; the new `Gestures` collection is localized. They import into `nl`, the
default locale, and `en`/`fr` fall back to Dutch — behaviour
`Gestures.int.test.ts` already proves.

**Source shapes, for the Stage 9 planner** — keys and JSON types, present on
every row unless noted:

- `categories`: `_id` string, `_creationTime` number, `name` string, `isActive` bool
- `gestures`: `_id` string, `_creationTime` number, `name` string, `info` string,
  `concept` array, `categoryIds` array, `playbackId` string, `lastUpdated`
  number, `isActive` bool
- `user_favorites`: `_id`, `_creationTime`, `createdAt` number, `gestureId`
  string, `userId` string
