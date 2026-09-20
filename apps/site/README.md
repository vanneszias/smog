# apps/site

Payload CMS 3 on Next.js 16, deployed to Cloudflare Workers via OpenNext.

This app will eventually serve the Payload admin panel, the public API and the
redesigned public website from a single Worker. Today it holds the template's
two collections and nothing else — see
[the migration spec](../../docs/superpowers/specs/2026-09-19-payload-migration-design.md).

While the migration runs, the existing stack (`apps/web`, `apps/native`,
`apps/server`, `apps/remotion`) keeps serving production untouched.

## Stack

| Layer | |
|---|---|
| App | Next.js 16.3.3, React 19.2, Payload 3.89.0 |
| Worker | `@opennextjs/cloudflare`, `wrangler` |
| Database | Cloudflare D1 via `@payloadcms/db-d1-sqlite` |
| Files | Cloudflare R2 via `@payloadcms/storage-r2` |

All Payload packages sit on exactly `3.89.0`. Upgrade them together or not at all.

## Local development

```bash
bun -F site dev          # http://localhost:3003
```

Port 3003 keeps out of the way of web (3001), server (3000) and Remotion (3002),
which keep running during the parallel run.

You need `PAYLOAD_SECRET` in your environment for anything that boots Payload.
Generate one with `openssl rand -hex 32`. Set `CLOUDFLARE_ENV=staging` too —
bindings live only in named environments, so nothing resolves without it.

## Commands

```bash
bun -F site test              # Vitest
bun -F site check-types       # tsc --noEmit
bun -F site generate:types    # Cloudflare env types + Payload types
bun -F site generate:importmap
bun -F site check-bundle-size # measure the Worker against its budget
```

`src/payload-types.ts` is **committed**. Regenerate it whenever you change a
collection — CI fails on drift.

`src/app/(payload)/admin/importMap.js` is **committed** too, and needs
regenerating whenever you add or remove a plugin that ships client
components. A stale one is invisible to typecheck, the test suite and a
full build — it only breaks the admin panel at runtime — so CI guards it
the same way. Run `bun -F site generate:importmap && bun check`; the
generator's raw output is reformatted by Biome, and the pair round-trips
byte-identically.

Be aware that **running the test suite rewrites that file**. Outside
production, `getPayload` regenerates the types from whatever the config
currently says, so a suite run is enough to overwrite a committed change — and
if you were mid-experiment with a collection, it silently writes the
experiment's shape to disk. Check `git status` after a run that touched a
collection, before concluding the types are what you committed.

## Seeding a local database

```bash
CLOUDFLARE_ENV=staging PAYLOAD_SECRET=<anything> bun -F site seed
```

Fills the local emulated D1 with the fixtures in `src/seed/fixtures.ts`: five
categories, 33 gestures across them (one deactivated, one filed under two
categories, one with a deliberately long name), English and French
translations on some but deliberately not all of them, plus an admin and a
regular user. Enough to exercise pagination, locale fallback and
`publicReadActive` without hand-typing anything into the admin panel.

**It refuses to run anywhere but locally.** `src/seed/guard.ts` demands
`CLOUDFLARE_ENV=staging` exactly — no trimming, no case folding — and refuses
any `NODE_ENV` other than unset, `development` or `test`, because
`NODE_ENV=production` is what makes `payload.config.ts` resolve *remote*
Cloudflare bindings. The check runs before `payload.config` is imported, which
is why that import is dynamic: a static one is hoisted and would resolve the
bindings first. There is no flag to override it.

**It is idempotent**, keyed on the Dutch name of a category or gesture and on
a user's email: re-running updates in place rather than duplicating, and
content you created by hand is left alone. It never deletes anything — a
"wipe first" seed would fail halfway on any gesture a sponsorship points at
(`blockDeleteWhenSponsored`) and leave the database worse than it found it.

Sign-in credentials are printed at the end and can be overridden with
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_EMAIL` and
`SEED_USER_PASSWORD`.

If the first run dies on `index payload_locked_documents_rels_order_idx
already exists`, the local D1 predates a collection that has since been added:
`rm -rf apps/site/.wrangler/state/v3` and run it again. This is the same
staleness described below for the test state, in the directory `bun -F site
dev` uses.

### An intermittent `seed.int.test.ts` failure under the full suite

Seen three times by three different people, roughly one run in four or five,
and **not reproducible on demand**:

- `bun run test` reports `7 successful, 8 total` with `FAIL src/seed/seed.int.test.ts`.
- `bun -F site test seed.int` in isolation passes all 14.
- Three consecutive full runs afterwards were green.

It has never been seen in CI across 30+ runs. The likely cause is the same D1
contention documented above — vitest runs many workers against one persisted
directory, and the seed test writes more than most.

**Fourth sighting, Stage 4 Task 4.** Twice in 31 consecutive whole-suite runs
of a mutation sweep, against a persistence directory that had grown past D1's
parameter cap (the capture above came out of the same sweep). The error text
is still not captured, but the *shape* now is, from the JSON reporter:

```
833 executed, 1 failed, 14 pending
FILE ERRORED with no failed assertion: src/seed/seed.int.test.ts
```

Fourteen tests reported **pending**, the file marked failed, and **no failed
assertion** — which is the signature of a throw in `beforeAll`, exactly the
"reported as skipped rather than failed" hazard listed above. That narrows it
a long way: the hook is the only suspect, it takes ~27s of its own 180s
budget, and it runs ~200 writes against a directory that by then held 140
categories.

**If you hit it, capture the failure before re-running.** A summary line will
not do it, because the interesting text is the *file's* `message` and not an
assertion's. Run the suite through the JSON reporter and print that field:

```bash
cd apps/site && bunx vitest run --reporter=json --outputFile=/tmp/run.json
python3 -c "import json;[print(f['name'],f.get('message')) for f in json.load(open('/tmp/run.json'))['testResults'] if f['status']=='failed']"
```

"It passed the second time" is how this stayed unexplained through three
encounters.

### If the test suite suddenly fails on a branch you just pulled

```bash
rm -rf apps/site/.wrangler/state/vitest
```

The suite runs against a **persisted** local D1 directory that is never cleared
between runs. Two consequences, both of which have already cost someone an
afternoon:

- **Adding a collection invalidates the existing directory.** Payload's
  `pushDevSchema` rebuilds `payload_locked_documents_rels` and trips over
  `index payload_locked_documents_rels_order_idx already exists`. This is a
  local-push-only problem — the committed migrations use `ALTER TABLE ... ADD`,
  so deployed environments are unaffected — but it makes a perfectly good
  branch look broken on first run.
- **Adding a `unique` constraint fails over rows that already violate it.**
  Same cause, different symptom: `CREATE UNIQUE INDEX ... UNIQUE constraint
  failed` during setup, because earlier runs left duplicate values behind from
  back when the column was merely indexed. Clearing the directory is again the
  whole fix.
- **Any fixture value on a `unique` column must be unique per run**, or a later
  run collides with an earlier run's leftover row. This fails in `beforeAll`,
  which means Vitest reports the file's tests as *skipped* rather than failed —
  a green-looking run that tested nothing. Use `crypto.randomUUID()`;
  `Date.now()` is not enough, since two files can start in the same
  millisecond.
- **An unbounded read eventually dies on D1's bound-parameter cap.** A
  `payload.find` with `limit: 0` on a *localized* collection issues a second
  query that binds one parameter per row to fetch the translations, and D1
  caps how many a statement may bind. `fetchCategoryOptions` reads every
  category that way, so after enough runs have piled categories into this
  directory the gestures list page's own query starts failing. Clearing the
  directory fixes the local symptom; the underlying limit is real and is why
  anything that turns a caller-supplied list into an `IN (...)` —
  `fetchGesturesByIds`, for one — caps its input.

  **Two details here were wrong until Stage 4 Task 4 captured the error.** A
  31-mutation sweep grew the directory past the cap and the failure was
  caught in full:

  ```
  FILE: src/lib/gestureQuery.int.test.ts
  TEST: fetchCategoryOptions offers an active category as a filter
  Error: Failed query: select "id", "is_active", … (select coalesce(
    json_group_array(json_array("name", "_locale")), json_array()) as "data"
    from "categories_locales" … ) as "_locales" from "categories"
    where "categories"."id" in (?, ?, … )
  params: 1,2,3,4,5,7,…,140
      at find (@payloadcms/drizzle/dist/find/findMany.js:137:21)
      at fetchCategoryOptions (apps/site/src/lib/gestureQuery.ts:220:18)
  ```

  - the message is **not** `D1_ERROR: too many SQL variables`. It is
    drizzle's `Failed query:` with the whole statement and its parameter
    list, which is why grepping for the old string finds nothing.
  - it broke at **132 bound parameters**, not "roughly 180 rows". D1
    documents a maximum of 100 per statement, so the earlier figure was a
    recollection rather than a measurement. Treat 100 as the ceiling.

  It surfaces in `gestureQuery.int.test.ts`, which is not the file that put
  the rows there — a heavy sweep of any other file is enough.

Never run two suites or builds concurrently against this directory.

## robots.txt and sitemap.xml are not in `app/`

Both are generated by **Payload endpoints** in `src/endpoints/crawler.ts` and
served at their conventional URLs through two rewrites in `next.config.ts`.
They are not `app/robots.ts` and `app/sitemap.ts`, and the reason is the
bundle: a Next metadata route is its own entry and re-bundles the
Payload/D1/drizzle graph into it, where the REST route
(`app/(payload)/api/[...slug]/route.ts`) already carries that graph. Measured
against the same commit, the naive `sitemap.ts` cost **+523.65 KiB gzipped**
and the endpoint cost **+5.06 KiB**. Full table in
[the Stage 0 findings](../../docs/superpowers/specs/2026-09-19-stage-0-findings.md).

Two consequences worth knowing before touching either file:

- **Anything imported from `payload.config.ts` must take its Payload instance
  as an argument**, not call `getPayloadClient()`. The config dynamically
  imports itself through that helper, and the cycle cost 22.86 KiB of
  duplicated graph before it was removed.
- **The URLs are only right if the rewrites are.** `tests/e2e/crawler.spec.ts`
  fetches `/robots.txt` and `/sitemap.xml` over HTTP for exactly that reason;
  deleting a rewrite fails it by name.

If a future change does move them back into `app/`, note that Next 16 ignores
`app/(group)/robots.ts` **silently** — no warning, no route, a 404 at runtime,
because its matcher is anchored at the app root. `sitemap.ts` in a route group
does work. Check the build's route table, not the file's existence.

## Deploying

Always schema first, then code:

```bash
CLOUDFLARE_ENV=staging bun -F site deploy
```

`deploy` runs `deploy:database` (migrations) then `deploy:app` (build and
upload). Both refuse to run unless `CLOUDFLARE_ENV` is exactly `staging` or
`production` — there is no default, so a deploy cannot guess which environment
it is touching.

Staging: `https://smog-site-staging.vanneszias.workers.dev`

`PAYLOAD_SECRET` is a Cloudflare secret, set with
`wrangler secret put PAYLOAD_SECRET --env=<env>`. It is deliberately absent at
build time: `next build` signs no session and issues no query, so config
collection tolerates its absence while the runtime path does not.

## Bundle budget

`check-bundle-size` measures an **existing** build; it does not produce one.
Run `bun -F site build:app` first (plain `build` is `next build` and stops
short of the Worker), or wrangler fails with "The entry-point file at
`.open-next/worker.js` was not found."

Leaving `.open-next` in place afterwards is normally fine — the tsconfig
excludes it, and `check-types` is clean with a build present. **One sequence
breaks that**, and it is worth knowing because the error points at generated
code rather than at what you did:

```
.open-next/server-functions/.../handler.mjs: error TS1111: Private field '#d' …
```

`wrangler types` writes `mainModule: typeof import("./.open-next/worker")`
into `cloudflare-env.d.ts` **when a build happens to exist at that moment**.
`cloudflare-env.d.ts` is committed and is not excluded, and a tsconfig
`exclude` does not stop a file being pulled into the program by an import from
an included file — so the generated handler gets typechecked and fails.

So: run `bun -F site generate:types` (or `generate:types:cloudflare`) with no
build present. `rm -rf apps/site/.open-next` first, or regenerate before you
build.

A Stage 3 Task 9 note claimed the line is emitted either way and cannot be
removed. That is wrong; both directions were re-tested afterwards on wrangler
4.116, and the results are worth keeping because the claim is easy to arrive
at from a half-finished state:

- **No build present, line absent → stays absent.** Regenerating produces a
  file byte-identical to the committed one, with zero `.open-next`
  references, and `check-types` exits 0.
- **No build present, line injected → removed.** Regenerating drops it,
  1 reference to 0.

So the rule stands: **regenerate with no build present.** `rm -rf
apps/site/.open-next` first, or regenerate before you build. If a committed
`cloudflare-env.d.ts` already carries the line, regenerating without a build
is also how you get rid of it.

Deleting `.open-next` before typechecking works too, and is a good habit for
leaving the tree in the state the next session wants — but it treats the
symptom. CI never sees any of this: `release:check` runs `next build`, which
writes `.next` and not `.open-next`, and the typecheck runs before it anyway.


The Worker has a **10 MiB gzipped** limit on the Workers Paid plan, and Stage 0
already uses **6.45 MiB of it** with two collections and no public site.

Measure before you add anything large:

```bash
CLOUDFLARE_ENV=staging bun -F site check-bundle-size
```

This parses wrangler's `Total Upload` line. Do not gzip `.open-next/worker.js`
and read that — it is a ~2 KB entry stub and reports a number three orders of
magnitude too small.

## A warning about the upstream template

This app was scaffolded from Payload's official `with-cloudflare-d1` template,
which does **not** type-check or build against the versions it pins. Four
confirmed defects, all fixed here:

| Template said | Reality in 3.89.0 |
|---|---|
| `storage: [r2Storage(...)]` | no such `Config` key — belongs in `plugins` |
| `generatePayloadViewport` | does not exist in `@payloadcms/next` |
| import map → `@payloadcms/ui/rsc` | generator emits `@payloadcms/next/rsc` |
| `"build": "payload build"` | no such command — it is `next build` |

The first silently dropped R2 storage, so uploads never worked. The last would
have failed every deploy. Verify template code against the installed packages
rather than trusting it.
