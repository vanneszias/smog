# Stage 5: Sponsorships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sponsor can pick gestures, enter their details, pay through Mollie, and land in an admin approval queue — with every status transition enforced, logged, and idempotent under Mollie's retries.

**Architecture:** The seven-value status field becomes a real state machine: one pure transition table, one `beforeChange` hook that refuses everything not in it, and one `afterChange` hook that appends to `admin-logs` with `overrideAccess`. Payment is two REST calls to Mollie made with `fetch` rather than the 2.1 MB SDK. The wizard is three server-rendered pages posting to Payload endpoints behind rewrites, matching Stage 4's account pages — no client JavaScript except the pieces that genuinely need it.

**Tech Stack:** Payload 3.89.0, Next 16 App Router, Cloudflare Workers + D1 + R2, Mollie REST API v2, Vitest, Playwright, Biome, knip.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md` — sections "`sponsorships`", "Deferred from Stage 1", "Referential integrity", "There are no transactions on any write path", "Custom endpoints", "Access control".

---

## Decisions, confirmed by the product owner 2026-09-21

Both questions below were put to the product owner before Task 3 started.
Both were answered; neither is an open question any more.

1. **Ship the seam, keep the 5 → 6 order.** Confirmed. Task 7 renders the
   original video behind `lib/renderPreview.ts` and Stage 6 replaces the
   body, not the signature.
2. **`user-consents` gets its own stage, before cutover.** Confirmed as
   **Stage 8.5** in the spec's stage table. It is explicitly *not* folded
   into Stage 5, so nothing in this plan carries it.

## The seam, in detail

**Stage 5 ships the wizard with an uncomposited preview, and defines the seam Stage 6 fills.**

The current product's step 3 reviews a *pre-composed* preview with the sponsor's logo baked in. Composition is Remotion and Mux, which is Stage 6. The spec orders stages 0–5 strictly and puts video at 6, so Stage 5 cannot show a composited preview without reaching into the next stage.

Rather than resequence, Task 7 renders the gesture's **original** video in the preview step behind an explicit, tested seam — `lib/renderPreview.ts`, whose Stage 5 implementation returns the original playback id and whose contract is what Stage 6 replaces. The sponsor sees the video they are sponsoring and the overlay text as HTML over it; they do not see the final composite until Stage 6.

Everything else in the purchase flow — selection, details, logo upload, pricing, payment, webhook, approval queue — is complete and deployable at the end of this stage. **If the product owner would rather not show an uncomposited preview to a paying sponsor, the alternative is to run Stage 6 before Stage 5**; that is a resequencing decision, not a code change, and it is cheaper to take now than after Task 7.

## Spec coverage: what this plan does not carry, and why

Written during the plan's self-review, because a requirement nobody owns is
how a collection ships as dead schema.

**`user-consents` has no writer, and no stage owns giving it one.** The spec
defers it with "Stage 5 / the consent stage", and there is no consent stage
in the eleven-stage table. The collection exists from Stage 1, is append-only
to everyone, has a documented GDPR-evidence retention rationale and a
nullable `user` column specifically so a consent record outlives the account
it describes — and nothing has ever written a row. Stage 4 even tests that
account deletion *keeps* consent records, which currently proves a property
of an empty table.

It is not sponsorship work, so putting it here would be scope creep, and this
plan does not. **Resolved: it is now Stage 8.5 in the spec's stage table**, a small stage of
its own that ships the cookie and analytics banner together with the first
write path `user-consents` has ever had. It must land before Stage 9,
because the spec records that `analytics_consent` defaults to an explicit
*refusal* — so an import that skips the column silently records that every
existing user declined.

**Already done, not re-planned here.** The spec lists "no public read path
for overlay data" as deferred from Stage 1 to Stage 2/3. Stage 3 shipped it
as `lib/sponsorOverlay.ts` — a server-side projection that never returns the
whole document. Task 6 reuses its active-and-in-term predicate rather than
writing a second one.

**Deferred to Stage 6, correctly.** `POST /api/render/callback`,
`GET /api/mux/source/:id`, and the composed preview and sponsored videos.

**Deferred to Stage 7, correctly.** `expire-sponsorships`,
`send-renewal-reminders`, `cleanup-stale-payments`, and every email this
flow should send. Note that Task 7's failure-recovery test leans on
`cleanup-stale-payments` existing later; until it does, a sponsorship whose
Mollie call failed sits in `pending_payment` with no payment id and nothing
sweeps it. That is acceptable for one stage and is a real gap in between.

## Global Constraints

Copied verbatim from the spec and from what the previous four stages established. Every task's requirements implicitly include this section.

- **Payload is pinned at 3.89.0.** 3.90.x raises PBKDF2 to 600,000 iterations and workerd caps at 100,000. Do not upgrade.
- **The Worker bundle limit is 10.00 MiB gzipped; CI warns at 8 MiB.** Stage 4 closed at **7.31 MiB, 27% headroom**. Stages 5, 6 and 7 share what is left. Every dependency added in this stage must be measured, not estimated.
- **No `app/**/route.ts` may import Payload.** A route handler that does costs ~519 KiB gzipped and becomes its own bundle entry; a `page.tsx` costs nothing. Writes go in a Payload `Endpoint[]` plus a `next.config.ts` rewrite. There is a CI check.
- **There are no transactions on any write path.** The D1 adapter's `beginTransaction` resolves to `null`. Order every multi-step write so the irreversible step is last and re-running the whole thing is safe.
- **A relationship field accepts an id for a row that does not exist** as far as Payload's validation goes — `isValidID` is a `typeof` test. The database's foreign key refuses the insert, so the failure is an unhandled `DrizzleQueryError` rather than a dangling row. Resolve ids from requests with `overrideAccess: false`, which is both the access check and the difference between a sentence and a 500.
- **`admin-logs` and `user-consents` are append-only to everyone, including admins.** The only way in is a hook running with `overrideAccess: true`.
- **Biome with `ultracite`; `bun check` before committing.** `void` is banned; fire-and-forget promises use a bare call or `.then`.
- **knip fails the build on an exported symbol nothing imports.** Do not export a type "for later".
- **Locale-free endpoint paths.** Forms carry the locale in their body; `next.config.ts` rewrites are flat.
- **`.wrangler/state/vitest` is persisted and never cleared.** Any schema change — a new field is enough — invalidates it and makes a *different set of files* fail on every run. If failures move between runs, `rm -rf apps/site/.wrangler/state` before forming any other theory.
- **Fixture values on unique columns use `crypto.randomUUID()`.** A `beforeAll` collision is reported as *skipped*, which looks green.

## Review Focus

Five things the spec implies, that no task's own happy path exercises, and that will bite a real person. Each one's test is assigned to the task that owns the code.

1. **Mollie retries the webhook, and may deliver it twice concurrently.** Mollie retries on any non-2xx and on timeouts. With no transactions, two overlapping deliveries for one payment can both read `pending_payment` and both advance it. The sponsor is charged once and the log says twice. → Task 4.
2. **A payment succeeds for a sponsorship whose gesture was deleted or deactivated meanwhile.** The wizard resolved the gesture minutes earlier. `blockDeleteWhenSponsored` protects *sponsored* gestures, but a `pending_payment` row is not yet sponsored. → Task 4 (the webhook's decision) and Task 6 (the selection screen refusing it up front).
3. **The webhook arrives for a payment Mollie says is `failed`, `expired` or `canceled`, not just `paid`.** The old handler skips anything not `paid` and returns 200 — so a failed payment leaves the row in `pending_payment` forever, and `cleanup-stale-payments` (Stage 7) does not exist yet. → Task 4.
4. **A bulk payment partially applies.** The existing flow pays for up to 20 sponsorships in one Mollie payment. Without transactions, the third of five can fail and leave two advanced. → Task 4.
5. **The re-edit token is a capability URL that outlives its purpose.** It is stored in the clear, has an expiry column nothing enforces yet, and grants writes to a paid sponsorship. → Task 8.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/site/src/lib/sponsorshipStatus.ts` | The pure transition table and `canTransition`. No I/O. |
| `apps/site/src/hooks/enforceStatusTransitions.ts` | `beforeChange`: refuses a transition the table does not allow. |
| `apps/site/src/hooks/logSponsorshipTransitions.ts` | `afterChange`: appends to `admin-logs` with `overrideAccess`. |
| `apps/site/src/lib/sponsorshipCreate.ts` | The one place that works around Payload's generated create types. |
| `apps/site/src/lib/mollie.ts` | Two `fetch` calls — create a payment, read a payment. No SDK. |
| `apps/site/src/lib/pricing.ts` | Amount from duration and gesture count. Pure. |
| `apps/site/src/lib/renderPreview.ts` | The Stage 6 seam. Returns a playback id for the preview step. |
| `apps/site/src/endpoints/sponsorships.ts` | Wizard writes: start, details, checkout, re-edit. |
| `apps/site/src/endpoints/mollie.ts` | `POST /api/webhooks/mollie`. Idempotent. |
| `apps/site/src/app/(frontend)/[locale]/sponsor/page.tsx` | Step 1, select gestures. |
| `apps/site/src/app/(frontend)/[locale]/sponsor/details/page.tsx` | Step 2, sponsor and invoice details, logo upload. |
| `apps/site/src/app/(frontend)/[locale]/sponsor/preview/page.tsx` | Step 3, review and pay. |
| `apps/site/src/app/(frontend)/[locale]/sponsor/success/page.tsx` | Post-payment landing. |
| `apps/site/src/app/(frontend)/[locale]/sponsor/re-edit/page.tsx` | Token-addressed re-edit. |

**Modified**

| File | Change |
|---|---|
| `apps/site/src/collections/Sponsorships.ts` | Register the two hooks; add `sponsorReadAccess`. |
| `apps/site/src/access/sponsorships.ts` | New: sponsor reads own by token; admin full. |
| `apps/site/next.config.ts` | Rewrites for the endpoints above. |
| `apps/site/src/payload.config.ts` | Register `sponsorshipEndpoints` and `mollieEndpoints`. |

Each task below ends with an independently testable deliverable and a commit.

---

### Task 1: The status machine

Currently every status is reachable from every other; the spec calls this out as deferred from Stage 1. This task makes the seven-value tuple mean something.

**Files:**
- Create: `apps/site/src/lib/sponsorshipStatus.ts`, `apps/site/src/lib/sponsorshipStatus.test.ts`
- Create: `apps/site/src/hooks/enforceStatusTransitions.ts`, `apps/site/src/hooks/enforceStatusTransitions.int.test.ts`
- Modify: `apps/site/src/collections/Sponsorships.ts`

**Interfaces:**
- Consumes: `SPONSORSHIP_STATUSES`, `SponsorshipStatus` from `@smog/config`.
- Produces: `canTransition(from: SponsorshipStatus, to: SponsorshipStatus): boolean`; `ALLOWED_TRANSITIONS: Readonly<Record<SponsorshipStatus, readonly SponsorshipStatus[]>>`; `enforceStatusTransitions` as a `CollectionBeforeChangeHook`.

- [x] **Step 1: Write the failing table test**

```ts
// apps/site/src/lib/sponsorshipStatus.test.ts
import { SPONSORSHIP_STATUSES } from "@smog/config";
import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, canTransition } from "./sponsorshipStatus";

describe("the sponsorship status machine", () => {
  it("covers every status the collection can hold", () => {
    // Not decoration. The options on the field are generated from the same
    // tuple, so a status added there without a row here would be settable
    // and then permanently stuck — `canTransition` would answer false for
    // every move out of it.
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual(
      [...SPONSORSHIP_STATUSES].sort()
    );
  });

  it("lets a paid sponsorship reach the approval queue", () => {
    expect(canTransition("pending_payment", "pending_approval")).toBe(true);
  });

  it("refuses the move the spec names as currently possible", () => {
    // The spec: "nothing stops `active` -> `pending_payment`". This is the
    // line that makes that false.
    expect(canTransition("active", "pending_payment")).toBe(false);
  });

  it("treats a status staying put as allowed", () => {
    // Every update that touches any other field re-submits `status`. If a
    // no-op move were refused, editing a sponsor's name would fail.
    for (const status of SPONSORSHIP_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it("lets nothing out of a terminal status", () => {
    // `rejected` is deliberately absent — see the table above. It is
    // re-openable for resubmission in the shipped product, and the edge is
    // pinned by its own positive test rather than left implicit.
    for (const terminal of ["expired", "cancelled"] as const) {
      const reachable = SPONSORSHIP_STATUSES.filter(
        (to) => to !== terminal && canTransition(terminal, to)
      );

      expect(reachable).toEqual([]);
    }
  });

  it("can reach every non-initial status from somewhere", () => {
    // A status nothing can transition *into* is dead configuration that
    // reads as a supported state. Guards against a table that is merely
    // self-consistent.
    for (const to of SPONSORSHIP_STATUSES) {
      if (to === "pending_payment") {
        continue;
      }

      const sources = SPONSORSHIP_STATUSES.filter(
        (from) => from !== to && canTransition(from, to)
      );

      expect(sources.length).toBeGreaterThan(0);
    }
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `cd apps/site && bunx vitest run src/lib/sponsorshipStatus.test.ts`
Expected: FAIL — `Failed to resolve import "./sponsorshipStatus"`.

- [x] **Step 3: Write the table**

```ts
// apps/site/src/lib/sponsorshipStatus.ts
import { type SponsorshipStatus } from "@smog/config";

/**
 * Which status may follow which.
 *
 * Stage 1 defined the seven values and deliberately left every transition
 * between them legal — the spec records it as deferred. This is the table
 * that closes it, and it is data rather than a chain of `if`s so that the
 * whole policy can be read, tested and diffed in one place.
 *
 * A status staying put is allowed by `canTransition` rather than by a
 * self-edge here, because *every* update re-submits `status`: renaming a
 * sponsor would otherwise be refused as an illegal move to where it
 * already is.
 *
 * The three terminals have empty lists on purpose. `expired`, `rejected`
 * and `cancelled` are answers, not waypoints — a sponsor who wants another
 * term buys another sponsorship, which is a new row with its own payment.
 * Re-opening one would silently reuse a paid-for record.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<SponsorshipStatus, readonly SponsorshipStatus[]>
> = {
  // The webhook advances this one; the sponsor or a stale-payment sweep
  // cancels it. It cannot go straight to `active`: approval is a person.
  pending_payment: ["pending_approval", "cancelled"],
  // An admin approves, rejects, or asks for changes.
  pending_approval: ["active", "rejected", "pending_resubmission"],
  // The sponsor edits through the re-edit token and it returns to the queue.
  pending_resubmission: ["pending_approval", "cancelled"],
  // Runs its term, or is pulled.
  active: ["expired", "cancelled"],
  expired: [],
  // CORRECTED DURING TASK 1, against the shipped product. This plan
  // originally had `rejected: []`. `packages/convex/convex/sponsorships.ts`
  // allows `generateReEditLink` for exactly
  // `["pending_approval", "pending_resubmission", "rejected"]`, and the
  // admin panel renders the button for a rejected sponsorship. The
  // migration's non-goal is that sponsorship behaviour does not change, so
  // the shipped allowlist wins over this plan's guess.
  rejected: ["pending_resubmission"],
  cancelled: [],
};

/** Whether `from` may become `to`. A status staying put always may. */
export function canTransition(
  from: SponsorshipStatus,
  to: SponsorshipStatus
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}
```

- [x] **Step 4: Run it and watch it pass**

Run: `cd apps/site && bunx vitest run src/lib/sponsorshipStatus.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Write the failing hook test**

```ts
// apps/site/src/hooks/enforceStatusTransitions.int.test.ts — the shape
it("refuses active -> pending_payment through the local API");
it("allows pending_payment -> pending_approval");
it("allows an update that does not touch status");
it("refuses the illegal move even with overrideAccess", async () => {
  // The hook is the policy, not the access layer. Every writer in this
  // stage runs with `overrideAccess: true` — the webhook, the admin-log
  // hook, the re-edit endpoint — so a guard that access could bypass
  // would be a guard nothing in this stage is subject to.
});
it("names both statuses in the error, so an admin can see what it refused");
```

- [x] **Step 6: Run, implement the hook, run again**

```ts
// apps/site/src/hooks/enforceStatusTransitions.ts
import { APIError, type CollectionBeforeChangeHook } from "payload";
import { canTransition } from "@/lib/sponsorshipStatus";

/**
 * Refuses a status transition the table does not allow.
 *
 * `beforeChange` and not `beforeValidate`: `originalDoc` is what the
 * comparison needs and it is populated for an update by the time this runs.
 *
 * On create there is no `originalDoc`, and nothing is refused — the field's
 * own `defaultValue` and its `options` already constrain what a new row may
 * hold, and a create is not a transition.
 */
export const enforceStatusTransitions: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
}) => {
  if (operation !== "update" || originalDoc === undefined) {
    return data;
  }

  const from = originalDoc.status;
  const to = data.status;

  // An update that does not carry `status` is not a transition. Payload
  // sends only changed fields on a patch.
  if (to === undefined || from === undefined) {
    return data;
  }

  if (!canTransition(from, to)) {
    throw new APIError(
      `A sponsorship cannot go from ${from} to ${to}.`,
      400,
      undefined,
      true
    );
  }

  return data;
};
```

- [x] **Step 7: Register it, and prove it is registered**

Add to `apps/site/src/collections/Sponsorships.ts`:

```ts
  hooks: {
    beforeDelete: [/* existing */],
    beforeChange: [enforceStatusTransitions],
  },
```

The int test above goes through `payload.update`, so it fails if the hook is not wired — a unit test of the hook alone would not.

- [x] **Step 8: Mutation-prove each guard**

For each, apply, `grep` to confirm it landed, run the **whole** test file, restore, byte-compare:

| mutation | must fail |
|---|---|
| `canTransition` drops the `from === to` clause | "allows an update that does not touch status" |
| `canTransition` returns `true` unconditionally | the `active -> pending_payment` tests |
| the hook returns early on `operation === "update"` | the refusal tests |
| `pending_payment`'s list gains `"active"` | add a test asserting it is refused, then re-run |
| a terminal gains an outgoing edge | "lets nothing out of a terminal status" |

- [x] **Step 9: Commit**

```bash
cd /home/user/smog && bun check && bun -F site check-types && bunx knip --no-progress --no-config-hints
git add apps/site/src/lib/sponsorshipStatus.ts apps/site/src/lib/sponsorshipStatus.test.ts \
        apps/site/src/hooks/enforceStatusTransitions.ts \
        apps/site/src/hooks/enforceStatusTransitions.int.test.ts \
        apps/site/src/collections/Sponsorships.ts
git commit -m "feat(site): make the sponsorship status field a state machine"
```

---

### Task 2: One cast, centrally — Payload's generated create types

The spec names this precisely: "Payload's generated create types mark `status` and `durationYears` as required despite both having defaults. The very call the default exists to serve does not typecheck. Stage 1 carries one narrow documented cast in a fixture; Stage 5's callers will hit the same wall and should fix it once, centrally."

**Files:**
- Create: `apps/site/src/lib/sponsorshipCreate.ts`, `.test.ts`
- Modify: `apps/site/src/seed/` — replace Stage 1's fixture cast with a call to this.

**Interfaces:**
- Produces: `createSponsorship(payload: Payload, data: NewSponsorship): Promise<Sponsorship>` where `NewSponsorship` is the generated create type with `status` and `durationYears` made optional.

- [x] **Step 1: Write the failing test**

```ts
// The point is a *type* claim, so it is asserted by compiling, and by one
// runtime test that the defaults actually land.
it("creates a sponsorship without naming status or durationYears", async () => {
  const row = await createSponsorship(payload, {
    contactFullName: "A Contact",
    endDate: new Date(Date.now() + YEAR_MS).toISOString(),
    gesture: gestureId,
    originalVideoPlaybackId: "pb-original",
    overlayText: "A Sponsor",
    paymentAmount: 4900,
    sponsorEmail: `sponsor-${crypto.randomUUID()}@example.test`,
    sponsorName: "A Sponsor",
    startDate: new Date().toISOString(),
  });

  // The defaults the field declares, proved to arrive rather than assumed.
  expect(row.status).toBe("pending_payment");
  expect(row.durationYears).toBe(1);
});
```

- [x] **Step 2: Run, implement, run**

```ts
// apps/site/src/lib/sponsorshipCreate.ts
import type { Payload } from "payload";
import type { Sponsorship } from "@/payload-types";

/**
 * The generated create type, with the two fields that have defaults made
 * optional.
 *
 * Payload generates `status` and `durationYears` as required on create
 * because they are `required: true` on the field, and does not account for
 * `defaultValue` — so the call the default exists to serve does not
 * typecheck. The spec records this and asks for one central fix rather than
 * a cast at each call site, which is what this is.
 *
 * `Omit` plus `Partial` rather than a bare `as`: a cast would also silence a
 * genuinely missing `sponsorName`, and every field except these two is
 * still checked.
 */
export type NewSponsorship = Omit<
  Parameters<Payload["create"]>[0] extends { data: infer D } ? D : never,
  "status" | "durationYears"
> &
  Partial<Pick<Sponsorship, "durationYears" | "status">>;
```

> The exact generic above must be checked against the generated types when
> implementing — `payload.create` is overloaded on collection slug. If the
> extraction is awkward, the acceptable alternative is
> `Omit<RequiredDataFromCollectionSlug<"sponsorships">, "status" | "durationYears"> & Partial<...>`,
> which is the named export Payload provides for exactly this. Use whichever
> compiles; do not fall back to `as never`.

- [x] **Step 3: Replace Stage 1's fixture cast and prove it is gone**

```bash
grep -rn "as unknown as\|@ts-expect-error" apps/site/src/seed/ | grep -i sponsor
```
Expected after this task: no matches.

- [x] **Step 4: Mutation-prove**

| mutation | must fail |
|---|---|
| `createSponsorship` passes `status: "active"` explicitly | the default test |
| `NewSponsorship` becomes `any` | typecheck must still pass, so **add** a `@ts-expect-error` test asserting a missing `sponsorName` is rejected — otherwise this mutation is invisible |

- [x] **Step 5: Commit**

```bash
git commit -m "refactor(site): fix Payload's sponsorship create types in one place"
```

---

### Task 3: Pricing, and the Mollie client that is not an SDK

**Files:**
- Create: `apps/site/src/lib/pricing.ts` + `.test.ts`
- Create: `apps/site/src/lib/mollie.ts` + `.test.ts`

**Interfaces:**
- Consumes: `PRICE_PER_YEAR_CENTS`, `LOGO_ADDON_CENTS`, `FIXED_DURATION_YEARS`, `MAX_GESTURES_PER_SPONSORSHIP` from `@smog/config/constants`.
- Produces: `sponsorshipAmountCents(gestureCount: number, includeLogo: boolean): number`; `createMolliePayment(input: CreatePaymentInput): Promise<{ checkoutUrl: string; id: string }>`; `readMolliePayment(id: string): Promise<{ amountCents: number; metadata: Record<string, string>; status: string }>`.

- [x] **Step 1: Measure before choosing — this step produces a number, not an opinion**

`@mollie/api-client` is 2.1 MB unpacked and is used for exactly two calls:
`payments.create` and `payments.get`. The Worker has **27% headroom** and
Stages 6 and 7 still have to fit.

Run both and record the gzipped delta in the task report:

```bash
cd apps/site
CLOUDFLARE_ENV=staging bun run build:app && CLOUDFLARE_ENV=staging bun run check-bundle-size   # baseline
# then with a throwaway `import { createMollieClient } from "@mollie/api-client"` in an endpoint
```

**Default is `fetch`.** Adopt the SDK only if the measured delta is under
100 KiB gzipped *and* the report says why the SDK earns it. Two REST calls
do not normally justify a dependency in a Worker this close to its ceiling.

**MEASURED.** Both builds, same commit, `CLOUDFLARE_ENV=staging`, from
wrangler's own `Total Upload` line:

| build | gzipped | delta |
|---|---:|---:|
| baseline (end of Task 2) | 7,483.37 KiB | — |
| + `@mollie/api-client` reachable from an endpoint | 7,649.08 KiB | **+165.71** |
| shipped (`fetch`, end of Task 3) | 7,483.37 KiB | **0.00** |

**+165.71 KiB is over the 100 KiB bar, so: `fetch`.** The SDK buys two URL
templates and a response type, and costs 6% of the headroom Stages 6 and 7
still have to share. Task 3's own delta is 0.00 KiB because neither new
module is reachable from the Worker graph until Task 4's webhook and Task 7's
checkout import them; the `fetch` client is a few KiB of source and shows up
then.

A second finding from the probe build, worth more than the number:
`createMollieClient({ apiKey: "" })` **throws at module evaluation**, and the
shipped `packages/auth/src/lib/payments.ts` constructs the client at module
scope from `process.env.MOLLIE_API_KEY || ""`. The first probe build failed
during `next build`'s page-data collection for exactly that reason — a Worker
built that way is dead on import wherever the variable is unset, not merely
on the request that needed it. Whatever Stage 5 ships reads the key per call.

- [x] **Step 2: Write the failing pricing test**

Read the current prices out of the existing implementation before writing
this — `apps/server/src/services/sponsorship.ts` and
`apps/web/src/routes/sponsors/utils/` hold them. The spec's non-goals say
**pricing does not change in this migration**, so these numbers are
transcribed, not chosen.

**CORRECTED against the shipped product before Task 3 started.** This plan
originally took `(durationYears, gestureCount)` and asked for a "multi-year
rate". There is no such thing: `packages/config/src/constants.ts` declares
`FIXED_DURATION_YEARS = 1` with the comment "All sponsorships are currently
for exactly 1 year", and the real variable is the **logo add-on**. The
shipped calculation is `apps/web/src/lib/pricing.ts`:

```ts
PRICE_PER_YEAR_CENTS = 5000   // EUR 50.00 per gesture per year
LOGO_ADDON_CENTS     = 1000   // EUR 10.00 per gesture, when a logo is included
total = PRICE_PER_YEAR_CENTS * n + (includeLogo ? LOGO_ADDON_CENTS * n : 0)
```

Import those constants from `@smog/config/constants` — do **not** restate the
numbers in `apps/site`. `packages/config` survives until Stage 10 and is the
shared source; a second copy is a second thing to forget when pricing
changes.

```ts
it("charges EUR 50.00 for one gesture for one year", () => {
  expect(sponsorshipAmountCents(1, false)).toBe(5000);
});
it("adds EUR 10.00 per gesture when a logo is included", () => {
  expect(sponsorshipAmountCents(1, true)).toBe(6000);
});
it("multiplies both parts by the number of gestures", () => {
  expect(sponsorshipAmountCents(3, false)).toBe(15_000);
  expect(sponsorshipAmountCents(3, true)).toBe(18_000);
});
it("agrees with the shipped calculation across the whole legal range", () => {
  // Transcription is the risk here, not arithmetic. This pins every input
  // the wizard can produce against the numbers the current product charges,
  // so a typo in one constant cannot pass as a pricing decision.
  for (let n = 1; n <= MAX_GESTURES_PER_SPONSORSHIP; n += 1) {
    for (const logo of [false, true]) {
      expect(sponsorshipAmountCents(n, logo)).toBe(
        5000 * n + (logo ? 1000 * n : 0)
      );
    }
  }
});
it("returns whole cents, never a fraction", () => {
  // Mollie takes a decimal string with exactly two places. A float cent
  // count becomes "49.000000000000004" and the API rejects the payment —
  // at the moment the sponsor presses pay.
  for (const years of [1, 2, 3]) {
    for (const count of [1, 2, 3, 7]) {
      expect(Number.isInteger(sponsorshipAmountCents(years, count))).toBe(true);
    }
  }
});
it("refuses a zero or negative gesture count", () => {
  // A zero-amount payment is a Mollie API error at press time, and a
  // negative one is a refund nobody asked for.
  expect(() => sponsorshipAmountCents(1, 0)).toThrow();
});
```

**CORRECTED AGAIN DURING TASK 3 — the last two snippets above still carry the
old `(durationYears, gestureCount)` signature.** They were missed when the
signature was corrected to `(gestureCount, includeLogo)` just above:

- `sponsorshipAmountCents(years, count)` passes a *number* where
  `includeLogo: boolean` is expected, which does not typecheck, and loops
  over a duration that is no longer an input.
- `sponsorshipAmountCents(1, 0)` is meant to be the zero-gesture case but
  reads as **one gesture, no logo** — the valid call. It does not throw, so a
  test asserting it throws would fail against a correct implementation. The
  shipped test is `sponsorshipAmountCents(0, false)`.

**And "returns whole cents, never a fraction" is vacuous as written.**
Integer constants times an integer count are always integers, so no mutation
of the arithmetic can make that loop fail. What can produce a fraction is a
*non-integer count* reaching the multiplication, so the guard is
`Number.isInteger(gestureCount)` and what proves it is the positive case:
`sponsorshipAmountCents(2.5, false)` must throw. The whole-range loop stays
beside it as the transcription check it really is.

**`FIXED_DURATION_YEARS` is not consumed by `lib/pricing.ts`.** The
interfaces list names it, but the shipped calculation in
`apps/web/src/lib/pricing.ts` does not multiply by it — `subtotal =
PRICE_PER_YEAR_CENTS * gestureCount`, with `durationYears` reported alongside
the total as a separate field of the breakdown. The two agree today only
because the constant is 1; multiplying would silently double every price the
day somebody set it to 2 while `apps/web` kept charging the old amount.
Transcription wins.

- [x] **Step 3: Write the failing Mollie client tests, against a stubbed `fetch`**

```ts
it("sends the amount as a two-decimal string in the currency Mollie wants");
it("sends the sponsorship ids in metadata, so the webhook can resolve them");
it("throws with Mollie's own detail when the API refuses");
it("does not put the API key anywhere but the Authorization header");
it("reads a payment's status and amount back");
it("treats a non-JSON body as a failure rather than as a paid payment", () => {
  // A Cloudflare or Mollie error page is HTML. `await response.json()`
  // throwing inside a `try` that returns a default is how a webhook ends up
  // marking an unpaid sponsorship paid.
});
```

- [x] **Step 4: Implement both, run, and confirm the key never appears in a log**

```bash
grep -rn "MOLLIE_API_KEY" apps/site/src | grep -v "process.env.MOLLIE_API_KEY"
```
Expected: no matches. The key is read once and passed as a header.

- [x] **Step 5: Mutation-prove**

| mutation | must fail |
|---|---|
| amount sent as cents rather than a decimal string | the two-decimal test |
| `toFixed(2)` dropped | the two-decimal test |
| metadata omitted | the metadata test |
| a non-2xx response returns a default instead of throwing | the refusal test |
| `response.json()` wrapped in a `try` returning `{}` | the non-JSON test |
| the integer guard removed from pricing | the whole-cents test |

- [x] **Step 6: Commit**

```bash
git commit -m "feat(site): price a sponsorship, and talk to Mollie without the SDK"
```

---

### Task 4: The webhook — the task this stage is really about

Every one of the five Review Focus items except the last lands here.

**Files:**
- Create: `apps/site/src/endpoints/mollie.ts` + `.int.test.ts`
- Modify: `apps/site/next.config.ts`, `apps/site/src/payload.config.ts`

**Interfaces:**
- Consumes: `readMolliePayment` (Task 3), `canTransition` (Task 1).
- Produces: `mollieEndpoints: Endpoint[]` serving `POST /api/webhooks/mollie`.

- [ ] **Step 1: Write the failing tests — all of them, before any handler**

```ts
// The happy path, and then every way Mollie can make it go wrong.
it("advances a pending_payment sponsorship to pending_approval");
it("reads the payment from Mollie rather than trusting the body", async () => {
  // The body is `id=tr_xxx` from an unauthenticated POST. Anyone can send
  // it. The *only* thing that makes this safe is that the handler asks
  // Mollie what that payment actually is.
});

// Review Focus 1 — retries, including concurrent ones.
it("is idempotent: the same delivery twice leaves one transition");
it("answers 200 to a replay, so Mollie stops retrying");
it("survives two concurrent deliveries of the same payment", async () => {
  const [first, second] = await Promise.all([deliver(paymentId), deliver(paymentId)]);
  expect([first.status, second.status]).toEqual([200, 200]);
  // The assertion that matters: exactly one log row, not two.
  expect(await adminLogCountFor(sponsorship.id)).toBe(1);
});

// Review Focus 3 — statuses that are not `paid`.
it("cancels the sponsorship when Mollie reports the payment failed");
it("cancels it when the payment expired");
it("cancels it when the payment was canceled");
it("leaves it pending while the payment is still open");
it("answers 200 to every one of those, so Mollie stops retrying", async () => {
  // A 4xx or 5xx makes Mollie retry a decision that will not change.
});

// Review Focus 2 — the world moved under the payment.
it("still advances when the gesture was deactivated after checkout", async () => {
  // Deliberate: the sponsor paid. Refusing here takes their money and gives
  // them nothing. It goes to the approval queue, where a person decides.
  // Asserted so that a future `overrideAccess: false` "tidy-up" fails here.
});
it("refuses and reports when the gesture row is gone entirely");

// Review Focus 4 — bulk.
it("advances all five sponsorships in a bulk payment");
it("advances the rest when one of them is already advanced");
it("reports which ones it could not advance, and still answers 200");
it("refuses a bulk payment naming more than twenty sponsorships");
it("refuses a bulk metadata payload that is not an array of ids");

// The oracle.
it("answers an unknown payment id the same way it answers a known one", async () => {
  // Both are 200 with the same body. A 404 for an unknown id turns this
  // endpoint into a "does this payment exist" oracle for anyone who can
  // guess a Mollie id format.
});

// Amount.
it("refuses a payment whose amount does not match the sponsorship");
```

- [ ] **Step 2: Run them all and watch them fail**

Run: `cd apps/site && bunx vitest run src/endpoints/mollie.int.test.ts`
Expected: FAIL on the import.

- [ ] **Step 3: Implement, with the concurrency guard as a conditional update**

There are no transactions, so the idempotency guard cannot be read-then-write.
Use a **conditional update** — an `update` whose `where` includes the status
being moved *from* — and treat "zero rows changed" as "somebody else already
did it":

```ts
const { docs } = await req.payload.update({
  collection: "sponsorships",
  data: { status: "pending_approval" },
  overrideAccess: true,
  where: {
    and: [
      { id: { equals: sponsorship.id } },
      // The guard. Two concurrent deliveries both reach this line; only one
      // matches a row, because the first one's write has already moved the
      // status. Reading the status first and then writing would let both
      // through — there is no transaction to make that pair atomic.
      { status: { equals: "pending_payment" } },
    ],
  },
});

const advanced = docs.length === 1;
```

Everything after that — the admin log, the email queue — runs only when
`advanced` is true. **Verify with a test that `payload.update` with a `where`
returns only the rows it actually changed on this adapter**; if it does not,
the fallback is a dedicated `webhookDeliveries` row with a unique index on
the payment id, and the unique-constraint violation is the guard. Do not
proceed on the assumption.

- [ ] **Step 4: Run every test; none may be skipped**

- [ ] **Step 5: Mutation-prove — 14 mutations, all must be CAUGHT**

| mutation | must fail |
|---|---|
| trust `body.id`'s status instead of asking Mollie | "reads the payment from Mollie" |
| drop the `status` clause from the conditional `where` | the concurrency test |
| replace the conditional update with read-then-write | the concurrency test |
| treat every non-`paid` status as `open` | the failed/expired/canceled tests |
| answer 4xx for a non-`paid` payment | "answers 200 to every one of those" |
| answer 404 for an unknown payment | the oracle test |
| drop the amount check | the amount test |
| cap bulk at 100 instead of 20 | the bulk cap test |
| accept bulk metadata that is not an array | the bulk shape test |
| stop at the first failure in a bulk payment | "advances the rest" |
| log before the update rather than after | the concurrency log-count test |
| `overrideAccess: false` on the sponsorship update | the deactivated-gesture test |
| swallow a `readMolliePayment` throw and answer 200 | add a test: a Mollie outage must not silently drop the payment |
| remove the rewrite from `next.config.ts` | an e2e or a rewrite test |

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(site): accept Mollie's webhook, idempotently and in bulk"
```

---

### Task 5: Admin logs, written the only way they can be

**Files:**
- Create: `apps/site/src/hooks/logSponsorshipTransitions.ts` + `.int.test.ts`
- Modify: `apps/site/src/collections/Sponsorships.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("writes a log row when the status changes");
it("writes nothing when an update leaves the status alone");
it("records both the old and the new status");
it("records who made the change, and null for the webhook");
it("writes through overrideAccess, because admin-logs refuses everyone", async () => {
  // The spec: both collections are append-only to everyone including
  // admins, so a hook is the only way in. This test fails if somebody
  // "simplifies" the hook to a plain create.
});
it("does not fail the transition when the log write fails", async () => {
  // Ordering under no transactions: the sponsorship has already changed by
  // the time an `afterChange` hook runs. Throwing here would report a
  // failure for a write that happened, and Mollie would retry it.
});
```

- [ ] **Step 2: Implement as `afterChange`**

Run `cd /home/user/smog/apps/site && bunx vitest run src/hooks/logSponsorshipTransitions.int.test.ts` before and after. The hook calls `req.payload.create({ collection: "admin-logs", data: {...}, overrideAccess: true })` inside a `try`/`catch` that logs and swallows — see Step 1's resilience test for why it must not rethrow.

- [ ] **Step 3: Mutation-prove**

| mutation | must fail |
|---|---|
| `overrideAccess: false` | the overrideAccess test |
| log on every update, not only status changes | "writes nothing when..." |
| let a log failure throw | the resilience test |
| record only the new status | the both-statuses test |

- [ ] **Step 4: Commit**

```bash
cd /home/user/smog && bun check && bun -F site check-types
git add -A && git commit -m "feat(site): log every sponsorship status change"
```

---

### Task 6: The wizard, step 1 — choose gestures

**Files:**
- Create: `apps/site/src/app/(frontend)/[locale]/sponsor/page.tsx`
- Create: `apps/site/src/endpoints/sponsorships.ts` (the `start` handler) + `.int.test.ts`
- Modify: `apps/site/next.config.ts`, `apps/site/src/payload.config.ts`

Reuse `GestureGrid` from `@smog/ui-web` and `fetchGestures` from
`lib/gestureQuery.ts` — the search, filtering and overshoot clamping are
Stage 3's and are mutation-proven. **Do not rewrite them.**

- [ ] **Step 1: Failing tests**

```ts
it("lists only active gestures as sponsorable");
it("refuses a selection naming a gesture that does not exist");
it("refuses a selection of more than MAX_GESTURES_PER_SPONSORSHIP gestures", () => {
  // **Ten, not twenty.** `packages/config/src/constants.ts` sets
  // `MAX_GESTURES_PER_SPONSORSHIP = 10`. This plan said twenty in an earlier
  // draft by confusing it with the webhook's bulk-payment cap, which is a
  // genuinely different number for a genuinely different reason: how many
  // sponsorship rows one Mollie payment may name. Import the constant; do
  // not write either number as a literal.
});
it("refuses an empty selection");
it("keeps the selection across the step boundary");
it("refuses a gesture that already has an active sponsorship in term", async () => {
  // Selling the same window twice is the failure that costs money to
  // unwind. `lib/sponsorOverlay.ts` already computes "active and in term";
  // reuse that predicate rather than writing a second one that can drift.
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/endpoints/sponsorships.int.test.ts
```
Expected: FAIL on the missing import, not on an assertion. A test that fails
on an assertion before the code exists is testing something else.

- [ ] **Step 3: Implement**

Follow the house pattern in `apps/site/src/endpoints/account.ts` and
`apps/site/src/endpoints/lists.ts`: `guardOrigin(req)` first, then
`readForm(req)`, then `localeFromForm`, then the signed-in or token check,
then the write, then `seeOther(...)`. Every answer is a redirect; the pages
carry no client JavaScript. Resolve every id from the form with
`overrideAccess: false`. Add the rewrite to `apps/site/next.config.ts` and
register the endpoint array in `apps/site/src/payload.config.ts`.

- [ ] **Step 4: Run until green**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/endpoints/sponsorships.int.test.ts
```

- [ ] **Step 5: Mutation-prove every guard**

One mutation per guard named in Step 1. For each: apply it, `grep` to
confirm it landed, run the **whole** file (never `-t`), record CAUGHT or
SURVIVED from the runner's own `Tests` line, restore, and byte-compare
against the backup. A SURVIVED mutation means the test is decorative — fix
the test, or delete the guard and say why. Do not adjust the record.

- [ ] **Step 6: Commit**

```bash
cd /home/user/smog && bun check && bun -F site check-types && bunx knip --no-progress --no-config-hints
cd apps/site && rm -rf .wrangler/state && bun run test
git add -A && git commit -m "feat(site): choose the gestures a sponsorship covers"
```

---

### Task 7: The wizard, step 2 and 3 — details, logo, preview, pay

**Files:**
- Create: `apps/site/src/app/(frontend)/[locale]/sponsor/details/page.tsx`
- Create: `apps/site/src/app/(frontend)/[locale]/sponsor/preview/page.tsx`
- Create: `apps/site/src/app/(frontend)/[locale]/sponsor/success/page.tsx`
- Create: `apps/site/src/lib/renderPreview.ts` + `.test.ts`
- Modify: `apps/site/src/endpoints/sponsorships.ts` (`details`, `checkout`)

**The Stage 6 seam.** `renderPreview.ts` exports
`previewPlaybackId(sponsorship): string` and returns
`originalVideoPlaybackId` in this stage. Its doc block states that Stage 6
replaces the body and not the signature, and its test asserts the Stage 5
contract explicitly so that Stage 6 has to change a test on purpose.

- [ ] **Step 1: Failing tests**

```ts
it("refuses a sponsor email that is not an address");
it("requires overlay text, and bounds its length");
it("accepts a logo upload into media, and refuses a non-image");
it("bounds the logo file size");
it("stores the VAT number only when an invoice was requested");
it("creates one sponsorship row per selected gesture");
it("creates them all in pending_payment");
it("puts every created id in the Mollie payment's metadata");
it("sends the sponsor to Mollie's checkout URL");
it("does not create rows when Mollie refuses the payment", async () => {
  // Ordering under no transactions: the rows are written first because the
  // payment needs their ids in its metadata. So this asserts the *recovery*
  // — the rows exist in `pending_payment` with no `molliePaymentId`, which
  // is exactly what Stage 7's `cleanup-stale-payments` collects. The wrong
  // fix here is to leave rows nothing will ever clean up.
});
it("shows the original video in the preview step (Stage 5 contract)");
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/endpoints/sponsorships.int.test.ts src/lib/renderPreview.test.ts
```
Expected: FAIL on the missing import, not on an assertion. A test that fails
on an assertion before the code exists is testing something else.

- [ ] **Step 3: Implement**

Follow the house pattern in `apps/site/src/endpoints/account.ts` and
`apps/site/src/endpoints/lists.ts`: `guardOrigin(req)` first, then
`readForm(req)`, then `localeFromForm`, then the signed-in or token check,
then the write, then `seeOther(...)`. Every answer is a redirect; the pages
carry no client JavaScript. Resolve every id from the form with
`overrideAccess: false`. Add the rewrite to `apps/site/next.config.ts` and
register the endpoint array in `apps/site/src/payload.config.ts`.

- [ ] **Step 4: Run until green**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/endpoints/sponsorships.int.test.ts src/lib/renderPreview.test.ts
```

- [ ] **Step 5: Mutation-prove every guard**

One mutation per guard named in Step 1. For each: apply it, `grep` to
confirm it landed, run the **whole** file (never `-t`), record CAUGHT or
SURVIVED from the runner's own `Tests` line, restore, and byte-compare
against the backup. A SURVIVED mutation means the test is decorative — fix
the test, or delete the guard and say why. Do not adjust the record.

- [ ] **Step 6: Commit**

```bash
cd /home/user/smog && bun check && bun -F site check-types && bunx knip --no-progress --no-config-hints
cd apps/site && rm -rf .wrangler/state && bun run test
git add -A && git commit -m "feat(site): take a sponsor's details and send them to Mollie"
```

---

### Task 8: The re-edit token — Review Focus 5

**Files:**
- Create: `apps/site/src/app/(frontend)/[locale]/sponsor/re-edit/page.tsx`
- Create: `apps/site/src/access/sponsorships.ts` + tests
- Modify: `apps/site/src/endpoints/sponsorships.ts` (`reEdit`), `apps/site/src/collections/Sponsorships.ts`

The spec's access rule: "sponsor reads own by token; admin has full access."

- [ ] **Step 1: Failing tests**

```ts
it("lets the token holder read their own sponsorship");
it("shows them nothing else in the collection");
it("refuses an expired token", () => {
  // `reEditTokenExpiresAt` exists and nothing enforces it. This is the test
  // that makes the column mean something.
});
it("refuses a token that has been used to resubmit");
it("refuses an absent token without matching every NULL-token row", async () => {
  // The exact hazard `access/lists.ts`'s tokenless guard exists for:
  // `{ equals: undefined }` matches every row whose token is NULL. Most
  // sponsorships have no re-edit token.
});
it("does not let the token change the status to active");
it("does not let the token change the payment amount or the gesture");
it("moves pending_resubmission back to pending_approval on submit");
it("does not expose the sponsor's contact details to a view-token holder");
```

- [ ] **Step 2: Decide and record how the token is stored**

Stage 4 stores the email-change confirmation token as its **SHA-256** and
records why: a database dump is otherwise a set of usable links. The
re-edit token today is stored in the clear, like Payload's own
`resetPasswordToken`.

Hash it, matching `endpoints/account.ts`, unless the admin panel's
`ReEditLinkBox` needs to redisplay the link after the fact — in which case
say so in the report and keep it clear-text with `hidden: true`, since a
hash cannot be un-hashed to show an admin the URL. **Make the call, write
down which and why; do not leave both.**

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/access/sponsorships.int.test.ts src/endpoints/sponsorships.int.test.ts
```
Expected: FAIL on the missing import, not on an assertion. A test that fails
on an assertion before the code exists is testing something else.

- [ ] **Step 3: Implement**

Follow the house pattern in `apps/site/src/endpoints/account.ts` and
`apps/site/src/endpoints/lists.ts`: `guardOrigin(req)` first, then
`readForm(req)`, then `localeFromForm`, then the signed-in or token check,
then the write, then `seeOther(...)`. Every answer is a redirect; the pages
carry no client JavaScript. Resolve every id from the form with
`overrideAccess: false`. Add the rewrite to `apps/site/next.config.ts` and
register the endpoint array in `apps/site/src/payload.config.ts`.

- [ ] **Step 4: Run until green**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/access/sponsorships.int.test.ts src/endpoints/sponsorships.int.test.ts
```

- [ ] **Step 5: Mutation-prove every guard**

One mutation per guard named in Step 1. For each: apply it, `grep` to
confirm it landed, run the **whole** file (never `-t`), record CAUGHT or
SURVIVED from the runner's own `Tests` line, restore, and byte-compare
against the backup. A SURVIVED mutation means the test is decorative — fix
the test, or delete the guard and say why. Do not adjust the record.

- [ ] **Step 6: Commit**

```bash
cd /home/user/smog && bun check && bun -F site check-types && bunx knip --no-progress --no-config-hints
cd apps/site && rm -rf .wrangler/state && bun run test
git add -A && git commit -m "feat(site): let a sponsor re-edit through an expiring token"
```

The tokenless guard gets its own mutation, called out because this is the
exact shape `access/lists.ts` records: delete `if (!token) return false;`
and a test must fail. If none does, the test suite has no NULL-token row and
needs one.

---

### Task 9: Admin review

The Payload admin panel already renders the collection, so this task is the
*transitions*, not a bespoke UI: approve, reject with a reason, request
resubmission.

**Files:**
- Modify: `apps/site/src/collections/Sponsorships.ts` — admin-only field access on `rejectionReason`, `reviewedBy`, `reviewedAt`; a `beforeChange` that stamps the reviewer.

- [ ] **Step 1: Failing tests**

```ts
it("stamps reviewedBy and reviewedAt when an admin approves");
it("requires a rejection reason when rejecting", () => {
  // A rejected sponsor is owed a sentence. This is the only place it can
  // be required, because the admin panel's own required-ness is per field
  // and not per transition.
});
it("does not require one when approving");
it("refuses a non-admin setting reviewedBy");
it("refuses a re-edit token holder approving their own sponsorship");
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/collections/Sponsorships.review.int.test.ts
```
Expected: FAIL on the missing import, not on an assertion. A test that fails
on an assertion before the code exists is testing something else.

- [ ] **Step 3: Implement**

Follow the house pattern in `apps/site/src/endpoints/account.ts` and
`apps/site/src/endpoints/lists.ts`: `guardOrigin(req)` first, then
`readForm(req)`, then `localeFromForm`, then the signed-in or token check,
then the write, then `seeOther(...)`. Every answer is a redirect; the pages
carry no client JavaScript. Resolve every id from the form with
`overrideAccess: false`. Add the rewrite to `apps/site/next.config.ts` and
register the endpoint array in `apps/site/src/payload.config.ts`.

- [ ] **Step 4: Run until green**

```bash
cd /home/user/smog/apps/site && bunx vitest run src/collections/Sponsorships.review.int.test.ts
```

- [ ] **Step 5: Mutation-prove every guard**

One mutation per guard named in Step 1. For each: apply it, `grep` to
confirm it landed, run the **whole** file (never `-t`), record CAUGHT or
SURVIVED from the runner's own `Tests` line, restore, and byte-compare
against the backup. A SURVIVED mutation means the test is decorative — fix
the test, or delete the guard and say why. Do not adjust the record.

- [ ] **Step 6: Commit**

```bash
cd /home/user/smog && bun check && bun -F site check-types && bunx knip --no-progress --no-config-hints
cd apps/site && rm -rf .wrangler/state && bun run test
git add -A && git commit -m "feat(site): stamp and justify an admin's review decision"
```

---

### Task 10: Stage exit

- [ ] Re-measure the bundle: `CLOUDFLARE_ENV=staging bun run build:app && bun run check-bundle-size`. **Record the number and the delta from 7.31 MiB**, and state whether Stages 6 and 7 still fit in what is left. If this stage spent more than about 0.7 MiB, say so as a finding rather than as a footnote.
- [ ] Confirm no `app/**/route.ts` imports Payload: `find apps/site/src/app -name 'route.ts'` must return only the three under `(payload)/`.
- [ ] Confirm nothing under `apps/site` imports `@smog/auth` or WorkOS — `src/authBoundary.test.ts` already enforces this and must still pass.
- [ ] `bun release:check` green; `site-e2e` green.
- [ ] Re-run the Stage 1 referential-integrity mutations for `sponsorships.gesture` — the spec's ruling is "refuse, with a real message", and this stage adds the first non-admin writer of that relationship.
- [ ] State explicitly whether each exit criterion below is met.

## Stage 5 exit criteria

1. A sponsor can select up to `MAX_GESTURES_PER_SPONSORSHIP` (10) active gestures, enter their details, upload a logo, and reach Mollie's checkout.
2. A paid payment moves every sponsorship in it to `pending_approval`, exactly once, under retries and concurrent deliveries.
3. A failed, expired or cancelled payment resolves the sponsorship rather than leaving it pending forever.
4. No status transition outside the table is reachable, including through `overrideAccess`.
5. Every status change appends one `admin-logs` row, written with `overrideAccess`, and a failed log never fails the transition.
6. A re-edit token reads and writes exactly one sponsorship, expires, and cannot approve itself or change the amount.
7. An admin can approve or reject from the Payload panel; rejecting requires a reason.
8. A gesture with an active in-term sponsorship cannot be sold the same window twice.
9. The bundle is measured and recorded, and no `app/**/route.ts` imports Payload.
