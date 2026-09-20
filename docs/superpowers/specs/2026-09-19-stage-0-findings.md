# Stage 0 Findings

> Recorded 2026-09-19. Companion to
> [`2026-09-19-payload-migration-design.md`](./2026-09-19-payload-migration-design.md)
> and the [Stage 0 plan](../plans/2026-09-19-stage-0-foundation.md).

Three gates were declared in the spec. A plan written around an unverified
assumption is fiction, so each gate had to produce a measurement before later
stages could be planned in detail. This records what each one actually returned.

| Gate | Subject | Status |
|---|---|---|
| 1 | Remotion in a Cloudflare Container | **NOT RUN** — no Docker daemon |
| 2 | Worker bundle size | **PASS, WITH A WARNING** — 64.5% of budget already used |
| 3 | bun compatibility with Payload's CLI | **PASS** |

---

## Gate 3 — bun compatibility: PASS

**Question:** Payload documents pnpm, npm and yarn. This monorepo is bun. Do
`payload migrate`, `payload generate:types` and `payload generate:importmap`
run under it?

**Answer: yes, all of them, with no workarounds.**

Verified on **bun 1.3.11**. Note the repo's root `package.json` declares
`packageManager: bun@1.3.14` — this container ships 1.3.11, so the result is
recorded against the version actually tested. 1.3.11 is the older of the two,
which makes this the more conservative result, but it is not a test of 1.3.14.

Environment: `CLOUDFLARE_ENV=staging`, throwaway `PAYLOAD_SECRET`, no network
access to Cloudflare.

| Command | Exit | Artifact produced |
|---|---|---|
| `bun run generate:types:payload` | 0 | `src/payload-types.ts` |
| `bun run generate:importmap` | 0 | `src/app/(payload)/admin/importMap.js` |
| `bunx payload migrate:create gate_probe` | 0 | migration `.ts` + `.json` pair |
| `bunx payload migrate:status` | 0 | table listing both migrations as not-run |

`migrate:status` deserves a note: it worked **without any Cloudflare
connectivity**. `getCloudflareContextFromWrangler()` emulates D1 locally
outside production, so the plan's assumption that migration status needs a
provisioned remote database was wrong. Only an actual `migrate` against remote
D1 needs credentials.

The `gate_probe` migration was deleted after the run and `migrations/index.ts`
restored.

**Fallback not needed.** The plan's contingency — scoping pnpm to `apps/site`
alone — stays unused. No pnpm/npm/yarn lockfile exists anywhere in the repo.

### Side finding: a third instance of template/version skew

Regenerating the import map changed it semantically, not just cosmetically:

```diff
-import { CollectionCards } from "@payloadcms/ui/rsc";
+import { CollectionCards } from "@payloadcms/next/rsc";
```

Both packages export the symbol, so the vendored version was not broken at
runtime — but it is **stale relative to what Payload 3.89.0's own generator
emits**. With the types-drift guard planned for Task 4, generated output must
match the generator or CI fails forever on a diff nobody introduced. The
regenerated map is now committed.

This is the third confirmed skew between the `with-cloudflare-d1` template's
source and the versions it pins, after `storage:` vs `plugins:` and the dead
`generatePayloadViewport` import.

A **fourth** turned up during the Gate 2 build, and this one is fatal rather
than cosmetic: the template's build script is `payload build`, but
`payload@3.89.0` has **no `build` command** — its own CLI usage list confirms
it. Every deploy would have failed at the first step. Corrected to `next build`,
which is the actual build command for a Payload 3 Next.js app. The Stage 0 plan
had copied the template's version verbatim, so the plan carried the same defect.

The spec's standing warning holds, and has now earned itself four times over:
treat vendored template code as needing verification against installed
packages, not as known-good.

---

## Gate 2 — Worker bundle size: PASS, with a warning

**Question:** does Payload plus Next 16 through OpenNext fit the Workers Paid
10 MiB gzipped limit, with room for five more stages of code?

**It fits. The headroom is the problem.**

Measured with `wrangler deploy --dry-run --env=staging`, which performs the
real bundle and reports exactly what an upload would send:

| Metric | Value |
|---|---:|
| Total upload, raw | 30,623.75 KiB (29.9 MiB) |
| **Total upload, gzipped** | **6,601.12 KiB (6.45 MiB)** |
| Workers Paid limit | 10 MiB gzipped |
| **Budget consumed** | **64.5%** |
| **Headroom remaining** | **35.5%** |

The plan says to flag anything under 40% headroom as "a design-level problem
for Stages 3 through 8, not a note." This is 35.5%, so it is flagged.

**What makes it serious is what is *not* in that number yet.** The measured
build contains two collections (`Users`, `Media`), no public site, no component
library, no sponsor flow, no jobs. Still to come: seven collections and the
search plugin (Stage 1), a full web component library (Stage 2), the public
site (Stage 3), auth with social providers (Stage 4), the sponsorship wizard
and Mollie integration (Stage 5), and the jobs queue (Stage 7). Those must all
fit in the remaining 3.55 MiB gzipped.

### Where the weight is — measured, not guessed

Each uploaded artefact, gzipped:

| Artefact | gzip | Share of the 10 MiB budget |
|---|---:|---:|
| `worker.js` — Payload + Next runtime | 5,930 KiB | 57.9% |
| `resvg.wasm` — Next `ImageResponse` | 516 KiB | 5.0% |
| `Geist-Regular.ttf.bin` — `ImageResponse` | 58 KiB | 0.6% |
| `yoga.wasm` — `ImageResponse` | 28 KiB | 0.3% |
| **Total** | **6,601 KiB** | **64.5%** |

**Correction: `drizzle-kit` is not in the uploaded bundle.** An earlier version of
this document called it "roughly 7 MiB raw" and "the single largest recoverable
win". That was wrong, and it was wrong in the direction that would have wasted
Stage 3's time.

What is true: a 6.9 MiB `drizzle-kit/api.js` exists under
`.open-next/server-functions/default/node_modules/`. What does not follow is that
wrangler uploads it. It was tested directly — the file was replaced in place with
a 299-byte throwing stub and `wrangler deploy --dry-run` re-run. The result was
byte-identical: `30624.36 KiB / gzip: 6601.40 KiB`. OpenNext stages the package
on disk; nothing reachable from `worker.js` imports it, so it never ships.

Marking it in `serverExternalPackages` was also tried and changed the total by
0.28 KiB, i.e. nothing. That change was reverted rather than left in place as a
no-op with a confident comment attached.

**The one real lever is the `ImageResponse` assets: 602 KiB gzipped, 5.9% of the
budget.** They ship because `next/og` is part of the Next runtime OpenNext
includes, not because anything in this app generates OG images. Removing them
would lift headroom from 35.5% to roughly 41%. Worth doing if the design confirms
it needs no dynamic OG images — but it is a single-digit improvement, not a
rescue.

**Everything else is Payload and Next themselves**, at 57.9% of the budget before
a line of product code. There is no large easy win here. The budget has to be
managed stage by stage.

### Measured deltas per stage

The point of the Stage 0 measurement was to track movement, not to record one
number. Each stage appends its own.

| Point | gzip | % of 10 MiB | Delta |
|---|---:|---:|---:|
| Stage 0 baseline — 2 template collections | 6,601 KiB | 64.5% | — |
| Stage 1 in progress — +`categories`, +`gestures`, on Payload **3.90.1** | 6,838 KiB | 66.8% | +237 KiB |
| **Stage 1 complete** — +`users` roles, `lists`, `sponsorships`, `admin-logs`, `user-consents`, search plugin, seed; pinned back to Payload **3.89.0** | 6,656.73 KiB | 65.0% | **−181 KiB** |

**Stage 1 cost +56 KiB gzipped in total**, which is far less than the mid-stage
row suggests. That row reads as a regression the stage then undid, and it is
worth being precise about why, because the naive reading is wrong: it was
measured while the app was briefly on Payload 3.90.1. Pinning back to 3.89.0 —
forced by workerd's 100,000-iteration PBKDF2 cap, not by bundle size — returned
roughly 180 KiB, which then absorbed five collections and the search plugin.

Measured deltas within the stage: the search plugin cost **+8.62 KiB** (measured
both sides of its own commit rather than against a stale figure), and the seed
script cost nothing measurable, being a CLI entry point rather than worker code.

So the honest summary is that five collections and a search plugin are cheap;
the Payload minor version is not. Version choice dominates content-model growth
at this scale, which is worth remembering before the next upgrade is treated as
routine. Re-measure at the end of every stage with
`bun -F site check-bundle-size` and append a row here.

### Consequence

Bundle size is now a standing constraint on every later stage, not a Stage 0
checkbox. Three things follow:

1. The CI budget check (Task 4) is no longer a formality. It should fail the
   build well before 10 MiB — a threshold around 8 MiB gzipped gives warning
   before the wall.
2. Re-measure at the end of every stage, and record the delta. A stage that
   adds 1 MiB gzipped needs to justify it.
3. Decide early whether the app needs dynamic OG images. If not, dropping the
   `ImageResponse` assets recovers 602 KiB gzipped — the only identified lever.

### Plan defect this exposed

Task 4 Step 2 told the executor to measure `.open-next/worker.js` with `ls` and
`gzip`. That file is a **2,278-byte entry stub** that imports the real module
graph; measuring it reports 745 bytes gzipped and 100% headroom. The plan has
been corrected to use `wrangler deploy --dry-run`, whose `Total Upload` line is
the only number that reflects what is actually sent.

## Gate 1 — Remotion in a Cloudflare Container: NOT RUN

**Question:** can a Cloudflare Container run Remotion's headless Chromium and
render one composition end to end, within the container's memory and timeout
limits?

**Not answered, and not answerable in this environment.** Docker 29.3.1 is
installed but **the daemon is not running** — `docker info` fails. The spike's
first step is building and running the container locally; the Cloudflare
question is not meaningful until that works. No Cloudflare credential changes
this.

**Consequence: Stage 6 cannot be planned.** Its shape depends entirely on this
answer — a working container and a fallback to Remotion Lambda produce
different task lists, different deployment topology, and a different row in
the spec's decision table.

Three ways forward, in order of preference:

1. An environment with a working Docker daemon; the spike runs as written.
2. Someone runs the spike locally and reports four numbers: cold-start time to
   first render, warm render time, peak memory, and whether a
   real-composition-length render completes inside the request timeout.
3. Abandon the gate and plan Stage 6 against Remotion Lambda directly,
   updating the spec's "Video composition" decision row and its accepted cost.

---

## Staging is deployed and proven end to end

`https://smog-site-staging.vanneszias.workers.dev` — version
`c5f8c614-38e9-4e92-9ff5-84c8804b0bd2`.

| Check | Result |
|---|---|
| `/` | 200 |
| `/admin` | 200, renders the "Create first user" flow |
| `/api/users` anonymous | 403 with Payload's own error |
| `/api/access` | returns real per-collection access data |
| First-user registration | 200, user id 1 created in remote D1 |
| Media upload | 201, `filesize: 70`, `width: 1`, `height: 1` |
| Object present in R2 | retrieved from `smog-staging-media`, valid PNG |
| Served back through the Worker | 200, `image/png`, 70 bytes |

The `/admin` result is the meaningful one: rendering "Create first user" means
Payload queried the `users` table in **remote** D1 and found it empty. The 403
means access control ran. Together they prove Worker → Payload → D1 → access
control, not just a booting Worker.

### R2 was genuinely broken, and is now genuinely fixed

The upload round-trip matters more than it looks. The vendored template put
`r2Storage` under a `storage:` key that `payload@3.89.0`'s `Config` type does
not have, so the adapter was being **silently dropped** — uploads could never
have reached a bucket. Stage 0 Task 2 moved it to `plugins:` to satisfy the
compiler, and the reviewer flagged that this probably *restored* a broken
feature rather than merely fixing types. Confirmed: the object is in the
bucket and serves back byte-correct.

A first attempt with a deliberately malformed PNG returned
`There was a problem while uploading the file` (400). That was the invalid
image, not R2 — Payload reads image dimensions on upload. Worth knowing, since
that error message does not distinguish the two causes.

### Remote migration: applied, by a documented detour

`bun run deploy:database` still fails in this environment —
`payload migrate` reaches remote D1 through Miniflare's remote-bindings proxy
at `smog-site-staging.vanneszias.workers.dev`, and **workerd does not honour
`HTTPS_PROXY`**, so it is blocked at workerd's own network layer even though
`curl` to that exact host succeeds and the agent proxy logs no rejection for
it. This is a sandbox artifact; a normal CI runner or developer machine has no
such restriction.

Rather than hand-write schema SQL against a database that will be the baseline
for seven more collections, the migration was applied like this:

1. `payload migrate` against **local** D1 — succeeded, 8 tables, batch 1.
2. `wrangler d1 export --local` — 32 schema statements and exactly one
   `INSERT`, Payload's own `payload_migrations` row.
3. `wrangler d1 execute --remote --file` — goes through `api.cloudflare.com`,
   which is not blocked. 8 tables, 45 rows written.

Remote state verified afterwards: all 8 tables present, and `payload_migrations`
holding `20250929_111647` at batch 1 — byte-equivalent to what `payload migrate`
produces, bookkeeping included. Stage 1's migrations can build on it normally.

**Note for the next session:** prefer the real `bun run deploy:database` once
workerd egress is unrestricted. The detour above is correct but is not the
documented path, and should not become habit.

### Staging admin account

A first user exists: `admin@smog.test`. Its password was generated randomly and
is not recorded here. Create your own admin through `/admin` and delete this
one before staging holds anything worth protecting.

`PAYLOAD_SECRET` for the staging Worker was generated randomly and uploaded via
`wrangler secret put`. It exists only in Cloudflare — not in the repo, not in
any file, and not in this document.

## Environment constraints discovered

Recorded because they shaped what was possible, and will shape the next
session too.

- **`api.cloudflare.com` is blocked by the network egress policy.** The agent
  proxy answers 403 to CONNECT for `api.cloudflare.com:443` and
  `sparrow.cloudflare.com:443`. Valid credentials are therefore not sufficient
  in this environment — the policy must allow Cloudflare's API before any
  provisioning, deploy, or remote migration can run. This also blocked reading
  `payloadcms.com` and `blog.cloudflare.com` during research; Payload's docs
  were read through Context7 instead.
- **`*.workers.dev` must also be allowlisted.** Allowing `api.cloudflare.com`
  is not sufficient for remote D1. Miniflare proxies remote bindings through the
  Worker's own subdomain, so `payload migrate` against remote D1 fails with
  `Host not in allowlist: smog-site-staging.vanneszias.workers.dev`. Both hosts
  are needed.
- **The build needs `CLOUDFLARE_API_TOKEN`**, contrary to the plan's assumption
  that only deploys do. `payload.config.ts` opens a remote proxy session during
  `next build`, so a credential-free build is not possible with the current
  config.
- **No Docker daemon**, as above.
- **bun 1.3.11**, against a declared 1.3.14.

## What a credentialed, unblocked session picks up

In order, with the plan steps that cover each:

Resources now exist and `wrangler.jsonc` carries their real IDs:

| Resource | Name | ID |
|---|---|---|
| D1 | `smog-staging` | `de652ee5-3851-4b02-85fb-f4eb8bddfe29` |
| D1 | `smog-production` | `6f48c5c2-43f3-44a9-a083-46d18bf44831` |
| R2 | `smog-staging-media` | — |
| R2 | `smog-production-media` | — |

Remaining:

1. Task 3 Steps 5, 6 — run the baseline migration against remote staging D1 and
   verify the tables exist. **Blocked on `*.workers.dev` egress**, not on
   credentials.
2. Task 4 — deploy to staging, confirm the admin panel loads, smoke-test an R2
   upload, wire both CI checks. The bundle measurement is already done.
3. Task 6 — the Remotion container spike (Gate 1), once there is a Docker
   daemon.
4. Decide whether dynamic OG images are needed; if not, drop the
   `ImageResponse` assets for 602 KiB gzipped.

Schema before code, always: `deploy:database` then `deploy:app`.
