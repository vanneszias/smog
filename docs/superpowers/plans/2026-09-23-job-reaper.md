# Stranded Jobs and Outbound Timeouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A queue run that is killed partway through (the Worker hitting its wall-clock ceiling, an eviction, a deploy) no longer stops a scheduled task for good or strands queued email, and no outbound HTTP call can hold a run open until the platform kills it.

**Architecture:** A new `src/jobs/reapStrandedJobs.ts` finds `payload-jobs` rows that still say `processing: true` long after any live run could hold them, and either releases each one to run again or files it as failed with a reason. `endpoints/jobs.ts` calls it inside the run lease, before `handleSchedules`. Separately, every server-side `fetch` to a third party (Mollie, Mux, OpenPanel) gets an `AbortSignal.timeout`, matching the one `endpoints/oauth.ts` already carries.

**Tech Stack:** Payload 3.89 jobs queue on `@payloadcms/db-d1-sqlite`, Vitest (site, `*.int.test.ts` run against a local D1), Workers `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md`. This is out-of-stage hardening found while wiring the cron (`docs/superpowers/plans/2026-09-22-cron-wiring.md`); it must land before the Stage 10 cutover relies on email.

## Why this is a launch problem, read from Payload's source

- `payload.jobs.run` claims up to `limit` jobs (10, `JOBS_PER_RUN` in `endpoints/jobs.ts`) by setting `processing: true` on **all of them at once**, before running the first (`node_modules/payload/dist/queues/operations/runJobs/index.js`, around line 125). With `sequential: true`, a run killed during job 1 leaves jobs 2–10 claimed but never started.
- The runner's own query only takes jobs with `processing: false`. Nothing in Payload ever resets a `processing: true` row. A stranded job is never run again.
- `countRunnableOrActiveJobsForQueue` (`operations/handleSchedules/countRunnableOrActiveJobsForQueue.js`) counts a job as active when it has no `completedAt` and no `error` — which a stranded row satisfies — and `defaultBeforeSchedule` refuses to queue a scheduled task while one is active. **So one killed run permanently stops every scheduled task whose job it held**: expiry, renewal reminders, payment cleanup, or the rate-limit retention sweep, silently, while every tick still answers 200.
- ~~`updateJob` always sets `updatedAt`, so a row a live run is working on keeps a recent `updatedAt`.~~ **Corrected by the final review:** Payload does not heartbeat `updatedAt` during a task, and rows 2..N of a batch keep their claim-time `updatedAt` until they run. The invariant that actually holds is that **the whole run, claim to last job, ends within thirty minutes**. A scheduled invocation guarantees it (fifteen-minute wall ceiling; the cron tick runs inside one via `worker.ts` → `onScheduled` → `ctx.waitUntil`). An HTTP call to `/api/jobs/run` has no wall limit while its client stays connected, so manual calls carry `curl --max-time 600` (`docs/deployment-checklist.md`).
- A task's retries are governed by the task status derived from the job's `log` (`errors/handleTaskError.js:54`, `utilities/getJobTaskStatus.js`). A killed attempt writes no log entry, so a released job's retry budget is not consumed by the kill. The job-level `totalTried` field is bumped by Payload on every failure (`handleTaskError.js:117`) and is otherwise free, so this plan uses it as the counter that bounds reaping.

## Global Constraints

- The reaper runs **inside** the run lease in `endpoints/jobs.ts`, before `handleSchedules`, so a freshly freed scheduled task can be queued by the same tick. It must never throw out of the endpoint: a reaper failure is logged `[jobs] …` and the tick carries on, exactly as a `handleSchedules` failure does today.
- `STRANDED_AFTER_MS = 30 * 60 * 1000` — twice the fifteen-minute scheduled-invocation ceiling. The comparison is `updatedAt < now - STRANDED_AFTER_MS`, strictly less.
- At most `REAP_LIMIT = 50` rows per tick.
- The rule for each stranded row, and only this rule. `attempts` is the task's `retries.attempts` from `jobsConfig` (`0` for the four sweeps, `3` for `send-email`); a task with no retry config, or a row with no matching task, counts as `attempts = 0`:
  - `(job.totalTried ?? 0) >= attempts` → **filed as failed**: `processing: false`, `hasError: true`, `error: { message: STRANDED_MESSAGE }`. This takes it out of `countRunnableOrActiveJobsForQueue`, so the next `handleSchedules` queues a fresh sweep.
  - otherwise → **released**: `processing: false`, `totalTried: (job.totalTried ?? 0) + 1`. It runs on this or a later tick.
- `STRANDED_MESSAGE = "[jobs] Stranded: the run that claimed this job ended without finishing it"`. Never include input, recipient or any other job data in a log line or in the error — `jobs/sendEmail.ts` explains why for email.
- Consequence to document in the module's doc comment, not to engineer away: a released `send-email` whose message was actually handed to the email binding before the kill will be sent twice. At-least-once is the shipped behaviour (BullMQ's stalled-job recovery in `apps/server/src/services/emailQueue.ts` does the same) and is preferable to a renewal nobody was asked about.
- Writes use the Local API with `overrideAccess: true` (`payload-jobs` refuses every operation to every user). No schema change and no migration: every field used already exists on the collection.
- Outbound timeout: `10_000` ms via `AbortSignal.timeout`, the value `endpoints/oauth.ts:349` already uses, as a module-level constant in each module that needs it (`REQUEST_TIMEOUT_MS`). Not exported (knip fails on an unused export).
- The email binding (`email/adapter.ts`, `send.send(builder)`) gets **no** timeout. A binding call cannot be aborted, so a race would stop waiting without stopping the send and turn every slow send into a duplicate. The reaper is its backstop. Say so in one comment beside the call.
- `src/lib/analytics.ts`, `src/lib/mergeGuestState.ts` and `src/lib/accountFavorites.ts` run in the browser and are out of scope.
- Error logging follows `AGENTS.md`: `[serviceName] Failed to …`, rethrow.
- Before pushing: `bun check`, `bun -F site check-types`, the site test suite, and `bunx knip --no-progress --no-config-hints`.

## Review Focus

1. **A job a live run is still working on being reaped.** Expected: a `processing: true` row whose `updatedAt` is inside the window is left alone. Pinned in Task 1 (the "recent row" case), including the boundary exactly at the window edge.
2. **A reaped sweep leaving the schedule stuck anyway.** Reaping is only useful if the next `handleSchedules` actually queues a fresh job. Expected: after reaping a stranded `prune-rate-limits` row, one tick queues a new one. Pinned in Task 1 through the endpoint, not the function alone.
3. **A job that kills the Worker every time being released for ever.** Expected: a `send-email` row reaped with `totalTried` already at 3 is filed as failed rather than released a fourth time. Pinned in Task 1.
4. **The reaper failing and taking the tick down with it.** Expected: the queue still drains and the lease is still released. Pinned in Task 1 by making the reaper's read throw.
5. **A timeout changing what a caller does with a failure.** A Mux read that times out inside `settleComposedVideos` must leave the render pending for the next sweep, as any other Mux failure does, not mark it failed. Pinned in Task 2.

---

### Task 1: Reap stranded jobs inside the run lease

**Files:**
- Create: `apps/site/src/jobs/reapStrandedJobs.ts`
- Create: `apps/site/src/jobs/reapStrandedJobs.int.test.ts`
- Modify: `apps/site/src/endpoints/jobs.ts` (the `try` block in `runJobs`, before the `handleSchedules` call)

**Interfaces:**
- Consumes: `jobsConfig` from `@/jobs` (read `tasks[].slug` and `tasks[].retries`); `Payload` from `payload`.
- Produces: `export async function reapStrandedJobs(payload: Payload, now: Date): Promise<{ released: number; failed: number }>` — the only export. `now` is a parameter so tests assert a decision instead of racing a clock, the convention `expireSponsorships(payload, now)` set.

- [ ] **Step 1: Read before writing.** Read `src/jobs/schedules.int.test.ts` for how an int test boots Payload, seeds `payload-jobs` rows and drives `GET /api/jobs/run` through `handleEndpoints`; reuse that harness shape rather than inventing one. Read `node_modules/payload/dist/queues/operations/runJobs/index.js` lines 1–140 to confirm the claim query and that `processing: false` is required. If the shipped code disagrees with "Why this is a launch problem" above, the code is right: note it in your report and follow the code.

- [ ] **Step 2: Write the failing tests** in `reapStrandedJobs.int.test.ts`. Seed rows with `payload.create({ collection: "payload-jobs", data, overrideAccess: true })`, then force `processing` and `updatedAt` with `payload.db.updateOne` (or the jobs update the harness already uses) so `updatedAt` is exactly what the case needs. Cases, each asserting the row's resulting fields *and* the returned counts:
  1. `send-email` row, `processing: true`, `updatedAt` 31 minutes before `now`, `totalTried` unset → released: `processing: false`, `totalTried: 1`, no `error`, `hasError` falsy. Returns `{ released: 1, failed: 0 }`.
  2. Same row with `totalTried: 3` → filed as failed: `processing: false`, `hasError: true`, `error.message === STRANDED_MESSAGE` (assert the literal string). Returns `{ released: 0, failed: 1 }`.
  3. `prune-rate-limits` row stranded → filed as failed (its `attempts` is 0).
  4. Row with `updatedAt` 29 minutes before `now` → untouched, returns zeros.
  5. Row with `updatedAt` exactly `now - 30 min` → untouched (strict `<`).
  6. Row with `processing: false` and an old `updatedAt` → untouched.
  7. Row whose `taskSlug` matches no task in `jobsConfig` → filed as failed.
  8. Through the endpoint: seed a stranded `prune-rate-limits` row carrying `meta.scheduled` as `handleSchedules` would write it and a `payload-jobs-stats` `lastScheduledRun` old enough that the task is due; call `GET /api/jobs/run` with the token; assert a **new** `prune-rate-limits` job exists afterwards (queued and, since it is due, run). Without the reaper this test must fail — confirm that in Step 3.
  9. Through the endpoint, with the reaper's read made to throw (spy on `payload.find` for `collection === "payload-jobs"` only for the reaper's call, or inject however the harness allows without exporting anything new): the response is still 200 `{status:"ok"}`, a queued `send-email` job still runs, and the lease row is released afterwards.

- [ ] **Step 3: Run them and watch them fail.**
  Run: `bun -F site test -- src/jobs/reapStrandedJobs.int.test.ts`
  Expected: FAIL — module not found (cases 1–7), and case 8 failing on "no new job" once a stub exists.

- [ ] **Step 4: Implement `reapStrandedJobs.ts`.** Shape:

```ts
import type { Payload } from "payload";
import { jobsConfig } from "@/jobs";

const STRANDED_AFTER_MS = 30 * 60 * 1000;
const REAP_LIMIT = 50;
const STRANDED_MESSAGE =
  "[jobs] Stranded: the run that claimed this job ended without finishing it";

function attemptsFor(taskSlug: unknown): number {
  const task = jobsConfig.tasks?.find((candidate) => candidate.slug === taskSlug);
  const retries = task?.retries;

  if (typeof retries === "number") {
    return retries;
  }

  return retries?.attempts ?? 0;
}

export async function reapStrandedJobs(
  payload: Payload,
  now: Date
): Promise<{ failed: number; released: number }> {
  const cutoff = new Date(now.getTime() - STRANDED_AFTER_MS).toISOString();
  const { docs } = await payload.find({
    collection: "payload-jobs",
    depth: 0,
    limit: REAP_LIMIT,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { processing: { equals: true } },
        { updatedAt: { less_than: cutoff } },
      ],
    },
  });

  let released = 0;
  let failed = 0;

  for (const job of docs) {
    const tried = job.totalTried ?? 0;

    if (tried >= attemptsFor(job.taskSlug)) {
      await payload.update({
        collection: "payload-jobs",
        data: { error: { message: STRANDED_MESSAGE }, hasError: true, processing: false },
        id: job.id,
        overrideAccess: true,
      });
      failed += 1;
    } else {
      await payload.update({
        collection: "payload-jobs",
        data: { processing: false, totalTried: tried + 1 },
        id: job.id,
        overrideAccess: true,
      });
      released += 1;
    }
  }

  return { failed, released };
}
```

  Adjust types to what `payload-types.ts` generates for `payload-jobs` (`retries` may be typed as `number | RetryConfig`; keep the narrowing honest rather than casting). Add a doc comment in the style of `jobs/index.ts` covering: why a stranded row blocks its schedule for ever, why thirty minutes, the release-or-fail rule and why `totalTried` bounds it, and the duplicate-send consequence. If `payload.update` rejects `totalTried` or `error` through the Local API because the collection marks them read-only or hidden, use `payload.db.updateOne` for the write and say why in a comment.

- [ ] **Step 5: Wire it into `endpoints/jobs.ts`.** Inside the existing `try`, before the `handleSchedules` block, add its own `try/catch`:

```ts
    try {
      const reaped = await reapStrandedJobs(req.payload, new Date());

      if (reaped.released + reaped.failed > 0) {
        req.payload.logger.warn(
          `[jobs] Recovered stranded jobs: ${reaped.released} released to run again, ${reaped.failed} filed as failed`
        );
      }
    } catch (error) {
      req.payload.logger.error(
        { err: error },
        "[jobs] Could not recover stranded jobs; the queue is still drained and the next tick tries again"
      );
    }
```

  and a comment above it, matching the density of the `handleSchedules` comment, saying why it is inside the lease (two ticks must not both release the same row) and before `handleSchedules` (a freed scheduled task is re-queued by this tick, not the next).

- [ ] **Step 6: Run the tests and see them pass.**
  Run: `bun -F site test -- src/jobs/reapStrandedJobs.int.test.ts src/jobs/schedules.int.test.ts src/endpoints`
  Expected: PASS, and the existing jobs tests unchanged.

- [ ] **Step 7: Checks.** `bun check`, `bun -F site check-types`, `bunx knip --no-progress --no-config-hints`. All clean.

- [ ] **Step 8: Commit.**

```bash
git add apps/site/src/jobs/reapStrandedJobs.ts apps/site/src/jobs/reapStrandedJobs.int.test.ts apps/site/src/endpoints/jobs.ts
git commit -m "fix(site): recover jobs a killed run left processing, so one crash cannot stop a schedule for good"
```

### Task 2: Time out every server-side call to a third party

**Files:**
- Modify: `apps/site/src/lib/mollie.ts` (`mollieRequest`, around line 170)
- Modify: `apps/site/src/lib/mux.ts` (`createMuxAssetFromUrl` ~187, `readMuxAsset` ~468, `deleteMuxAsset` ~526)
- Modify: `apps/site/src/endpoints/analytics.ts` (the relay `fetch`, ~253)
- Modify: `apps/site/src/email/adapter.ts` (a comment only, beside `send.send(builder)`)
- Test: `apps/site/src/lib/mollie.test.ts`, `apps/site/src/lib/mux.test.ts`, `apps/site/src/endpoints/analytics.int.test.ts`, and whichever existing test covers `settleComposedVideos` (find it; `src/jobs/expireSponsorships.int.test.ts` is the likely one)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. No new exports.

- [ ] **Step 1: Write the failing tests.** In each module's existing test file, using the fetch stub it already has:
  1. For each of the five call sites, assert the `init` handed to `fetch` carries a `signal` that is an `AbortSignal` and is not already aborted. Name each test after the call it covers.
  2. `mollie.test.ts`: a stubbed `fetch` that rejects with `new DOMException("The operation timed out.", "TimeoutError")` makes the public function that calls `mollieRequest` reject (not resolve, not hang). Assert on rejection only; do not assert a message the code does not produce.
  3. The `settleComposedVideos` test file: a Mux read that rejects with the same `TimeoutError` leaves the render in the state any other Mux read failure leaves it in (read that test's existing failure case and mirror its assertion). This is Review Focus 5.
  4. `analytics.int.test.ts`: a relay `fetch` rejecting with `TimeoutError` still answers the client the way the existing relay-failure case does (mirror it).

- [ ] **Step 2: Run them and watch the signal assertions fail.**
  Run: `bun -F site test -- src/lib/mollie.test.ts src/lib/mux.test.ts src/endpoints/analytics.int.test.ts`
  Expected: the five `signal` assertions FAIL; the rejection-behaviour tests may already pass, which is fine — they pin behaviour the timeout must not change.

- [ ] **Step 3: Implement.** In `mollie.ts`, `mux.ts` and `endpoints/analytics.ts`, add near the other constants:

```ts
/**
 * How long one call to <service> may take before it is abandoned.
 *
 * Workers `fetch` has no default timeout, and a call that never answers holds
 * the request — or, from a job, the whole queue run — until the platform
 * kills it, which strands every job that run had claimed. Ten seconds is the
 * value `endpoints/oauth.ts` already uses for the same reason.
 */
const REQUEST_TIMEOUT_MS = 10_000;
```

  and add `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)` to each `fetch` init. In `mollieRequest`, spread it so a caller-supplied `init` keeps its other fields: `fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })`. In `email/adapter.ts`, add beside `send.send(builder)` a short comment: no timeout, because a binding call cannot be aborted and a race would turn a slow send into a duplicate; `jobs/reapStrandedJobs.ts` is the backstop for a send that never returns.

- [ ] **Step 4: Run the tests and see them pass.**
  Run: `bun -F site test -- src/lib/mollie.test.ts src/lib/mux.test.ts src/endpoints/analytics.int.test.ts src/jobs/expireSponsorships.int.test.ts`
  Expected: PASS.

- [ ] **Step 5: Checks.** `bun check`, `bun -F site check-types`, `bunx knip --no-progress --no-config-hints`. All clean.

- [ ] **Step 6: Commit.**

```bash
git add apps/site/src/lib/mollie.ts apps/site/src/lib/mux.ts apps/site/src/endpoints/analytics.ts apps/site/src/email/adapter.ts apps/site/src/lib/mollie.test.ts apps/site/src/lib/mux.test.ts apps/site/src/endpoints/analytics.int.test.ts apps/site/src/jobs/expireSponsorships.int.test.ts
git commit -m "fix(site): time out calls to Mollie, Mux and OpenPanel so a silent peer cannot hold a queue run open"
```

(Stage only the test files you actually changed.)

### Task 3: Record it where an operator looks

**Files:**
- Modify: `docs/deployment-checklist.md` (the cron section)
- Modify: `docs/superpowers/plans/2026-09-23-job-reaper.md` (append "Exit" at the end)

- [ ] **Step 1:** In the checklist's cron section, add what an operator sees and does: the `[jobs] Recovered stranded jobs: …` warning in the Worker log means a run was killed; a `payload-jobs` row with `error.message` equal to `STRANDED_MESSAGE` is a job that was given up on, and for a `send-email` row that is a message that may not have been sent; the query to list them with `wrangler d1 execute` (`SELECT id, task_slug, total_tried, updated_at FROM payload_jobs WHERE has_error = 1 AND json_extract(error, '$.message') LIKE '[jobs] Stranded%'` — verify the column names against `src/migrations/20260921_200000_add_payload_jobs.ts` before writing them down).

- [ ] **Step 2:** Append an "Exit" section to this plan: tests added, the full site suite result, knip result, and anything the shipped code contradicted.

- [ ] **Step 3: Commit.**

```bash
git add docs/deployment-checklist.md docs/superpowers/plans/2026-09-23-job-reaper.md
git commit -m "docs: what a recovered or abandoned job looks like to an operator"
```

## Exit

- **Task 1** (`a875d8c`, fix round `25802c0`): `src/jobs/reapStrandedJobs.ts`, wired into `endpoints/jobs.ts` inside the lease before `handleSchedules`. 10 int tests: release, fail-at-budget, sweep filed failed, the 29-minute and exact-30-minute boundaries, non-processing untouched, unknown task slug, `REAP_LIMIT` (51 seeded → 50 reaped), and two through the endpoint (a stranded scheduled row no longer blocks its schedule; a throwing reaper still drains the queue and releases the lease). Each endpoint case was seen failing with the fix removed.
- **Task 2** (`567a96e`, plus `78834c4`): `AbortSignal.timeout(10_000)` on Mollie, the three Mux calls and the OpenPanel relay; the email binding documented as deliberately untimed. `mollieRequest` refuses a caller `signal` at the type level rather than silently replacing it.
- **Task 3**: `docs/deployment-checklist.md` step 8 describes the recovery log line, the duplicate/lost-message consequences, and a query for abandoned jobs (column names checked against `20260921_200000_add_payload_jobs.ts`).
- Full site suite 1830/1830 after Task 2; knip, `bun check` and `check-types` clean.

**What the shipped code contradicted:**
- Payload's `deleteJobOnComplete` defaults to `true` (`payload/dist/config/defaults.js:64`), so a job that succeeds is deleted and cannot be read back. The endpoint tests prove a fresh job ran through the prune sweep's own log line and a sent message in the outbox, not through the row.
- `payload.update` accepts `totalTried`, `error` and `hasError` on `payload-jobs` through the Local API; no `payload.db` write was needed outside the test fixtures.
- No existing test covered `createMuxAssetFromUrl` directly, or a rejected OpenPanel relay; both were added against the code's actual contract (the relay swallows and answers 202).

## Rulings made during execution

Copied from the SDD ledger when the branch review closed. Each reads: what was decided — why — what it costs if wrong.

- T1 case 9 (reaper read throws) may use vi.spyOn on the Payload instance's find filtered to collection "payload-jobs" for one call — no new export for testability — cost if wrong: a slightly brittle test.
- plan sketch of reapStrandedJobs is guidance; shipped Payload types win (e.g. retries typed number|config) — cost if wrong: none.
- Important fixed by controller at the type level (init: Omit<RequestInit,"signal">) — compile-time guard beats a comment; check-types + mollie 28/28 green — cost if wrong: none; no re-review needed for a one-line type narrowing that typechecks.
- Minor parked — the swallow contract is pinned by the 202; logging is observability — cost if wrong: a silent swallow regression goes untested.
- Task 3 (two doc edits) done inline by controller — a subagent per 20-line doc edit costs more than it buys; the final review covers it — cost if wrong: docs slip past a task gate.
- fix I1 — reaper writes via payload.db.updateOne (as Payload's own runner files unregistered tasks), per-row try/catch counting errors, case 7 forces an unregistered slug via forceRow — a deregistered task row otherwise halts reaping for every older row (confirmed) — cost if wrong: none.
- fix I2 — state the real invariant (the whole run ends within 30 min of its claim; guaranteed for scheduled runs, and for HTTP callers only when they bound their own time); add --max-time 600 to every checklist curl of /api/jobs/run — cheap, closes a double-send on a slow manual run — cost if wrong: a manual curl run is cut at 10 min and becomes an ordinary killed run.
- fix I3 — correct render.ts's "no asset was created" comment; pass Mux `passthrough` (a non-personal render/sponsorship id) on asset create so an orphan from a timed-out create is traceable in the Mux dashboard; log the possibility on a create timeout — cost if wrong: an orphan still bills until someone looks, but it is findable.
- fix all minors — comment accuracy (37-38, 45-48, copied Mollie/analytics comment, Review Focus label), rename TimeoutError tests to what they pin, add a released-row-runs-next-tick test, filter the reaper by queue — cost if wrong: none.
- timeout detection read by `name` without instanceof (controller, same commit as plan premise correction) — DOMException's Error lineage on workerd untested — cost if wrong: none.
- accept passthrough `render:<id>` (Lambda job id unbounded vs 255 cap); accept orphan logged-not-prevented (as ruled); accept theoretical 50-row starvation by permanently unwritable rows (errored count is logged every tick, so it is visible).

**Parked for later:** the reaper writes only plain fields through `payload.db.updateOne`; adding an array or localized field to that write would make the adapter rewrite (and so delete) the job's `log` rows.
