# Stage 7: Email and Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The application can send mail, and the four scheduled jobs the spec names actually run — so that a sponsor gets their re-edit link, an abandoned checkout stops blocking a gesture, and an expired sponsorship comes off the page without anybody watching.

**Architecture:** A ~50-line Payload email adapter over Cloudflare's `send_email` binding (there is no official adapter). Jobs are Payload's own queue, driven by a Cloudflare Cron Trigger calling `GET /api/payload-jobs/run` — Workers cannot run a long-lived scheduler, so `autoRun` is unavailable and this is Payload's documented serverless pattern. Two of the four job *operations* already exist and are mutation-proven from Stage 6; this stage schedules them rather than rewriting them.

**Tech Stack:** Payload 3.89.0 on Cloudflare Workers + D1 + R2, Cloudflare Email Service `send_email` binding, Cron Triggers, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md` — "Jobs and scheduling", "Custom endpoints", the email row of the decision table, and every "Stage 7" deferral recorded in Stages 4, 5 and 6.

---

## What this stage inherits, and must not rebuild

Six stages deferred work here. All of it is written down; none of it is optional.

| from | item |
|---|---|
| Stage 4 Task 5 | The email-change confirmation link is **logged to the console**, not sent. The code point is marked. |
| Stage 5 Task 8 | **The admin has no way to deliver a re-edit link.** The token is minted, stored and `hidden: true`, and nothing reads it. |
| Stage 5 exit | **An abandoned `pending_payment` row blocks its gesture** until `cleanup-stale-payments` exists. A live gap since Stage 5. |
| Stage 5 exit | Nothing sweeps an **orphaned `media` upload** (a logo stored just before a failed write). |
| Stage 6 Task 5 | `expireSponsorships` and `settleComposedVideos` **are built and mutation-proven**. Schedule them; do not rewrite them. |
| Stage 6 Task 5 | The readiness sweep **can starve** on a backlog larger than one page — key it off an index. |
| Stage 6 exit | The **generic `claims` collection** belongs here, now that there are four consumers. |
| Stage 2/4 | Payload's own `forgotPassword` writes its reset link to the console for the same reason. |

## BLOCKED, and on what

**One thing gates sending anything at all: a verified sender domain.** Checked
against Cloudflare's own documentation rather than assumed —
`E_SENDER_NOT_VERIFIED` ("Sender domain not verified") and
`E_SENDER_DOMAIN_NOT_AVAILABLE` ("Domain not onboarded to Email Service") are
the two failures a Worker gets without it. That is a DNS action on the
product owner's domain, not a code change.

**Two constraints that shape the design, from the same source:**

- **Recipients are *not* restricted by default.** `allowed_destination_addresses`
  is an optional allowlist (`E_RECIPIENT_NOT_ALLOWED` fires only when it is
  set). So transactional mail to arbitrary sponsors is possible — **leave that
  list unset**, and Task 1 asserts the config does not carry one, because
  setting it silently drops mail to everybody else.
- **There is a daily quota** (`E_DAILY_LIMIT_EXCEEDED`). The exact number is
  not in the error table. `send-renewal-reminders` is the job that can hit it,
  and Task 5 is written so a quota refusal defers rather than drops.

Tasks 1–6 are buildable and verifiable now against a local fake binding.
**Task 7 is first contact and is blocked.** The standing precedent is Stage 4's
Google strategy and Stage 6's whole render pipeline: a fake proves the shape
of a protocol and never the provider's behaviour.

## Global Constraints

- **Payload pinned at 3.89.0.** 3.90.x raises PBKDF2 to 600,000 against workerd's 100,000 cap.
- **Bundle: 7.34 MiB gzipped of 10.00 MiB, ~2.66 MiB headroom.** Stage 5 cost +26.75 KiB and Stage 6 cost +8.57 KiB by refusing SDKs — Mollie's at +165.71 KiB, Remotion's at +753.39 KiB. **Measure any dependency before adding it.** The `send_email` binding needs none.
- **No `app/**/route.ts` may import Payload** — ~519 KiB and its own bundle entry. CI enforces it.
- **There are no transactions**, and **a `where` on an update is a SELECT**. The only atomic primitive is a unique index, evaluated inside the INSERT. Payload's own `unique` pre-check is a read then a write and does not serialise.
- **A collection `beforeChange` sees the whole merged document**, so a write that changes no status passes `enforceStatusTransitions`. Guards of the form "not to a cancelled row" live where the write is made.
- **A client built at module scope from an unset variable is dead on import** (`createMollieClient({apiKey:""})` killed a build). Read configuration per call.
- **`.wrangler/state/vitest` is persisted**; a schema change invalidates it and fails a *different set of files* every run.
- **`isolate: false`** — module singletons and `localStorage` outlive a file; `vitest.setup.ts` clears `localStorage` per test. `process.env.X = undefined` leaves the string `"undefined"`; `delete` unsets it.
- **knip fails on an exported symbol nothing imports.** `void` and bitwise operators are banned by Biome.

## Review Focus

1. **A job runs twice because the cron fired twice, or a run overlapped a slow previous run.** `GET /api/payload-jobs/run` is a URL; nothing stops two invocations. Three of the four jobs have irreversible effects. → Task 2.
2. **`GET /api/payload-jobs/run` is a public URL that executes work.** Unauthenticated, it is a free denial-of-service and a way to force mail. → Task 2.
3. **A renewal reminder is sent twice, or to a sponsorship that has since been cancelled.** `renewalReminderSentAt` exists and nothing writes it. → Task 5.
4. **A queued email is retried for ever against a permanent failure.** A bad address and a quota refusal are different: one must stop, one must wait. → Task 3.
5. **`cleanup-stale-payments` cancels a checkout the sponsor is still paying for.** Mollie's webhook can arrive after the sweep decides. → Task 4.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/site/src/email/adapter.ts` | The Payload email adapter over `send_email`. |
| `apps/site/src/email/render.ts` | Subject and body for each message. Pure. |
| `apps/site/src/collections/Claims.ts` | One generic claim, `key` unique. Replaces two tables. |
| `apps/site/src/endpoints/jobs.ts` | The authenticated run endpoint. |
| `apps/site/src/jobs/cleanupStalePayments.ts` | Cancels abandoned `pending_payment` rows. |
| `apps/site/src/jobs/sendRenewalReminders.ts` | One reminder, ~30 days out. |
| `apps/site/src/jobs/index.ts` | The four task definitions and their schedules. |

**Modified**

| File | Change |
|---|---|
| `apps/site/wrangler.jsonc` | The `send_email` binding and the Cron Trigger. |
| `apps/site/src/payload.config.ts` | `email:` and `jobs:`. |
| `apps/site/src/endpoints/account.ts` | Send the confirmation instead of logging it. |
| `apps/site/src/endpoints/sponsorships.ts` | Send the re-edit link. |
| `apps/site/src/collections/WebhookDeliveries.ts`, `RenderCompletions.ts` | **Deleted**, folded into `Claims`. |

---

### Task 1: The email adapter

**Files:** create `src/email/adapter.ts` + `.test.ts`; modify `wrangler.jsonc`, `payload.config.ts`.

- [x] **Step 1: Write the failing tests**

```ts
it("sends a message through the binding");
it("passes the sender, recipient, subject and body through unchanged");
it("builds a MIME message the binding accepts");
it("reports a send failure to the caller rather than swallowing it");
it("does not configure allowed_destination_addresses", () => {
  // Cloudflare's E_RECIPIENT_NOT_ALLOWED fires only when that list is set.
  // Setting it silently drops mail to every address not on it — which for
  // transactional mail is every sponsor and every user.
  expect(wranglerConfig().send_email?.[0]).not.toHaveProperty(
    "allowed_destination_addresses"
  );
});
it("reads the binding per call, not at module scope", () => {
  // `createMollieClient({apiKey:""})` threw in its constructor and killed a
  // whole `next build` from a file that had nothing to do with payments.
});
it("answers a quota refusal differently from a bad address", () => {
  // E_DAILY_LIMIT_EXCEEDED must defer; a rejected recipient must stop.
  // Task 3's retry policy is built on this distinction.
});
```

- [x] **Step 2: Run them and watch them fail**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/email/adapter.test.ts
```
Expected: FAIL on the missing import, not on an assertion.

- [x] **Step 3: Implement.** Payload's `EmailAdapter` shape is `{ name, defaultFromAddress, defaultFromName, sendEmail }`. The binding takes a MIME message; build it rather than reaching for a dependency — **measure anything you are tempted to add.**

- [x] **Step 4: Run until green.**

- [x] **Step 5: Mutation-prove**

| mutation | must fail |
|---|---|
| a send failure is swallowed | the failure test |
| `allowed_destination_addresses` added to the config | the allowlist test |
| the binding is captured at module scope | the per-call test |
| a quota refusal reported as a permanent failure | the quota test |
| the subject or recipient dropped from the MIME message | the passthrough test |

- [x] **Step 6: Commit.**

```bash
cd /home/user/smog && bun check && bun -F site check-types && bunx knip --no-progress --no-config-hints
git add -A && git commit -m "feat(site): send mail through the Cloudflare binding"
```

**Three corrections, made while implementing.**

1. **"The binding takes a MIME message" is wrong.** Two Cloudflare products
   share the name `send_email`. Email *Routing*'s binding takes an
   `EmailMessage` built from raw MIME via the workerd-only `cloudflare:email`
   module. Email *Service* — the product whose error table this entire stage
   is written against — additionally accepts a structured
   `EmailMessageBuilder`, `{ to, from, subject, text, html }`, and composes
   the MIME itself. The installed workerd types declare both overloads, so
   this is checked rather than recalled. The builder is taken: importing
   `cloudflare:email` would break `next build` and every test in this suite,
   which is the very trap Step 5's third mutation is about.
2. **The allowlist is not the only restriction, and `destination_address` is
   worse.** Cloudflare's "Configure send bindings" page lists
   `destination_address` (a *single* permitted recipient, which additionally
   *redirects* a message whose `to` is null or undefined) and
   `allowed_sender_addresses` beside `allowed_destination_addresses`. The test
   asserts the binding carries `name` and nothing else.
3. **`send_email` is not inherited from the top level.** wrangler's own config
   schema says it "must be specified in every named environment", so the test
   in the plan — which reads a top-level `send_email` — would have passed
   against two deployed Workers that could not send at all. The binding is
   declared in `env.staging` and `env.production`, and the test walks every
   environment.

---

### Task 2: The run endpoint, and one claim to replace two — Review Focus 1 and 2

**Files:** create `src/collections/Claims.ts`, `src/endpoints/jobs.ts` (+ tests), a migration; **delete** `WebhookDeliveries.ts` and `RenderCompletions.ts` and migrate their callers.

This is the refactor Stage 6 deliberately deferred until there were four consumers. There are: the Mollie webhook, the render callback, and two of the jobs below.

- [x] **Step 1: Write the failing tests**

```ts
// Review Focus 2 — the endpoint executes work.
it("refuses a run with no token");
it("refuses a wrong token");
it("compares the token in constant time");
it("answers a wrong token exactly as it answers a missing job queue");

// Review Focus 1 — two invocations.
it("runs the queue once when two invocations overlap", async () => {
  // A cron can fire twice and a slow run can be overlapped by the next one.
  // The claim is what serialises them; a `where` cannot — measured.
});
it("releases the claim when the run finishes, so the next tick runs");
it("releases the claim when the run throws");
it("does not hold the claim for ever if the worker dies mid-run", () => {
  // A claim with no expiry is a job that never runs again after one crash.
});

// The refactor.
it("serialises a Mollie webhook replay exactly as before");
it("serialises a render callback replay exactly as before");
it("keeps two consumers with the same key from colliding", () => {
  // One table, many kinds. A payment id and a render job id must not be able
  // to be the same string and shadow each other.
});
```

- [x] **Step 2: Run, implement, run.** `Claims` is `{ key: unique, kind, claimedAt, expiresAt }`; the key is namespaced by `kind` so two consumers cannot collide. **Re-run Stage 5's and Stage 6's concurrency mutations afterwards** — dropping `unique` must still fail their tests through the new table.

- [x] **Step 3: Mutation-prove**

| mutation | must fail |
|---|---|
| `unique` dropped from `key` | every concurrency test, in all three consumers |
| the token check removed | the refusal tests |
| `===` instead of constant time | the timing test |
| the key not namespaced by kind | the collision test |
| the claim never released | "the next tick runs" |
| the claim given no expiry | the dead-worker test |

- [x] **Step 4: Commit.**

**Five corrections, made while implementing.**

1. **`expiresAt` cannot be mandatory, and the plan's flat `{ key, kind,
   claimedAt, expiresAt }` hides the most dangerous decision in the table.**
   A `job-run` claim is a **lease** — it must lapse, or one crashed runner
   ends scheduled work for ever. A `mollie-delivery` or `render-completion`
   claim is a **receipt** — it must never lapse, because a render job id's
   claim expiring lets a retried Lambda callback (at-least-once delivery)
   create a second Mux asset, which is a bill every month for a video nothing
   points at. So `expiresAt` is nullable and the choice is per consumer, and
   both mistakes are silent. `lib/claims.ts` says so at length.
2. **`claimedAt` is `createdAt`.** Payload gives every collection one, the two
   tables this replaces relied on it for their `defaultColumns`, and nothing
   re-claims a row in place — so a second column would only be a second
   spelling of the same fact. Omitted.
3. **`GET /api/payload-jobs/run` is Payload's own endpoint and does not
   exist.** `config.jobs.enabled` is false until a task is registered, so
   Payload registers no jobs endpoint and no `payload-jobs` collection — and
   an endpoint Payload owns is not one this application can put a token in
   front of. The endpoint is **`GET /api/jobs/run`**, ours, in
   `src/endpoints/jobs.ts`. Measured while writing the tests:
   `payload.jobs.run()` in that state answers `noJobsRemaining` rather than
   throwing.
4. **The migration has to carry the existing rows across.** Creating an empty
   `claims` table and dropping the two old ones passes every schema assertion
   and makes every completed render replayable. Each old row is copied under
   its namespaced key with `expires_at` NULL, and `migrations.test.ts` proves
   it by replaying the chain to the migration before the merge, inserting a
   row in each old table, and running the merge.
5. **A Cloudflare Cron Trigger does not call a URL.** It invokes the Worker's
   `scheduled()` handler; nothing in `wrangler.jsonc` can point a cron at a
   path. Task 5 will need worker-level wiring (an OpenNext `scheduled` export
   that fetches this endpoint) rather than a `"crons"` entry alone. Flagged
   here rather than solved, because Task 5 owns it.

---

### Task 3: The `send-email` task — Review Focus 4

**Files:** create `src/email/render.ts` (+ test), `src/jobs/index.ts` (the `send-email` task); modify `account.ts` and `sponsorships.ts` to queue instead of log.

- [x] **Step 1: Write the failing tests**

```ts
it("sends the email-change confirmation instead of logging it", () => {
  // Stage 4 Task 5 logs the link. `apps/site/src/endpoints/account.ts` marks
  // the line. Deleting that log without sending is the failure to avoid.
});
it("sends the re-edit link to the sponsor", () => {
  // Stage 5 Task 8: the token is minted, stored, `hidden: true`, and until
  // now nothing could deliver it. Read it back with `showHiddenFields: true`.
});
it("retries a quota refusal");
it("does not retry a rejected recipient", () => {
  // Review Focus 4. A bad address retried for ever is a queue that never
  // drains and a log nobody reads.
});
it("gives up after a bounded number of attempts, and records why");
it("does not put the re-edit token in a log line");
it("renders every message in the recipient's locale");
```

- [x] **Step 2-4:** run, implement, run, mutation-prove each guard, commit.

**Seven corrections, made while implementing.**

1. **`endpoints/sponsorships.ts` does not log a re-edit link, and never did.**
   The plan lists it beside `account.ts` as a place that logs instead of
   sending; `account.ts` does, and this one has no such line anywhere. Nothing
   in this application has ever produced a re-edit link for anybody — Stage 5
   deliberately dropped the shipped product's "generate link" button, because
   `hooks/manageReEditToken.ts` makes *moving the status to
   `pending_resubmission` in the admin panel* the action that mints the token.
   So the queue point is a collection `afterChange` hook,
   `hooks/queueReEditEmail.ts`, and no endpoint is involved at either end.
2. **Registering the first task opens a second, unauthenticated-by-default
   door into the queue.** `config.jobs.enabled` flips, and Payload mounts
   `GET /api/payload-jobs/run` on the jobs collection gated on
   `jobs.access.run ?? defaultAccess` — where `defaultAccess` is
   `Boolean(user)`. Task 2 put a shared secret, a constant-time comparison and
   a lease in front of `GET /api/jobs/run`; task registration would have handed
   **every signed-in account** a URL that runs the same queue with none of
   them. `jobs.access.run` is `() => false`, and the test asserts anonymous, a
   signed-in non-admin and an admin.
3. **A credential cannot travel in a job's input.** Payload logs the *whole
   job*, `input` included, every time a task throws
   (`queues/errors/handleTaskError.js`), and this task's retry policy makes a
   throw an ordinary event. So the plan's "queue instead of log" cannot mean
   "queue the link": the confirmation token is now minted by the send
   (`lib/emailChange.ts`), the re-edit token is read back at send time with
   `showHiddenFields: true`, and the queue carries identifiers only. The
   request that starts an address change therefore also has to clear the
   previous token, or a link already sitting in the old address's mailbox
   would confirm the new one.
4. **Payload runs a tick's jobs through `Promise.all`.** With no transactions
   that is two writers on one row: two `send-email` jobs for one account died
   on `Failed query: insert into "users_sessions" …` the first time this
   file's tests ran, because updating a document rewrites its array tables.
   `endpoints/jobs.ts` now passes `sequential: true`, which is the property
   the run lease already gives *between* ticks, applied inside one.
5. **`payload-jobs` needs no `payload_locked_documents_rels` rebuild**, unlike
   every other collection added since Stage 1: the jobs collection sets
   `lockDocuments: false`, so Payload adds no relationship column. The
   migration is two `CREATE TABLE`s, and `migrations.test.ts` asserts the
   absence as well as the presence.
6. **"Renders every message in the recipient's locale" is only half
   answerable.** The address change carries the locale of the form the account
   holder submitted. A `sponsorships` row records no language at all, so the
   re-edit invitation renders in the site default — `req.locale` is available
   and deliberately unused, because on an admin write that is the
   administrator's editing locale, not the sponsor's.
7. **`retries.attempts: 3` permits four executions, not three.** Payload gives
   up when the task's own `totalTried` has *reached* `attempts`
   (`handleTaskError`), so the bound the test asserts is a literal 4.

---

### Task 4: `cleanup-stale-payments` — Review Focus 5, and Stage 5's live gap

**Files:** create `src/jobs/cleanupStalePayments.ts` + `.int.test.ts`.

The spec: hourly, cancels `pending_payment` rows older than 24 hours. **This closes the gap where an abandoned checkout blocks its gesture** — recorded at Stage 5's exit as live until this exists.

- [x] **Step 1: Write the failing tests**

```ts
it("cancels a pending_payment sponsorship older than the window");
it("leaves a younger one alone");
it("leaves one that has a molliePaymentId alone", () => {
  // Review Focus 5. A row with a payment id is a checkout in flight at
  // Mollie; the webhook may still arrive. Cancelling it takes money for a
  // sponsorship the sponsor will never get.
});
it("frees the gesture it was blocking", () => {
  // The positive beside the negative: assert through `lib/sponsorSelection.ts`
  // that the gesture is buyable again, not merely that a status changed.
});
it("is idempotent, and the second run is stopped by the claim not the status");
it("does not cancel a row the webhook advanced mid-sweep");
```

- [x] **Step 2-4:** run, implement, run, mutation-prove, commit.

**Six corrections, made while implementing.**

1. **A lease's clock is not the sweep's `now`, and conflating them unlocks
   every live lease.** The sweep takes a `now` so a test can move the *window*
   rather than backdate `createdAt`, which Payload owns. The first version
   compared lease expiries against that same `now` — and a sweep asked to
   treat everything older than "25 hours from now" as abandoned then deleted
   every unexpired lease in the table, including one another sweeper was
   holding. A lock that unlocks itself for whoever asks the biggest question
   is not a lock. Lease expiry reads the real clock, as `takeClaim`'s own
   `clearExpired` does; the window reads `now`. Caught by a failing test, and
   the assertion that caught it is still there.
2. **The re-read guard narrows the webhook race and does not close it.** What
   closes it is `hooks/enforceStatusTransitions.ts` refusing
   `pending_approval -> cancelled`, so a payment landing *after* the re-read
   makes the write fail rather than succeed quietly. Both are needed: the
   guard alone is a race, the transition table alone turns an ordinary event
   into an error log.
3. **The claim is not what makes the sweep idempotent — the status is.** A
   cancelled row leaves the candidate query, and a second cancellation would
   be a no-op `canTransition` permits anyway. The claim divides the work of
   two *overlapping* sweeps at row granularity. The test says which mechanism
   stopped which run, because a test that merely ran the job twice would not.
4. **It is a lease that is kept when the sweep succeeds** — which is what
   makes the plan's sentence true — and the job clears its own lapsed leases
   at the start of every run, because nothing else ever would. A receipt would
   mean a sweeper that died between claiming and cancelling left that
   sponsorship claimed for ever and its gesture unsellable for ever: this
   job's own lock recreating the gap the job exists to close.
5. **The lease's expiry is provable only structurally.** The behaviour it
   guards is a process dying mid-sweep, which a test inside that process
   cannot stage — the ordinary failure path releases the claim itself, and is
   tested. The mutation that turns the lease into a receipt is caught by
   asserting the stored `expiresAt`, and that is recorded as a structural
   assertion rather than dressed up as a behavioural one.
6. **This task builds the operation, not the schedule.** `src/jobs/index.ts`
   registers only `send-email`; `cleanupStalePayments` is called by nothing
   yet, exactly as `expireSponsorships` has been since Stage 6. Task 5 owns
   all four schedules.

---

### Task 5: `send-renewal-reminders`, and scheduling what already exists — Review Focus 3

**Files:** create `src/jobs/sendRenewalReminders.ts` + `.int.test.ts`; extend `src/jobs/index.ts` with all four schedules; modify `wrangler.jsonc` with the Cron Trigger.

`expireSponsorships` and `settleComposedVideos` are **already built and mutation-proven** (Stage 6 Task 5). Schedule them. Do not rewrite them.
`cleanupStalePayments` is too, as of Task 4.

**Two things Task 3 found that this task will trip over.**

- **`payload.jobs.run` does not schedule anything.** A task's `schedule`
  property is acted on by `payload.jobs.handleSchedules`, which Payload's own
  `GET /api/payload-jobs/run` calls before running the queue
  (`queues/endpoints/run.js`) and which the Local API's `run` does *not*
  (`queues/localAPI.js`). `endpoints/jobs.ts` uses the Local API — it has to,
  because Payload's endpoint is now closed to everybody — so a `schedule`
  added to a task without also calling `handleSchedules` from that endpoint is
  four jobs that are never queued and a cron that appears to work.
- **`jobs.access.run` is `denyAll`**, so nothing reaches the queue except
  `GET /api/jobs/run` with its token. Whatever wiring calls the cron must go
  through that path.

- [x] **Step 1: Write the failing tests**

```ts
it("sends one reminder about thirty days before expiry");
it("writes renewalReminderSentAt", () => {
  // The column exists since Stage 1 and nothing has ever written it.
});
it("does not send a second reminder", () => {
  // Review Focus 3, and the reason the column exists.
});
it("does not remind a cancelled or expired sponsorship");
it("defers rather than drops when the daily quota is refused", () => {
  // E_DAILY_LIMIT_EXCEEDED. A reminder that is dropped is a renewal nobody
  // was asked for; one that is deferred arrives a day late.
});
it("reads the readiness sweep off an index, not a scan", () => {
  // Stage 6 Task 5 flagged starvation: a backlog larger than one page
  // leaves an old render behind every healthy live asset.
});
it("registers all four tasks with the schedules the spec names");
```

- [x] **Step 2-4:** run, implement, run, mutation-prove, commit.

**Eight corrections, made while implementing.**

1. **Adding a `schedule` is a schema change, and the plan says nothing about
   one.** Three things arrive with the first `schedule` property, none of them
   declared by any collection file, and all three are silent when missing.
   `sanitize.js` pushes a **`payload-jobs-stats` global** — a table —
   because `handleSchedules` keeps each task's `lastScheduledRun` in it and
   computes the next occurrence *from* that value; without it every tick throws
   on `findGlobal`, **after** the run lease has been taken, which would make
   the first missing table the last time the queue ever ran. It also adds
   **`payload_jobs.meta`**, where `handleSchedules` writes
   `{ scheduled: true }` and which `defaultBeforeSchedule` counts on to decide
   whether a schedule is already covered — without the column an hourly cron
   queues a daily job twenty-four times a day. The third is
   `renders.settled_at`, below. `20260921_220000_add_job_schedules` is the
   migration; `payload_locked_documents_rels` is untouched, because a global is
   locked through `payload_locked_documents.global_slug` rather than through a
   relationship column, and `migrations.test.ts` asserts the absence.
2. **The Cron Trigger is not reachable from this codebase, and `wrangler.jsonc`
   carries no `"crons"` entry.** Task 2 flagged that a Cron Trigger invokes the
   Worker's `scheduled()` handler rather than calling a URL; what Task 5 found
   is that this application cannot export one. The entry module is
   `.open-next/worker.js`, which `@opennextjs/cloudflare` copies verbatim from
   its own template on every build and which exports `fetch` and three Durable
   Objects and nothing else, with no configuration hook to add to it. Reaching
   `scheduled()` means pointing `main` at a wrapper of ours — a build-entry
   change whose only proof is a deployed Worker and which cannot be typechecked
   in a tree where `.open-next` has not been built. **A `"crons"` entry without
   it would be worse than none**: every firing errors while the dashboard shows
   a configured cron. So the entry is a comment saying exactly what Task 7 must
   add, and the half that can be proven without a deploy is `src/jobs/cron.ts`,
   unit-tested — the request the handler makes, dispatched into the Worker's own
   `fetch` rather than out over the network, because
   `global_fetch_strictly_public` would send a self-fetch through the edge.
3. **The spec names four tasks and five operations.** `settleComposedVideos`
   has no task of its own: it runs inside `expire-sponsorships`, after the
   expiry, because it deliberately skips a render whose sponsorship is terminal
   on the grounds that its asset is about to be deleted — which is only true if
   the expiry has already run in the same job. Two tasks with two cron
   expressions would make that guarantee a coincidence.
4. **"Key it off an index" cannot be done with an index.** Indexing the
   readiness sweep's existing candidate column changes nothing about
   starvation: the set is still every healthy live asset the product has ever
   made, so one page of it is still the same page for ever. What ends the
   starvation is a column the sweep *writes* — `renders.settledAt`, stamped
   when Mux calls an asset `ready`, which is terminal — so the set becomes the
   work outstanding and drains. Only `ready` settles; `preparing` is not a
   verdict, and settling it would take an asset out of the set on the strength
   of an answer that has not been given.
5. **The orphan sweep was starving too, and that is the half with money
   attached.** `expireSponsorships` read one page of every render holding an
   asset and then kept the ones whose `sponsorship` was null — so with more
   live assets than fit in a page, an orphan behind them was never in the page
   to be kept. An orphan is the one row nobody ever notices: a Mux bill every
   month for a video nothing points at. It is now its own query on the indexed
   `sponsorship` column, and the test asserts it through a render the readiness
   sweep has already settled, which the old code could not have reached.
6. **`renewalReminderSentAt` is written by the send, not by the sweep** — the
   one place this port departs from `startRenewalReminderCronJob`, which marks
   it immediately after its enqueue. Stamping at queue time makes the plan's own
   "defer, not drop" impossible: the deferral the reminder is supposed to
   survive would already have been recorded as a reminder that was sent. The
   cost is the ordinary at-least-once cost, and it is the right way round — a
   sponsor reminded twice has been mildly annoyed, a sponsorship that lapsed
   because the reminder was filed as sent is revenue nobody can get back.
7. **The shipped reminder contradicts itself and the contradiction was not
   transcribed.** `RenewalReminderEmail`'s footer says the sponsorship ends "over
   ongeveer 7 dagen" while the query that selects its recipients is
   `daysUntilExpiry: 30`. The copy here says thirty, because that is the number
   the job applies.
8. **A test-method finding, and the third of this shape in this stage.** An
   assertion about "the queue" or "the sweep's count" in a database that is
   never cleared is an assertion about how many times the suite has been run.
   A mutation run turned up `expected [ …(12) ] to have a length of 1` in a
   test that had passed four times, from fixtures earlier runs left behind —
   the mutation was innocent and the test was wrong. Every count here is now
   scoped to the row under test, and both new files delete their own leftovers
   before they seed.

---

### Task 6: The orphaned-media sweep

**Files:** extend `src/jobs/cleanupStalePayments.ts` or add a sibling — decide and say which.

Stage 5 recorded it: a logo stored just before a failed write survives with nothing pointing at it, and Stage 6 added the same shape for a `media` row a re-edit abandoned.

- [x] **Step 1: Write the failing tests**

```ts
it("removes a media row nothing references");
it("keeps one a sponsorship references");
it("keeps one a draft still in flight references", () => {
  // The dangerous half. A sweep that runs while a sponsor is on step 3 must
  // not delete the logo they just uploaded. Bound it by age, not only by
  // reachability, and assert the boundary.
});
it("deletes from R2 only after the row is gone, and survives a missing object");
```

- [x] **Step 2-4:** run, implement, run, mutation-prove, commit.

**Five corrections, made while implementing.**

1. **A sibling, and here is which.** `src/jobs/cleanupOrphanedMedia.ts`,
   registered inside the existing hourly `cleanup-stale-payments` task. The
   modules are split because they are two operations with nothing in common
   but a cadence — different collections, and dangerous in different ways, one
   cancelling a purchase and the other destroying a file. They share the
   *task* because they share a clock, and because that is what keeps the
   spec's four tasks four.
2. **Reachability alone would delete an administrator's library, and the plan
   does not mention it.** `media` is a general collection and `media.create`
   is `isAdmin`, so an administrator may upload to it — and an image they have
   uploaded but not yet used is *exactly* as unreferenced as an abandoned
   logo. A sweep that removed every unreferenced row would delete it a day
   later, silently and with no way back. The sweep is therefore narrowed to
   the filenames this application writes: `endpoints/sponsorships.ts` names
   every logo itself, because a client-supplied name is a client-supplied R2
   key, and `SPONSOR_LOGO_PREFIX` now lives in `lib/sponsorDraft.ts` so the
   name a logo is written under and the name a sweep looks for cannot drift.
3. **"Nothing references it" has to mean any status, not any *live* status.**
   A cancelled or expired sponsorship is still the record of what a sponsor
   was sold and what an administrator approved, and the admin panel and
   `lib/renderPreview.ts` both render its overlay. Narrowing the reachability
   query to `active` deletes the evidence behind every finished sponsorship a
   day after it ends, and no test about an active one would notice — so there
   is a test about a cancelled one.
4. **"Delete from R2 only after the row is gone" is already true, by
   construction, and the useful version of the test is the other direction.**
   The sweep never touches R2 at all: it deletes the `media` document, and
   `@payloadcms/plugin-cloud-storage`'s `afterDelete` removes the object
   afterwards and swallows its own failures. So the assertion that bites is
   that a row whose deletion *fails* still has its file — the other order
   leaves a `media` row pointing at nothing, which is a broken image on a
   sponsor's page rather than a stray object in a bucket. The mutation that
   catches it deletes the row through `payload.db.deleteOne`, bypassing the
   hook, and the test notices the object surviving.
5. **No schema change, checked rather than assumed.**
   `sponsorships.overlay_image_id` is already indexed and so is
   `media.created_at` — Payload indexes relationship and timestamp columns by
   default — so both halves of the candidate query and the reachability lookup
   are index reads, and this task adds no migration.

---

### Task 7: First contact — BLOCKED until the sender domain is verified

**Do not start without the product owner's go-ahead.** This sends real mail.

- [ ] Verify the sender domain and onboard it to Cloudflare Email Service; record the steps in `apps/site/README.md`.
- [ ] Set the run-endpoint token and any mail configuration as Worker secrets — **as environment variables, never pasted into a transcript.**
- [ ] **Wire the Cron Trigger, which Task 5 could not.** A Cron Trigger invokes
  the Worker's `scheduled()` handler, and OpenNext's generated
  `.open-next/worker.js` exports only `fetch` and three Durable Objects — so
  this means pointing `main` at a wrapper module that re-exports those and adds
  `scheduled`, calling `runScheduledTick` (`src/jobs/cron.ts`, already
  unit-tested) with the generated worker's own `fetch`. Then the `"crons"`
  entry, `SITE_ORIGIN` as a var and `JOBS_RUN_TOKEN` as a secret, per
  environment. `wrangler.jsonc` carries the whole list as a comment and
  deliberately carries no `"crons"` key until then: a cron on a Worker with no
  `scheduled` export errors on every firing while the dashboard shows it
  configured.
- [ ] Send one of each message on staging and record what differed from the fake. **Expect something to differ.**
- [ ] Find and record the actual daily quota.
- [ ] Confirm the Cron Trigger fires and the run endpoint refuses an unauthenticated call in production.

---

### Task 8: Stage exit

- [ ] Re-measure the bundle against **7.34 MiB** and state whether Stages 8–10 fit.
- [ ] Confirm no `app/**/route.ts` imports Payload.
- [ ] **Re-run Stage 5's and Stage 6's concurrency mutations through the new `Claims` table** — both must still bite.
- [ ] `bun release:check` green; `site-e2e` green.
- [ ] State whether each exit criterion is met, and **name every one met only against a fake.**

## Stage 7 exit criteria

1. The application sends mail through the binding, and a failure reaches the caller.
2. `GET /api/payload-jobs/run` refuses an unauthenticated call and cannot be made to run twice concurrently.
3. One `Claims` table serialises the Mollie webhook, the render callback and the jobs, and the earlier stages' concurrency mutations still fail their tests through it.
4. The email-change confirmation and the sponsor's re-edit link are sent, not logged.
5. A queued email retries a transient refusal, stops on a permanent one, and never logs a token.
6. An abandoned `pending_payment` row is cancelled and its gesture becomes buyable again — **the gap Stage 5 recorded as live is closed.**
7. One renewal reminder is sent per sponsorship, recorded in `renewalReminderSentAt`, never twice.
8. `expire-sponsorships` and the readiness sweep run on schedule, and the sweep cannot starve.
9. An orphaned media row is removed without touching one a sponsor is still using.
10. The bundle is measured and recorded, and every criterion is marked real or fake.
