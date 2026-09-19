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
| 2 | Worker bundle size | **NOT RUN** — see below |
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
`generatePayloadViewport` import. The spec's standing warning holds: treat
vendored template code as needing verification against installed types.

---

## Gate 2 — Worker bundle size: NOT RUN

**Question:** does Payload plus Next 16 through OpenNext fit the Workers Paid
10 MiB gzipped limit, with room for five more stages of code?

**Not answered.** `opennextjs-cloudflare build` was expected to run locally
without credentials, which would have produced a real measurement without
deploying. It was not reached in this session.

The `checkBundleSize` function and its CI wiring (Task 4 Steps 5–8, 10) are
pure and remain runnable with no network. The measurement itself needs the
build to complete.

**Consequence:** the spec's headroom question is open. Stages 3 through 8 are
being planned without knowing how much of the Worker budget Stage 0 already
consumes. This is a real risk to carry forward, not a formality.

---

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
- **No Docker daemon**, as above.
- **bun 1.3.11**, against a declared 1.3.14.

## What a credentialed, unblocked session picks up

In order, with the plan steps that cover each:

1. Task 3 Steps 1, 5, 6 — create `smog-staging` and `smog-production` D1
   databases and R2 buckets, replace both `PLACEHOLDER_*_DATABASE_ID` values in
   `wrangler.jsonc`, run the baseline migration, verify the remote tables exist.
2. Task 4 — deploy to staging, measure the bundle (Gate 2), confirm the admin
   panel loads, smoke-test an R2 upload, wire both CI checks.
3. Task 6 — the Remotion container spike (Gate 1), if the environment has
   Docker.

Schema before code, always: `deploy:database` then `deploy:app`.
