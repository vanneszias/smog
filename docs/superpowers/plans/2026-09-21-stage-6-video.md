# Stage 6: Video Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sponsor's logo and text are composited onto the gesture video by Remotion Lambda, the result is uploaded to Mux, and the sponsored video replaces the original on the public page for the life of the sponsorship — with every step resumable, because nothing here is transactional and renders take minutes.

**Architecture:** The Worker never renders. It submits a job to Remotion Lambda, records the job id, and returns. Lambda calls back to `POST /api/render/callback` with a signed body; the callback uploads to Mux and advances the sponsorship. Render state lives in a `renders` collection with a unique job id — the same claim mechanism Stage 5's `webhook-deliveries` established, for the same reason.

**Tech Stack:** Remotion Lambda (AWS), Mux, Payload 3.89.0 on Cloudflare Workers + D1 + R2, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md` — "Custom endpoints", "Jobs and scheduling", "Stage 0 gates" item 1 (the Lambda decision), and everything Stage 5 carried out.

---

## BLOCKED ON CREDENTIALS — read before starting

**This stage cannot be finished without two things nobody has supplied.**

| need | state | what it gates |
|---|---|---|
| Mux `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | **absent** | every upload, every asset delete, every signed playback URL |
| A Remotion Lambda function deployed to an AWS account, plus its region and bucket | **not deployed** | every render |

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` happen to be present in the
build environment. **They are not authorisation.** Deploying a Remotion
Lambda creates billable AWS resources — a Lambda function, an S3 bucket, and
a per-render cost — in an account this plan has not been told belongs to this
project. No task here deploys anything until the product owner says which
account to use and that they want it.

**What this means for the plan, stated honestly rather than worked around:**

- Tasks 1–5 are **fully buildable and verifiable now**, against a local fake
  Lambda and a local fake Mux. They are the majority of the code: the state
  machine, the callback's authentication and idempotency, the Mux source
  endpoint, the seam replacement, and the expiry path.
- Task 6 is the **first contact** with real services and cannot be done
  without the two rows above.
- Stage 4's Google strategy is the precedent and the warning: proven end to
  end against a local fake OpenID provider, and still unproven against real
  Google. A fake proves the shape of a protocol, never the provider's
  behaviour. **Do not let Tasks 1–5 passing read as "the video pipeline
  works."**

## Global Constraints

Copied from the spec and from what five stages established. Every task's requirements implicitly include this section.

- **Payload is pinned at 3.89.0.** 3.90.x raises PBKDF2 to 600,000 iterations against workerd's 100,000 cap.
- **Bundle: 7.33 MiB gzipped of 10.00 MiB, 27% headroom**, shared with Stage 7. Stage 5 cost +26.75 KiB by using `fetch` over SDKs and endpoints over route handlers. **The Remotion and Mux SDKs are both candidates for the same treatment — measure before adding either.** `@remotion/lambda` in particular pulls the AWS SDK.
- **No `app/**/route.ts` may import Payload.** ~519 KiB gzipped and its own bundle entry. Writes are Payload endpoints plus a `next.config.ts` rewrite. CI enforces it.
- **There are no transactions.** The D1 adapter's `beginTransaction` resolves to `null`.
- **A `where` on an update is a SELECT, not a conditional UPDATE.** Measured: two concurrent conditional updates on one row both report a changed row. **The only atomic primitive is a unique index**, because SQLite evaluates it inside the INSERT. Payload's own `unique` pre-check is a read then a write and does not serialise either. See `collections/WebhookDeliveries.ts`.
- **Every sponsorship status change goes through `hooks/enforceStatusTransitions.ts`**, including with `overrideAccess`, and is logged by `hooks/logSponsorshipTransitions.ts`. Do not write a second logger.
- **A client built at module scope from an unset variable is dead on import.** `createMollieClient({ apiKey: "" })` throws in its constructor and killed a whole build. Mux's SDK has the same shape. Read credentials per call.
- **`.wrangler/state/vitest` is persisted and never cleared.** A new field is enough to invalidate it and make a *different set of files* fail every run.
- **knip fails on an exported symbol nothing imports.** `bun check` before committing; `void` is banned.

## Review Focus

Five things the spec implies that no task's happy path exercises.

1. **A render finishes after the sponsorship has been cancelled or rejected.** Renders take minutes; an admin can reject in that window. The callback must not resurrect a dead sponsorship, and `enforceStatusTransitions` will refuse the move — so the callback has to handle its own refusal rather than 500. → Task 3.
2. **Lambda calls back twice.** AWS retries on any non-2xx, and at-least-once is the contract. Two callbacks for one job must produce one Mux asset, not two — and an orphaned Mux asset costs money monthly, for ever. → Task 3.
3. **The callback is an unauthenticated public URL until it is not.** It carries a playback id that swaps the video on a public page. Anyone who can POST to it can put any video on any gesture. → Task 3, and it is the whole of Task 2.
4. **Mux accepts the upload and then fails to process it.** `asset.ready` is asynchronous and can end in `errored`. A sponsorship left pointing at an asset that will never play shows a dead player on the public page. → Task 5.
5. **Expiry must delete the Mux asset, and deletion is the one irreversible step.** `expire-sponsorships` restores the original video *and* deletes the sponsored asset. Deleting first and failing to restore leaves a gesture pointing at nothing. → Task 5.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/site/src/collections/Renders.ts` | One row per render job. Unique `jobId` is the claim. |
| `apps/site/src/lib/renderJob.ts` | Submit a composition; pure request-building, `fetch`-based. |
| `apps/site/src/lib/mux.ts` | Upload from a URL, poll readiness, delete an asset. `fetch`, no SDK. |
| `apps/site/src/lib/renderSignature.ts` | HMAC over the callback body. Shared by the endpoint and the tests. |
| `apps/site/src/endpoints/render.ts` | `POST /api/render/callback`, `GET /api/mux/source/:id`. |
| `apps/site/src/jobs/expireSponsorships.ts` | Restore the original video, then delete the Mux asset. |

**Modified**

| File | Change |
|---|---|
| `apps/site/src/lib/renderPreview.ts` | **The seam.** Replace the body, not the signature. |
| `apps/site/src/endpoints/sponsorships.ts` | Checkout submits a render after the payment is created. |
| `apps/site/src/collections/Sponsorships.ts` | Register the approval hook that copies the playback id onto the gesture. |
| `apps/site/next.config.ts`, `src/payload.config.ts` | Rewrites and registration. |

---

### Task 1: The render state machine and the `renders` collection

**Files:**
- Create: `apps/site/src/collections/Renders.ts`, `src/lib/renderState.ts` + `.test.ts`, `.int.test.ts`
- Create: a migration, DDL read back out of `sqlite_master` after `pushDevSchema`

**Interfaces:**
- Produces: `RENDER_STATES` (`queued` | `rendering` | `uploading` | `ready` | `failed`); `canAdvance(from, to): boolean`; the `renders` collection with `jobId` **unique**, `sponsorship` (relationship), `state`, `muxAssetId`, `muxPlaybackId`, `failureReason`, `attempts`.

- [x] **Step 1: Write the failing tests**

```ts
it("covers every state the collection can hold");
it("lets a queued render start and finish");
it("refuses ready -> rendering");
it("treats a state staying put as allowed");
it("lets nothing out of ready or failed");
it("claims a job id exactly once", async () => {
  // The `webhook-deliveries` lesson, applied. Two concurrent creates for one
  // job id: exactly one succeeds, and the loser arrives as a raw driver
  // error rather than a ValidationError, because Payload's unique pre-check
  // is a read then a write and does not fire.
  const [a, b] = await Promise.allSettled([claim(jobId), claim(jobId)]);
  expect([a.status, b.status].filter((s) => s === "fulfilled")).toHaveLength(1);
});
it("tells a duplicate claim from a database outage", async () => {
  // The claim confirms a failure by reading the row back. Without that, an
  // outage looks exactly like a replay and the render is silently dropped.
});
```

- [x] **Step 2: Run them and watch them fail**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/lib/renderState.test.ts src/collections/Renders.int.test.ts
```
Expected: FAIL on the missing import, not on an assertion.

- [x] **Step 3: Implement**

Model `Renders.ts` on `collections/WebhookDeliveries.ts` — read its doc block first; it explains why a unique index is the only mechanism that works here. `renders.access` is admin-only for read and write: nothing public ever needs a render row, and the callback runs `overrideAccess: true`.

- [x] **Step 4: Run until green, then `rm -rf apps/site/.wrangler/state`** — this task changes the schema, and a stale directory makes a *different* set of files fail on every run.

- [x] **Step 5: Mutation-prove**

| mutation | must fail |
|---|---|
| `unique` dropped from `jobId` | the concurrent-claim test |
| the claim treats every failure as a duplicate | the outage test |
| `canAdvance` returns `true` unconditionally | the refusal tests |
| a terminal state gains an outgoing edge | "lets nothing out of ready or failed" |
| the migration recreates the index as non-unique | `migrations.test.ts` |

- [x] **Step 6: Commit**

```bash
cd /home/user/smog && bun check && bun -F site check-types && bunx knip --no-progress --no-config-hints
git add -A && git commit -m "feat(site): track a render job, claimed exactly once"
```

---

### Task 2: The callback's signature — Review Focus 3

Do this **before** the callback does anything, so there is never a commit where the endpoint exists unauthenticated.

**Files:**
- Create: `apps/site/src/lib/renderSignature.ts` + `.test.ts`

**Interfaces:**
- Produces: `signRenderCallback(body: string, secret: string): Promise<string>`; `verifyRenderCallback(body: string, header: null | string, secret: string): Promise<boolean>`.

- [x] **Step 1: Write the failing tests**

```ts
it("accepts a body signed with the shared secret");
it("refuses a body that was altered after signing");
it("refuses a correct signature over a different body");
it("refuses an absent header, and an empty one");
it("refuses a signature of the right shape but wrong secret");
it("compares in constant time", () => {
  // Not a timing measurement — those are unstable in CI and would be a test
  // that fails on a busy machine rather than on a regression. This asserts
  // the *implementation*: that the comparison is `crypto.subtle.timingSafeEqual`
  // or an accumulate-then-compare loop, and never `===` on the hex strings.
  // A byte-by-byte `===` leaks the shared secret to anyone who can measure.
  expect(signatureSource()).not.toMatch(/===\s*expected/);
});
it("is a SHA-256 HMAC, so a length-extension does not forge one");
```

- [x] **Step 2-4:** run, implement with `crypto.subtle` (workerd has Web Crypto, not `node:crypto`), run again.

- [x] **Step 5: Mutation-prove**

| mutation | must fail |
|---|---|
| verification always returns `true` | every refusal test |
| the header is compared with `===` | the constant-time test |
| the secret is read from the body instead of the environment | the wrong-secret test |
| an absent header is treated as valid | the absent-header test |

- [x] **Step 6: Commit.**

---

### Task 3: `POST /api/render/callback` — where four of the five Review Focus items land

**Files:**
- Create: `apps/site/src/endpoints/render.ts` + `.int.test.ts`
- Modify: `apps/site/next.config.ts`, `src/payload.config.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("advances the render and stores the Mux ids");
it("refuses an unsigned body");                          // Review Focus 3
it("refuses a signature over a different body");

// Review Focus 2 — AWS retries, at-least-once.
it("is idempotent: the same callback twice uploads to Mux once");
it("answers 200 to a replay, so Lambda stops retrying");
it("survives two concurrent callbacks for one job", async () => {
  // The assertion that matters is the Mux call count, not the row state:
  // an orphaned Mux asset is a monthly bill for ever.
  expect(muxUploads).toHaveLength(1);
});

// Review Focus 1 — the world moved during the render.
it("does not resurrect a cancelled sponsorship");
it("does not resurrect a rejected one");
it("records the render as ready even when the sponsorship has moved on", () => {
  // The render *did* finish. Losing that fact means a retry re-renders and
  // pays for it twice. The sponsorship is what must not move.
});
it("answers 200 to all of those, so Lambda stops retrying a settled decision");

// Failure reporting.
it("records a failed render with the reason Lambda gave");
it("does not upload to Mux when Lambda reports a failure");
it("answers 502 when Mux is unreachable, so the callback is retried");

// The oracle.
it("answers an unknown job id exactly as it answers a known one");
```

- [ ] **Step 2-4:** run, implement, run.

**CORRECTED after Task 1 — this plan said to reuse Task 1's claim, and that
cannot work.** The `renders` row is created by the *submitter* (Task 4:
"checkout submits a render"), so by the time Lambda calls back the row
already exists. Two concurrent callbacks would both *lose* an insert against
it, and neither would upload. And it cannot be an `update` with a `where`,
however it is phrased: **a `where` on an update is a SELECT** — measured,
two concurrent conditional updates both report a changed row.

**Serialising the callbacks needs its own insert against its own unique
index.** Add a second collection — `RenderCompletions`, one row per `jobId`,
`unique: true` — inserted by the *callback* before any Mux call. First
callback inserts and proceeds; a replay's insert fails and is answered 200
with nothing done; a failure that is not a duplicate is confirmed by reading
the row back, so a database outage cannot masquerade as a replay. That is
`collections/WebhookDeliveries.ts`'s shape exactly, and Task 1's own doc
block already says so.

**Why not move row creation into the callback and drop `queued`.** It was
considered and rejected: the `queued` row is the only record that a render
is outstanding, and without it a render whose callback never arrives is
invisible — nothing could ever find it to retry. Keeping the submitter's
record is worth a second table.

**Why not generalise the two claim tables into one now.** There will be at
least four consumers — this, the Mollie webhook, and Stage 7's
`expire-sponsorships` and `cleanup-stale-payments`. A single `claims`
collection keyed on an opaque string is the right abstraction *then*, when
all four are visible and it can be done once. Doing it here means editing
Stage 5's shipped and mutation-proven webhook mid-stage to serve an
abstraction with two users. **Stage 7 owns that refactor**; this task adds
the second table and says why.

The claim goes **first**, before any Mux call. Order everything so the
irreversible step — creating a Mux asset, which Mux bills for monthly —
happens once and last, and so a crash between steps leaves a state a retry
can finish.

- [ ] **Step 5: Mutation-prove — 12 mutations**

| mutation | must fail |
|---|---|
| signature check removed | the unsigned test |
| the claim removed | the concurrency test |
| upload before claiming | the concurrency test |
| a non-2xx answer for a replay | "answers 200 to a replay" |
| 404 for an unknown job | the oracle test |
| the sponsorship advanced regardless of its status | the cancelled and rejected tests |
| a failed render still uploads | "does not upload on failure" |
| a Mux outage answered 200 | the 502 test |
| `overrideAccess: false` on the sponsorship write | the happy path |
| the rewrite removed from `next.config.ts` | the rewrite test |
| the failure reason dropped | the reason test |
| the render row not marked ready when the sponsorship has moved on | the "records ready anyway" test |

- [ ] **Step 6: Commit.**

---

### Task 4: `GET /api/mux/source/:id`, and the seam

**Files:**
- Create: the handler in `apps/site/src/endpoints/render.ts`
- Modify: `apps/site/src/lib/renderPreview.ts` — **replace the body, keep the signature**
- Modify: `apps/site/src/endpoints/sponsorships.ts` — submit a render at checkout

The spec: "issues a short-lived Mux source URL to the render container, behind a service token."

- [ ] **Step 1: Write the failing tests**

```ts
it("issues a source URL for a gesture's playback id");
it("refuses a request with no service token");
it("refuses a wrong service token");
it("answers a missing playback id the same way as a wrong token", () => {
  // Otherwise it enumerates which gestures exist, to anyone guessing.
});
it("issues a URL that expires");
it("does not issue one for an inactive gesture");

// The seam.
it("previewPlaybackId returns the composed video once there is one");
it("falls back to the original while the render is still running", () => {
  // Stage 5's contract, deliberately kept: a sponsor who reloads mid-render
  // sees the video they are sponsoring, not an error.
});
```

- [ ] **Step 2-4:** run, implement, run. Compare the service token with the same constant-time helper from Task 2 — a `===` here leaks it exactly as it would there.

- [ ] **Step 5: Mutation-prove** each guard, including that the expiry is real (a URL minted with no expiry must fail a test).

- [ ] **Step 6: Commit.**

---

### Task 5: Expiry, and Mux readiness — Review Focus 4 and 5

**Files:**
- Create: `apps/site/src/jobs/expireSponsorships.ts` + `.int.test.ts`

This is the job the spec schedules daily. Stage 7 owns the scheduler; **this task owns the operation**, so that Stage 7 wires up something already proven.

- [ ] **Step 1: Write the failing tests**

```ts
it("moves an in-term sponsorship to expired once its end date passes");
it("leaves an in-term one alone");
it("restores the gesture's original video before deleting anything", async () => {
  // Review Focus 5. The order is the whole test: deleting the Mux asset
  // first and then failing to restore leaves a gesture pointing at an asset
  // that no longer exists — a dead player on a public page, unrecoverable
  // because the asset is gone.
});
it("deletes the sponsored Mux asset after the restore succeeds");
it("leaves the asset alone when the restore fails");
it("is idempotent: running twice deletes once");
it("expires a sponsorship whose Mux asset is already gone", () => {
  // A manual deletion, or a previous half-run. The expiry must complete
  // rather than refusing for ever on a 404 from Mux.
});

// Review Focus 4.
it("marks a render failed when Mux reports the asset errored");
it("does not point a sponsorship at an asset that never became ready");
```

- [ ] **Step 2-4:** run, implement, run.

- [ ] **Step 5: Mutation-prove** — especially the ordering: swapping the delete and the restore must fail a test, and so must treating a Mux 404 as a failure.

- [ ] **Step 6: Commit.**

---

### Task 6: First contact — BLOCKED until credentials exist

**Do not start this task without the product owner's explicit go-ahead.** It deploys a Remotion Lambda (billable AWS resources) and creates real Mux assets.

- [ ] Deploy the Remotion Lambda function to the named account and region; record the function name, the bucket, and the deploy command in `apps/site/README.md`.
- [ ] Set `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `REMOTION_FUNCTION_NAME`, `REMOTION_REGION`, `RENDER_CALLBACK_SECRET` and `MUX_SOURCE_SERVICE_TOKEN` as Worker secrets — **as environment variables, never pasted into a transcript**.
- [ ] Render one real composition end to end on staging and record what differed from the fake. **Expect something to differ**; the fake proves the shape of the protocol, never the provider's behaviour.
- [ ] Re-measure the bundle and record the delta.

---

### Task 7: Stage exit

- [ ] Re-measure the bundle against 7.33 MiB and state whether Stage 7 still fits.
- [ ] Confirm no `app/**/route.ts` imports Payload.
- [ ] `bun release:check` green; `site-e2e` green.
- [ ] Re-run Stage 5's webhook concurrency mutations — this stage adds a second claim-based endpoint and they must still bite.
- [ ] State explicitly whether each exit criterion is met, and **name every one that is met only against a fake.**

## Stage 6 exit criteria

1. A paid sponsorship's logo and text are composited onto the gesture video and the result is uploaded to Mux.
2. The callback refuses an unsigned or altered body, and cannot be used to put an arbitrary video on a gesture.
3. Two callbacks for one render produce one Mux asset.
4. A render that finishes after its sponsorship was cancelled or rejected does not resurrect it, and is still recorded as finished.
5. `GET /api/mux/source/:id` issues an expiring URL only to a correct service token, and reveals nothing about which gestures exist.
6. Expiry restores the original video before deleting the sponsored asset, and completes even if the asset is already gone.
7. A sponsorship never points at a Mux asset that is not ready.
8. The bundle is measured and recorded, and no `app/**/route.ts` imports Payload.
9. **Every criterion above is marked as verified against real services or against a fake.** Stage 4's Google criterion is the precedent for why this one exists.
