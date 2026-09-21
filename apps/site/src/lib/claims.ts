import type { Payload } from "payload";

/**
 * One claim table, and the two operations every consumer of it performs.
 *
 * ## Why there is one table and not four
 *
 * `webhook-deliveries` (Stage 5) and `render-completions` (Stage 6) were the
 * same table twice: one row per opaque key, one unique index, an insert that
 * either wins or loses. `collections/RenderCompletions.ts` said so at the time
 * and deferred the merge to the stage where all the consumers would be
 * visible. There are now four — the Mollie webhook, the render callback, the
 * job runner, and `cleanup-stale-payments` after it — so this is that merge.
 *
 * **Nothing about the mechanism changes**, because the mechanism is the only
 * part that was ever load-bearing:
 *
 * - **A `where` on an update is a SELECT, not a conditional UPDATE.** Measured
 *   on this adapter: `collections/operations/update.js` (3.89.0) resolves the
 *   filter with a separate `payload.db.find` and then updates each id it
 *   found, and the adapter's `updateOne` does the same one layer down. Two
 *   concurrent conditional updates on one row both reported a changed
 *   document; five concurrent ones all five did.
 * - **There are no transactions.** `sqliteD1Adapter` is built without
 *   `transactionOptions`, so `beginTransaction` resolves to `null`.
 * - **A unique index is the one atomic primitive**, because SQLite evaluates
 *   it inside the INSERT. Of two concurrent creates exactly one succeeds.
 * - **Payload's own `unique` pre-check is a read and then a write** and does
 *   not serialise, which is why the losing writer gets a raw `Failed query:
 *   insert into "claims" ...` rather than a `ValidationError` — and why
 *   `takeClaim` confirms a failure by reading the row back instead of assuming
 *   one. A database outage and a lost race are the same exception otherwise,
 *   and treating an outage as a replay silently drops paid-for work.
 *
 * ## The key is namespaced by kind
 *
 * A Mollie payment id and a Remotion job id are both opaque strings handed to
 * this application by somebody else. Nothing stops them being equal, and if
 * they were, one consumer would find the other's claim already taken and skip
 * work it was the only party able to do. So the stored key is
 * `` `${kind}:${key}` `` and the unique index is on that composite.
 *
 * The separator is safe because `kind` comes from {@link CLAIM_KINDS} — a
 * closed set, checked by the collection's `select` field — and no member of it
 * contains a colon. Without that, `("a:b", "c")` and `("a", "b:c")` would
 * produce the same string, which is the collision this exists to prevent
 * wearing a different hat.
 *
 * ## A lease and a receipt are both claims, and confusing them is the bug
 *
 * `expiresAt` is **optional**, and which way it goes is a decision per
 * consumer, not a default:
 *
 * - **No expiry — a receipt.** The row says the work was done, and it is kept
 *   for ever. `render-completion` must be this: a render job id is used once
 *   (`ready` and `failed` have no outgoing edges), and a completion claim that
 *   expired would let a replayed Lambda callback — AWS's contract is
 *   at-least-once — create a *second* Mux asset for one render. That is not a
 *   stray record, it is a bill that arrives every month for a video nothing
 *   points at. `mollie-delivery` is the same shape for the same reason.
 * - **An expiry — a lease.** The row says somebody is working right now, and a
 *   worker that dies holding it must not stop the work for ever. `job-run` is
 *   this: the runner is driven by a cron, and a claim with no expiry would
 *   mean one crashed invocation silently ends scheduled work until a human
 *   notices.
 *
 * Both mistakes are quiet. Give the render claim a TTL and the damage is a
 * recurring bill; give the job lease none and the damage is four jobs that
 * stopped running. Neither raises an error.
 */

/**
 * Every kind of work this application serialises, and the only values the
 * `claims.kind` column may hold.
 *
 * Adding a member is adding a consumer. Renaming one **orphans every existing
 * row of the old name**, which for `render-completion` means every completed
 * render becomes replayable — so a rename is a data migration, not an edit.
 *
 * Adding one is *not* a schema change, checked rather than assumed: the
 * collection's `select` field is a plain `text` column in SQLite with no CHECK
 * constraint (`20260921_180000_add_claims`), so the set is enforced by
 * Payload's validation and by this type, and only `payload-types.ts` changes.
 */
export const CLAIM_KINDS = {
  /** `endpoints/jobs.ts` — a lease on the scheduled-job runner. Expires. */
  jobRun: "job-run",
  /** `endpoints/mollie.ts` — one payment delivery. Kept for ever. */
  mollieDelivery: "mollie-delivery",
  /** `endpoints/render.ts` — one render callback. Kept for ever. */
  renderCompletion: "render-completion",
  /**
   * `jobs/cleanupStalePayments.ts` — a lease on sweeping one abandoned
   * checkout. Expires, and is kept until it does.
   *
   * The odd one out, and worth saying why rather than leaving it to look like
   * the others. It is a **lease**, because a sweeper that dies holding a
   * receipt would strand that sponsorship in `pending_payment` for ever —
   * which is the exact gap the job exists to close, recreated by its own
   * lock. But unlike `job-run` it is *not* released when the work succeeds:
   * a lapsed lease and a cancelled sponsorship are both "nothing left to do
   * here", and keeping it is what makes the second run of a sweep
   * distinguishable from the first at all. The job clears its own lapsed
   * leases at the start of each run, because nothing else ever will.
   */
  stalePayment: "stale-payment",
} as const;

type ClaimKind = (typeof CLAIM_KINDS)[keyof typeof CLAIM_KINDS];

/** The list the collection's `select` field offers, derived rather than repeated. */
export const CLAIM_KIND_VALUES: ClaimKind[] = Object.values(CLAIM_KINDS);

interface ClaimRef {
  /** The opaque, caller-supplied half — a payment id, a job id, a queue name. */
  key: string;
  kind: ClaimKind;
}

/** The stored key: the kind, a colon, and the caller's string. */
function storedKey({ key, kind }: ClaimRef): string {
  return `${kind}:${key}`;
}

/**
 * Clears a lease whose holder never came back.
 *
 * Runs **before** the insert rather than after a failed one, and that ordering
 * is what keeps it race-free. Two workers may both find the same expired row
 * and both delete it: the second delete matches nothing, both then insert, and
 * the unique index still lets exactly one through. Ordering it the other way —
 * insert, fail, then clear and retry — lets the second worker delete the row
 * the *first* one just won with.
 *
 * A live claim cannot be caught by this. The `expiresAt` comparison is
 * evaluated by the delete's own query, and a receipt (no `expiresAt` at all)
 * never satisfies a comparison against NULL — which is precisely why
 * `render-completion` is safe to store in the same table as a lease.
 */
async function clearExpired(payload: Payload, key: string): Promise<void> {
  await payload.delete({
    collection: "claims",
    overrideAccess: true,
    where: {
      and: [
        { key: { equals: key } },
        { expiresAt: { less_than_equal: new Date().toISOString() } },
      ],
    },
  });
}

/**
 * Takes the claim, answering `false` if somebody else already holds it.
 *
 * `ttlMs` makes it a lease; leaving it out makes it a receipt. See the module
 * note — the choice is per consumer and both mistakes are silent.
 *
 * The `catch` cannot simply assume a duplicate. A create also fails when the
 * database is unreachable, and reporting that as "somebody else handled it"
 * would wave through a Mollie delivery nothing was done about or drop a render
 * somebody paid minutes of Lambda time for. So a failure is confirmed by
 * reading the row back: if it is there, the insert lost a race it was meant to
 * lose; if it is not, something else is wrong and the error is rethrown for the
 * caller to answer a non-2xx with.
 */
export async function takeClaim(
  payload: Payload,
  claim: ClaimRef & { ttlMs?: number }
): Promise<boolean> {
  const key = storedKey(claim);

  if (claim.ttlMs !== undefined) {
    // Only a kind that takes leases can ever have left an expired row, so the
    // two extra queries stay on the one consumer that needs them — the Mollie
    // webhook and the render callback run exactly the queries they ran before
    // this table existed.
    await clearExpired(payload, key);
  }

  try {
    await payload.create({
      collection: "claims",
      data: {
        expiresAt:
          claim.ttlMs === undefined
            ? null
            : new Date(Date.now() + claim.ttlMs).toISOString(),
        key,
        kind: claim.kind,
      },
      overrideAccess: true,
    });

    return true;
  } catch (error) {
    const { totalDocs } = await payload.find({
      collection: "claims",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: key } },
    });

    if (totalDocs === 0) {
      throw error;
    }

    return false;
  }
}

/**
 * Gives the claim back, so the work it covered can be attempted again.
 *
 * Every consumer releases when the work did **not** complete, and that is what
 * makes a receipt safe to keep for ever: a claim that outlives half-finished
 * work is worse than no claim at all, because the retry that would have
 * finished the job is waved through as a replay.
 *
 * A failure to release is logged rather than thrown. The caller is already on a
 * failure path by the time it gets here, and replacing whatever went wrong with
 * "could not delete a row" would lose the original fault. `consequence` is the
 * caller's own sentence about what the undeleted row now means, because only
 * the caller knows.
 */
export async function releaseClaim(
  payload: Payload,
  claim: ClaimRef & { consequence: string }
): Promise<void> {
  const key = storedKey(claim);

  try {
    await payload.delete({
      collection: "claims",
      overrideAccess: true,
      where: { key: { equals: key } },
    });
  } catch (error) {
    payload.logger.error({ err: error }, claim.consequence);
  }
}
