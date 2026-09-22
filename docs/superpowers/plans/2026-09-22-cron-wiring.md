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
