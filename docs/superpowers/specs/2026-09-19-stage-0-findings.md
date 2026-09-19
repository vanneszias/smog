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
runtime — but it is **stale relative to what Payload 3.82.1's own generator
emits**. With the types-drift guard planned for Task 4, generated output must
match the generator or CI fails forever on a diff nobody introduced. The
regenerated map is now committed.

This is the third confirmed skew between the `with-cloudflare-d1` template's
source and the versions it pins, after `storage:` vs `plugins:` and the dead
`generatePayloadViewport` import.

A **fourth** turned up during the Gate 2 build, and this one is fatal rather
than cosmetic: the template's build script is `payload build`, but
`payload@3.82.1` has **no `build` command** — its own CLI usage list confirms
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

### Where the weight is, and what can be recovered

Identified during measurement, not yet acted on:

- **`drizzle-kit/api` is bundled into the Worker** — roughly 7 MiB raw. This is
  Payload's *migration generation* tooling. Migrations are generated at
  development time and applied by `deploy:database` before the Worker is
  deployed, so the runtime should not need it. If it can be externalized or
  tree-shaken, it is the single largest recoverable win.
- **OG-image assets, ~1.5 MiB raw**: `resvg.wasm` (1,346 KiB),
  `Geist-Regular.ttf.bin` (123 KiB), `yoga.wasm` (70 KiB). These come from
  Next's `ImageResponse` / `next/og`. Nothing in the current app generates OG
  images. If the design does not need dynamic OG images, this is free to
  remove; if it does, the cost is now known rather than discovered later.

`worker.js.map` is 39 MiB but is **not** counted toward the upload — the
reported total is `worker.js` (29,084 KiB) plus the three binary assets.

### Consequence

Bundle size is now a standing constraint on every later stage, not a Stage 0
checkbox. Three things follow:

1. The CI budget check (Task 4) is no longer a formality. It should fail the
   build well before 10 MiB — a threshold around 8 MiB gzipped gives warning
   before the wall.
2. Re-measure at the end of every stage, and record the delta. A stage that
   adds 1 MiB gzipped needs to justify it.
3. Investigate the `drizzle-kit` exclusion **before Stage 3**, while there is
   still room to be wrong about it.

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
4. Investigate excluding `drizzle-kit` from the Worker bundle, before Stage 3.

Schema before code, always: `deploy:database` then `deploy:app`.
