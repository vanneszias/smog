import type { Payload } from "payload";
import { CLAIM_KINDS, releaseClaim, takeClaim } from "@/lib/claims";
import type { Sponsorship } from "@/payload-types";

/**
 * Cancels a checkout nobody ever paid for, so the gesture it reserved can be
 * sold again.
 *
 * Stage 7 owns the scheduler. **This module owns the operation**, on the
 * precedent `jobs/expireSponsorships.ts` set, so scheduling it is wiring
 * rather than design.
 *
 * ## The gap this closes, recorded as live at Stage 5's exit
 *
 * `lib/sponsorSelection.ts` refuses to sell a gesture that has a
 * `pending_payment` sponsorship against it — deliberately, because two
 * sponsors both checking out for one gesture is the failure that costs money
 * to unwind. The other half of that rule was never built: a row whose Mollie
 * call *failed* (`endpoints/sponsorships.ts` logs "they stay in
 * pending_payment with no payment id") has nothing that will ever move it, so
 * the gesture it reserved is unsellable for ever. Every test below that
 * asserts a cancellation asserts the gesture through `resolveSponsorSelection`
 * as well, because "the status changed" is not the thing anybody wanted.
 *
 * ## Review Focus 5: not a checkout the sponsor is still paying for
 *
 * Two different rows look alike from a distance, and only one of them may be
 * cancelled:
 *
 * - **no `molliePaymentId`** — this application never got a checkout open.
 *   Nothing at Mollie refers to it, no webhook will ever arrive, and the row
 *   is abandoned in the only sense that matters.
 * - **a `molliePaymentId`** — a payment exists at Mollie. It may still be
 *   paid, and Mollie's webhook may arrive minutes or hours later; Mollie
 *   expires its own payments and delivers that too, which
 *   `endpoints/mollie.ts` turns into a cancellation. Cancelling it here would
 *   take money for a sponsorship the sponsor will never get.
 *
 * **The guard is applied to a re-read of the row, immediately before the
 * write, and not to the row the candidate query returned.** That is the same
 * ruling `expireSponsorships.ts` records for `releaseAsset`: a decision made
 * from a document a caller is holding is a decision about the past. The
 * webhook can land between the query and the write, and re-reading is what
 * makes "the payment arrived mid-sweep" a decision rather than a race.
 *
 * It narrows the window and cannot close it — there are no transactions here.
 * What closes it is underneath: `hooks/enforceStatusTransitions.ts` refuses
 * `pending_approval -> cancelled`, so a payment that lands *after* the
 * re-read makes the write fail rather than succeed quietly. Both are needed.
 * The guard alone would be a race; the transition table alone would turn an
 * ordinary event into an error log and a failure count.
 *
 * ## The claim, and what it is and is not for
 *
 * Every row is swept under a claim, and it is worth being exact about what
 * that buys, because it is less than the claims in `endpoints/mollie.ts` and
 * `endpoints/render.ts` buy.
 *
 * It is **not** what makes the sweep safe to run twice. The status is:
 * `pending_payment -> cancelled` moves a row out of the candidate query, and
 * a second cancellation of an already-cancelled row is a no-op that
 * `canTransition` permits and `logSponsorshipTransitions` declines to log.
 * What the claim buys is that two *overlapping* sweeps — a slow run overtaken
 * by the next tick, which `endpoints/jobs.ts` bounds but cannot prevent —
 * divide the work rather than both doing all of it, at row granularity rather
 * than by taking the whole job.
 *
 * It is a **lease**, and the choice is the one `lib/claims.ts` says is silent
 * in both directions. A receipt — no expiry — would mean a sweeper that died
 * between claiming and cancelling left that sponsorship claimed for ever, and
 * so left its gesture unsellable for ever: this job's own lock recreating the
 * gap this job exists to close. The expiry is the backstop for that, and it is
 * shorter than the sweep's own interval so one crash costs no ticks at all.
 *
 * Unlike the run lease it is **not** released when the work succeeds, and that
 * is deliberate: `releaseClaim`'s contract is that a consumer gives the claim
 * back when the work did *not* happen, and "the sweep finished this row" is
 * exactly the state that should stop the next run from looking at it again.
 * The cost is a row that outlives its usefulness, which is why the sweep
 * clears its own lapsed leases before it starts — nothing else ever would.
 */

/** How long a row's sweep lease is good for. */
const LEASE_MS = 15 * 60 * 1000;

/**
 * How old a `pending_payment` row must be before it is abandoned.
 *
 * Twenty-four hours, from the spec. It is not a guess about Mollie's own
 * expiry — Mollie's is shorter, and a payment that expires there arrives here
 * as a webhook — it is a bound on how long a *failed* checkout may hold a
 * gesture. Long enough that no sponsor is interrupted mid-purchase by any
 * margin, short enough that a gesture is not off the market for a week.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How many rows one run takes on.
 *
 * Bounded for the reason `expireSponsorships.ts` records at length: an
 * unbounded read has already broken this suite once, at 132 bound parameters
 * against D1's documented cap of 100, and a scheduled job that reads a table
 * that grows with the product's history is a job that gets slower for ever.
 *
 * Oldest first, which is the opposite of that job's sweeps and for the
 * opposite reason: the row this one is looking for has been stuck the
 * longest, and a backlog larger than one page must not leave the oldest
 * abandoned checkout behind every newer one — the starvation Stage 6 Task 5
 * flagged, in the one ordering where it is trivial to avoid.
 */
const PAGE = 200;

/** What one run did, for the scheduler to log and a test to assert on. */
interface CleanupReport {
  cancelled: number;
  /** Rows a claim or a re-read said were not this run's to touch. */
  skipped: number;
  failures: number;
}

/** The claim one row is swept under. */
const sweepClaim = (id: number | string) =>
  ({ key: String(id), kind: CLAIM_KINDS.stalePayment }) as const;

/**
 * Drops this job's leases that have lapsed.
 *
 * A lease that is kept on success is a lease nothing releases, so without this
 * the table grows by one row per abandoned checkout for ever. It runs before
 * anything is claimed, and it can only ever remove a lapsed row: a live lease
 * fails the comparison, and the comparison is evaluated by the delete's own
 * query rather than by anything this process is holding — the same ordering
 * argument `lib/claims.ts` makes for `clearExpired`.
 *
 * **It reads the real clock, and deliberately not the `now` the sweep was
 * given.** The two are different clocks and conflating them cost this job a
 * failing test before it cost anything worse. `now` is the *window* boundary:
 * a logical instant, which a caller — a test, or a one-off sweep of a backlog
 * — may legitimately move forward to mean "treat everything older than this as
 * abandoned". A lease is not about the window at all; it is about whether
 * another worker is alive right now. Comparing an expiry against a `now` 25
 * hours in the future deletes every live lease in the table, which is a lock
 * that unlocks itself for whoever asks the biggest question — and
 * `takeClaim`'s own `clearExpired` reads the real clock, so the two would also
 * have disagreed about which rows exist.
 */
async function clearLapsedLeases(payload: Payload): Promise<void> {
  await payload.delete({
    collection: "claims",
    overrideAccess: true,
    where: {
      and: [
        { kind: { equals: CLAIM_KINDS.stalePayment } },
        { expiresAt: { less_than_equal: new Date().toISOString() } },
      ],
    },
  });
}

/**
 * The row as the database holds it right now, or `null` if it is gone.
 *
 * `find` rather than `findByID`, which throws for a deleted row — a
 * legitimate state, and one that should read as an answer rather than as an
 * exception to be caught and reinterpreted.
 */
async function reread(
  payload: Payload,
  id: number
): Promise<null | Sponsorship> {
  const { docs } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { id: { equals: id } },
  });

  return docs[0] ?? null;
}

/** Whether this row is still an abandoned checkout, asked of the database. */
function isAbandoned(sponsorship: null | Sponsorship): boolean {
  return (
    sponsorship !== null &&
    sponsorship.status === "pending_payment" &&
    !sponsorship.molliePaymentId
  );
}

export async function cleanupStalePayments(
  payload: Payload,
  now: Date
): Promise<CleanupReport> {
  const report: CleanupReport = { cancelled: 0, failures: 0, skipped: 0 };

  await clearLapsedLeases(payload);

  const { docs: candidates } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "createdAt",
    where: {
      and: [
        { status: { equals: "pending_payment" } },
        {
          createdAt: {
            less_than: new Date(now.getTime() - WINDOW_MS).toISOString(),
          },
        },
      ],
    },
  });

  for (const candidate of candidates) {
    if (
      !(await takeClaim(payload, {
        ...sweepClaim(candidate.id),
        ttlMs: LEASE_MS,
      }))
    ) {
      report.skipped += 1;
      continue;
    }

    // Asked of the database, not of `candidate`: the webhook may have advanced
    // this row since the query above, and the whole of Review Focus 5 is that
    // a sponsorship with a payment behind it is not this job's to cancel.
    if (!isAbandoned(await reread(payload, candidate.id))) {
      report.skipped += 1;
      await releaseClaim(payload, {
        ...sweepClaim(candidate.id),
        consequence: `[cleanupStalePayments] Could not release the lease on sponsorship ${candidate.id} after declining to cancel it; the next sweep will skip it until the lease lapses`,
      });

      continue;
    }

    try {
      await payload.update({
        collection: "sponsorships",
        data: { status: "cancelled" },
        id: candidate.id,
        overrideAccess: true,
      });
      report.cancelled += 1;
    } catch (error) {
      report.failures += 1;
      // The lease goes back, because the work did not happen. Keeping it would
      // mean this row waits out the whole lease before anything looks at it
      // again, which for a row that is blocking a sale is the wrong direction
      // to fail in.
      await releaseClaim(payload, {
        ...sweepClaim(candidate.id),
        consequence: `[cleanupStalePayments] Could not release the lease on sponsorship ${candidate.id} after failing to cancel it; it will be skipped until the lease lapses`,
      });
      payload.logger.error(
        { err: error },
        `[cleanupStalePayments] Failed to cancel abandoned sponsorship ${candidate.id}; its gesture stays blocked until the next sweep`
      );
    }
  }

  payload.logger.info(
    `[cleanupStalePayments] Cancelled ${report.cancelled} abandoned checkout(s); ${report.skipped} skipped, ${report.failures} failure(s)`
  );

  return report;
}
