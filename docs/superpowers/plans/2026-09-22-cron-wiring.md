# Cron Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The deployed `apps/site` Worker runs its job queue every hour, so queued email is sent, sponsorships expire and cleanup happens without anyone calling `GET /api/jobs/run` by hand.

**Architecture:** A thin custom Worker entry (`apps/site/worker.ts`) re-uses OpenNext's generated `fetch` handler and adds `scheduled()`, which hands off to a tested function in `src/jobs/cron.ts`. That function dispatches an authenticated `GET /api/jobs/run` into the Worker's *own* fetch handler, in-process, under `ctx.waitUntil`. `wrangler.jsonc` points `main` at the wrapper, declares the hourly cron, and sets `SITE_ORIGIN` per environment.

**Tech Stack:** `@opennextjs/cloudflare` 1.20.6 custom-worker pattern (https://opennext.js.org/cloudflare/howtos/custom-worker), wrangler 4.136.3, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md`. The deferred work is described in `apps/site/wrangler.jsonc`'s "There is deliberately NO crons entry" comment and in `docs/deployment-checklist.md` ("Cron is not wired"). `src/jobs/cron.ts` already holds `runScheduledTick(environment, dispatch)`, tested in `src/jobs/cron.test.ts`.

## Global Constraints

- `JOBS_RUN_TOKEN` stays a secret (`wrangler secret put JOBS_RUN_TOKEN --env=<env>`), never a var and never in a file.
- `SITE_ORIGIN` is the real public origin with no trailing slash: renewal and confirmation links in queued email are built from the tick's request origin (`src/jobs/index.ts:308-316`, `src/jobs/sendEmail.ts:168,252`). Staging: `https://smog-site-staging.vanneszias.workers.dev`. Production: `https://smog-site-production.vanneszias.workers.dev` until a custom domain is decided, and that value must change in the same commit that adds the domain's route.
- One cron, `"0 * * * *"`. `src/jobs/index.ts` owns per-task schedules; the cron only has to fire at least as often as the most frequent of them.
- No Durable Objects are re-exported: `open-next.config.ts` is `defineCloudflareConfig({})` and `wrangler.jsonc` declares no `durable_objects`. If that changes, the wrapper must re-export the classes (OpenNext docs).
- A failed tick must be visible in the Worker log and must never throw out of `scheduled()` in a way that hides the reason.

## Review Focus

1. **A failed tick being silent.** `runScheduledTick` returns the Response; if nobody checks `ok`, a 5xx from the run looks like success forever. Expected: a non-2xx is logged with its status. Pinned in Task 1. Note what this cannot catch: `endpoints/jobs.ts` deliberately answers **200** to a missing or mismatched token (`acknowledged()`, so the endpoint is not an oracle for the token), logging `[jobs] A run was requested without a usable token; nothing was run`. A wrong `JOBS_RUN_TOKEN` is therefore visible only as that warning in the same Worker log, and Task 2 must show it.
2. **Missing `SITE_ORIGIN` or `JOBS_RUN_TOKEN` in production.** Expected: a clear `[cron] … is not set` log line per tick, not an unhandled rejection. Pinned in Task 1.
3. **Work cut off when `scheduled()` returns.** Expected: the dispatch is held with `ctx.waitUntil`. Pinned in Task 1.
4. **The wrapper not actually being what ships.** A unit test cannot show that `wrangler.jsonc`'s `main` bundles the wrapper and that the tick reaches the endpoint. Expected: a real build plus a local scheduled trigger that shows `/api/jobs/run` handled. Task 2.
5. **Types: `worker.ts` imports a file that exists only after a build.** Expected: `check-types` and `bun check` pass on a fresh checkout without `.open-next`, and still pass after a build (a stale `.open-next` once broke `check-types`, per Stage 8.6's exit). Task 1.

---

## Task 1: `scheduled()` and the wrapper

**Files:**
- Modify: `apps/site/src/jobs/cron.ts` — add `onScheduled`
- Modify: `apps/site/src/jobs/cron.test.ts`
- Create: `apps/site/worker.ts`
- Modify: `apps/site/wrangler.jsonc` — `main`, `triggers.crons`, `vars.SITE_ORIGIN` per env; replace the "no crons" comment with one describing what is now wired and why
- Modify: `apps/site/cloudflare-env.d.ts` — regenerate with `bun run generate:types:cloudflare` (never by hand)

**Interfaces:**
- Consumes: `runScheduledTick(environment: { JOBS_RUN_TOKEN?: string; SITE_ORIGIN?: string }, dispatch: (request: Request) => Promise<Response>): Promise<Response>` (existing; throws `[cron] X is not set…` when a variable is missing).
- Produces: `onScheduled(environment, context: { waitUntil(promise: Promise<unknown>): void }, dispatch): void` — calls `context.waitUntil(...)` with a promise that runs `runScheduledTick`, logs `[cron] Scheduled job run answered <status>` via `console.error` for a non-2xx, logs `[cron] Scheduled job run failed:` with the error for a throw, and never rejects.

- [ ] **Step 1: Failing tests** (append to `cron.test.ts`, matching its style)

```ts
import { onScheduled } from "@/jobs/cron";

describe("onScheduled", () => {
  const environment = {
    JOBS_RUN_TOKEN: "cron-test-token",
    SITE_ORIGIN: "https://smog.example",
  };

  const capture = () => {
    const held: Promise<unknown>[] = [];
    return { held, context: { waitUntil: (p: Promise<unknown>) => held.push(p) } };
  };

  it("holds the run open with waitUntil and dispatches the authenticated tick", async () => {
    const { held, context } = capture();
    const dispatch = vi.fn(() => Promise.resolve(Response.json({ status: "ok" })));

    onScheduled(environment, context, dispatch);

    expect(held).toHaveLength(1);
    await held[0];
    const [request] = dispatch.mock.calls[0] as [Request];
    expect(request.url).toBe("https://smog.example/api/jobs/run");
    expect(request.headers.get("authorization")).toBe("Bearer cron-test-token");
  });

  it("logs a refused tick with its status instead of passing it off as a run (Review Focus 1)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { held, context } = capture();

    onScheduled(environment, context, () => Promise.resolve(new Response(null, { status: 401 })));
    await held[0];

    expect(error).toHaveBeenCalledWith(expect.stringContaining("401"));
    error.mockRestore();
  });

  it("logs a missing variable and does not reject (Review Focus 2)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { held, context } = capture();
    const dispatch = vi.fn();

    onScheduled({ JOBS_RUN_TOKEN: "t" }, context, dispatch);

    await expect(held[0]).resolves.toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[cron] Scheduled job run failed:",
      expect.objectContaining({ message: expect.stringContaining("SITE_ORIGIN") })
    );
    error.mockRestore();
  });

  it("logs a dispatch that throws and does not reject", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { held, context } = capture();

    onScheduled(environment, context, () => Promise.reject(new Error("boom")));

    await expect(held[0]).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[cron] Scheduled job run failed:", expect.any(Error));
    error.mockRestore();
  });
});
```

(Add `vi` to the file's vitest import.)

- [ ] **Step 2: Run to see them fail** — `bun -F site test -- src/jobs/cron.test.ts` → FAIL, `onScheduled` is not exported.

- [ ] **Step 3: Implement `onScheduled`** in `src/jobs/cron.ts`, below `runScheduledTick`, with a doc comment in the file's style (why `waitUntil`, why a non-2xx is logged, why it never rejects):

```ts
export function onScheduled(
  environment: CronEnvironment,
  context: { waitUntil(promise: Promise<unknown>): void },
  dispatch: (request: Request) => Promise<Response>
): void {
  context.waitUntil(
    runScheduledTick(environment, dispatch).then(
      (response) => {
        if (!response.ok) {
          console.error(`[cron] Scheduled job run answered ${response.status}`);
        }
      },
      (error: unknown) => {
        console.error("[cron] Scheduled job run failed:", error);
      }
    )
  );
}
```

- [ ] **Step 4: The wrapper.** Create `apps/site/worker.ts`:

```ts
// @ts-ignore — `.open-next/worker.js` is generated by `opennextjs-cloudflare build`.
import { default as handler } from "./.open-next/worker.js";
import { onScheduled } from "./src/jobs/cron";

/**
 * The Worker entry `wrangler.jsonc`'s `main` points at: OpenNext's generated
 * `fetch`, plus the hourly `scheduled()` that drains the job queue. The
 * pattern is OpenNext's own (https://opennext.js.org/cloudflare/howtos/custom-worker).
 * No Durable Object classes are re-exported because this app binds none; add
 * them here if `open-next.config.ts` ever enables the DO queue or tag cache.
 *
 * The tick is dispatched into this Worker's own `fetch`, in-process, so it
 * runs through the same middleware and Payload instance as any request.
 */
export default {
  fetch: handler.fetch,
  scheduled(_controller, env, ctx) {
    onScheduled(env, ctx, (request) => handler.fetch(request, env, ctx));
  },
} satisfies ExportedHandler<CloudflareEnv>;
```

Resolve, and record in the report, how the `.open-next` import is kept typecheck-clean both with and without a build: the tsconfig already excludes `.open-next`; confirm `bun -F site check-types` passes (a) with no `.open-next` directory and (b) after `CLOUDFLARE_ENV=staging PAYLOAD_SECRET=x bun run build:app`. If Biome's rules reject `@ts-ignore`, use the narrowest alternative that passes both states (e.g. a `declare module "./.open-next/worker.js"` shim in a `.d.ts`), never a blanket suppression. `CloudflareEnv` must include `JOBS_RUN_TOKEN` and `SITE_ORIGIN` after regeneration; if `wrangler types` omits the secret, type `env` via the existing `CronEnvironment` intersection instead.

- [ ] **Step 5: `wrangler.jsonc`.** Set `"main": "worker.ts"`. Add `"triggers": { "crons": ["0 * * * *"] }` at the top level **and** confirm from wrangler's config schema (`node_modules/wrangler/config-schema.json`) whether `triggers` is inherited by named environments; if not, repeat it in `staging` and `production`. Add `SITE_ORIGIN` to each environment's `vars` with the values in Global Constraints, commented that production's must change with the custom-domain route. Replace the long "There is deliberately NO crons entry" comment with a short one stating what is wired, where the logic lives, and that `JOBS_RUN_TOKEN` is a secret. Regenerate `cloudflare-env.d.ts`.

- [ ] **Step 6: Run** `bun -F site test -- src/jobs/cron.test.ts`, then `bun -F site check-types`, `bun check`, `bunx knip --no-progress --no-config-hints` (knip must see `worker.ts` as an entry or through wrangler; if it reports `worker.ts` or `onScheduled` unused, add `worker.ts` to the `apps/site` entry list in `knip.json` rather than suppressing).

- [ ] **Step 7: Mutations** — remove the `!response.ok` branch → Review Focus 1 test fails; replace `context.waitUntil(p)` with `void p` → the first test fails. Restore.

- [ ] **Step 8: Commit** `feat(site): drain the job queue hourly from a scheduled handler`.

## Task 2: Prove the shipped Worker ticks

- [ ] **Step 1:** `cd apps/site && CLOUDFLARE_ENV=staging PAYLOAD_SECRET=local-build-only bun run build:app`, then `CLOUDFLARE_ENV=staging bun run check-bundle-size` — record the size; it must stay under budget.
- [ ] **Step 2:** Confirm the bundle is the wrapper: `bunx wrangler deploy --dry-run --env=staging --outdir <scratch>` and grep the output module for `scheduled` and for the `[cron]` log strings.
- [ ] **Step 3: A real local tick.** Put a throwaway token in a scratch `.dev.vars` (check `.gitignore` covers `.dev.vars`; if not, add it before creating the file), then run `bunx wrangler dev --env=staging --local --test-scheduled --port 8799` in the background, request `http://localhost:8799/__scheduled?cron=0+*+*+*+*`, and show from the wrangler log that `GET /api/jobs/run` was handled with the token (a 200 from the endpoint's authorised path, or its log line). Then run it once with no `JOBS_RUN_TOKEN` (expect the `[cron] JOBS_RUN_TOKEN is not set` line) and once with a `.dev.vars` token that differs from the one the endpoint reads — if both sides read the same variable this case cannot be constructed locally; say so — and show the `[jobs] … without a usable token` warning. Stop the dev server, delete the scratch `.dev.vars`. If `wrangler dev` cannot run in this environment, record the exact error and say this proof is outstanding — do not claim it.
- [ ] **Step 4: Docs.** In `docs/deployment-checklist.md`, remove "Cron is not wired" from the open items, move `SITE_ORIGIN` from "pending" to a per-env var already in `wrangler.jsonc`, and correct the `JOBS_RUN_TOKEN` row's note that nothing calls the endpoint. Record the exit (both proofs, bundle size) at the end of this plan.
- [ ] **Step 5: Commit** `docs: the cron is wired; say so where the checklist said it was not`.

## Exit: measured

Both review-focus proofs (Review Focus 4, "the wrapper not actually being
what ships") were carried out against a real build and a real local
scheduled trigger, from `apps/site`, `CLOUDFLARE_ENV=staging`. No Cloudflare
credentials were used or needed.

### Step 1 — build and bundle size

```
CLOUDFLARE_ENV=staging PAYLOAD_SECRET=local-build-only bun run build:app
CLOUDFLARE_ENV=staging bun run check-bundle-size
```

Build succeeded (`next build` "Compiled successfully", OpenNext "Worker saved
in `.open-next/worker.js`"). Bundle-size output:

```
Total Upload: 35223.55 KiB / gzip: 7573.15 KiB
Worker bundle is 7.40 MiB gzipped of 10.00 MiB. 26% headroom remaining.
```

**Versus the last recorded figure** (Stage 8.6's exit, `docs/superpowers/plans/2026-09-22-stage-8-5-consent.md`):
7.40 MiB gzipped of 10.00 MiB then, 7.40 MiB gzipped of 10.00 MiB now
(7,574.53 KiB then vs. 7,573.15 KiB now — a ~1.4 KiB decrease, noise-level).
The cron wiring (`worker.ts`, `onScheduled`, the `triggers` entry) added
nothing measurable to the bundle. Still 26% headroom, well under budget.

### Step 2 — the shipped bundle really is the wrapper

```
bunx wrangler deploy --dry-run --env=staging --outdir=<scratch>/dryrun-bundle
grep -n "scheduled(_controller" -A5 <scratch>/dryrun-bundle/worker.js
grep -n '\[cron\] Scheduled job run' <scratch>/dryrun-bundle/worker.js
```

The emitted `worker.js`'s final lines are `worker.ts`'s own object, not just
OpenNext's generated handler:

```js
scheduled(_controller, env4, ctx) {
  onScheduled(env4, ctx, (request) => worker_default.fetch(request, env4, ctx));
}
```

with `onScheduled`'s body inlined a few lines above it, including both
literal `[cron]` log strings (`"[cron] Scheduled job run answered ${...}"`,
`"[cron] Scheduled job run failed:"`), and `endpoints/jobs.ts`'s
`"[jobs] A run was requested without a usable token; nothing was run"` also
present in the bundle. Re-verified after fold-in commit `28d90bb`:

```
CLOUDFLARE_ENV=staging PAYLOAD_SECRET=local-build-only bun run build:app
CLOUDFLARE_ENV=staging bunx wrangler deploy --dry-run --env=staging --outdir=<scratch>
grep -c "A run was requested without a usable token; nothing was run" <scratch>/worker.js
```
```
2
```

— present twice, at lines 162234 and 385208 of the emitted `worker.js`: the
route registered on the live queue plus a duplicate module instance esbuild
kept from a second import path into the bundle. `--dry-run --outdir` needed
no Cloudflare authentication.

### Step 3 — a real local tick

**Local D1 schema.** The built worker's `next build` output statically
folds `process.env.NODE_ENV` to the literal `"production"`, which dead-code-
eliminates `@payloadcms/db-d1-sqlite`'s `pushDevSchema` call entirely from
the bundle (confirmed: zero occurrences of `pushDevSchema` in the built
`handler.mjs`, versus the source, which has it behind `NODE_ENV !==
"production"`) — so `wrangler dev` serving this build will never auto-create
schema, unlike `next dev` (which is how `site-e2e`'s CI job gets schema for
free). The CLI path production deploys use, `payload migrate`
(`deploy:database`), also could not be used here: it currently crashes
locally, independent of environment, because `readMigrationFiles` (Payload
core) dynamically imports every non-`index.*` file in `src/migrations`,
including `migrations.test.ts` — which calls Vitest's `describe()` at module
scope and throws `TypeError: Cannot read properties of undefined (reading
'config')` outside a Vitest runner. **This looks like a real, pre-existing
defect in the `deploy:database` path, unrelated to the cron work** — flagged
here per this task's "stop and report" instruction rather than fixed, since
fixing it is out of this task's scope. See "Concerns" below.

Instead, seeded the same way `apps/site`'s own dev flow does (matching CI's
approach, which relies on `next dev`'s live schema push, not `payload
migrate`): `bun -F site seed` — a repo script whose guard
(`src/seed/guard.ts`) requires `CLOUDFLARE_ENV=staging` and a non-production
`NODE_ENV`, which resolves the *local* emulated D1 (`.wrangler/state/v3`) and
triggers the same `pushDevSchema` used in dev/CI. Confirmed via `bun:sqlite`
against the resulting `.wrangler/state/v3/d1/.../*.sqlite` file: all expected
tables present, including `payload_jobs`, `claims`, `rate_limits`, `users`.

**The tick itself:**

```
# apps/site/.dev.vars (scratch, gitignored — see below)
JOBS_RUN_TOKEN=throwaway-local-cron-proof-token
PAYLOAD_SECRET=local-dev-seed-only

CLOUDFLARE_ENV=staging bunx wrangler dev --env=staging --local --test-scheduled --port 8799 &
curl -sS -i "http://localhost:8799/__scheduled?cron=0+*+*+*+*"
```

`.gitignore` did **not** already cover `.dev.vars` (checked both
`/home/user/smog/.gitignore` and `apps/site/.gitignore` with `git
check-ignore -v` before creating the file — neither matched); added
`.dev.vars` / `.dev.vars.*` to `apps/site/.gitignore` in this task's commit,
confirmed with `git check-ignore -v` afterward, *then* created the file.

Observed, matching token (a temporary, uncommitted
`req.payload.logger.info(\`[cron-proof] req.origin was ${req.origin}\`)` was
added to `endpoints/jobs.ts` for this one observation, rebuilt, run, then
reverted — confirmed via `git diff` showing no residual change before
committing):

```
HTTP/1.1 200 OK
...
Ran scheduled event
```
```
{"level":"info","msg":"[cron-proof] req.origin was https://smog-site-staging.vanneszias.workers.dev"}
[wrangler:info] GET /__scheduled 200 OK (1137ms)
{"level":"info","msg":"[jobs] Ran 0 jobs from the default queue"}
```

- **(a) The endpoint's authorised path ran**: `[jobs] Ran 0 jobs from the
  default queue` — the endpoint's own "ran" log line, not the "without a
  usable token" warning (0 jobs because the seeded queue was empty — the
  claim/lease and `handleSchedules` path executed without error against the
  real schema).
- **(b) The job saw the right origin (Review Focus 1 / the Host fix)**:
  `req.origin` inside the run was observed to be exactly
  `https://smog-site-staging.vanneszias.workers.dev` — `wrangler.jsonc`'s
  configured `SITE_ORIGIN` for staging, not `localhost` or `undefined`.
  This is the concrete confirmation that `runScheduledTick`'s `host` header
  (added in fix round 1) reaches Payload's `req.origin` through OpenNext's
  edge converter → Next's `initURL` → `createPayloadRequest`, exactly as
  Task 1's report traced.

Observed, no `JOBS_RUN_TOKEN` set (`.dev.vars` held only `PAYLOAD_SECRET`,
fresh `wrangler dev` restart):

```
[cron] Scheduled job run failed: Error: [cron] JOBS_RUN_TOKEN is not set; the scheduled job run was not attempted.
```

logged via `console.error`, not thrown out of `scheduled()` — the
`/__scheduled` request still answered `200 OK`.

**Mismatched-token case: not constructible locally, as the brief
anticipated.** `runScheduledTick` reads `environment.JOBS_RUN_TOKEN` from the
`env` object `wrangler dev` builds from `.dev.vars`/`wrangler.jsonc`, and
`endpoints/jobs.ts`'s `authorized()` reads `process.env.JOBS_RUN_TOKEN` —
which OpenNext's `nodejs_compat` runtime mirrors from that exact same `env`
binding. There is one name, one `.dev.vars` file, one binding: nothing in
this local setup lets the cron side and the endpoint side read two different
values. (Remotely, this could only diverge if the deployed secret were
rotated mid-flight or someone hand-called the endpoint with a stale token —
not reproducible here.) This is the outstanding item the brief said to name
rather than fake: **not proven, and, per the brief's own reasoning, not
provable locally.**

**Cleanup, confirmed:** both `wrangler dev` instances were stopped
(`pgrep -fa "wrangler dev|workerd"` → none remaining); the temporary
`req.origin` log in `endpoints/jobs.ts` was reverted (`git diff` → empty);
the scratch `apps/site/.dev.vars` was deleted; `apps/site/.open-next`,
`apps/site/.wrangler`, `apps/site/.next` and `apps/site/tsconfig.tsbuildinfo`
were removed; the scratch dry-run bundle directory was removed. `git status`
after cleanup showed only the intended source changes (`.gitignore`; docs).

### Summary

| Proof | Status |
|---|---|
| Bundle under budget | **Observed** — 7.40 MiB / 10.00 MiB, 26% headroom, unchanged from the last recorded figure |
| Shipped bundle is the wrapper (`scheduled` + `[cron]` strings present) | **Observed** |
| Matching token → endpoint's authorised path runs | **Observed** — `[jobs] Ran 0 jobs from the default queue` |
| Job sees the right origin (Review Focus 1 / Host fix) | **Observed** — `req.origin` was `https://smog-site-staging.vanneszias.workers.dev` |
| No `JOBS_RUN_TOKEN` → loud log, no throw | **Observed** — `[cron] Scheduled job run failed: Error: [cron] JOBS_RUN_TOKEN is not set...` |
| Mismatched token → `[jobs] … without a usable token` | **Outstanding — not constructible locally** (both sides read the identical env var; no local mechanism to diverge them) |

### Concerns for a future task

- `bun run deploy:database` (`payload migrate`), independent of this task's
  changes, appears to crash locally because `payload`'s `readMigrationFiles`
  imports every non-`index.*` file under `src/migrations`, including
  `migrations.test.ts` (which calls Vitest's `describe()` at module scope).
  Not exercised here beyond the one reproduction above — no code change was
  made per this task's scope (proving the cron tick, not fixing migrations).
  Worth its own task before the next real `deploy:database` run.
