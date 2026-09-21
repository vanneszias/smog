import type { CollectionConfig } from "payload";
import { denyAll, isAdmin } from "@/access";

/**
 * One row per payment-provider delivery this app has taken responsibility
 * for. The unique `paymentId` is the lock.
 *
 * ## Why this collection exists at all
 *
 * `endpoints/mollie.ts` must move a sponsorship out of `pending_payment`
 * exactly once, and Mollie retries every non-2xx — sometimes with two
 * deliveries in flight at the same time. There are no transactions on any
 * write path here (`sqliteD1Adapter` is built without `transactionOptions`,
 * so `beginTransaction` resolves to `null`), so read-then-write cannot be
 * made atomic.
 *
 * The Stage 5 plan proposed doing without this table, by giving `update` a
 * `where` that names the status being moved *from* and treating "zero rows
 * changed" as "somebody else got there first". **Measured on this adapter, it
 * does not work.** `collections/operations/update.js` (3.89.0) resolves the
 * `where` with a separate `payload.db.find` and then updates each id it
 * found, and the adapter's `updateOne` does the same thing one layer down —
 * so the filter is a SELECT, not a conditional UPDATE. A probe running two
 * such updates concurrently against a real D1 had *both* report one changed
 * document; five concurrent updates had all five report one. The plan asked
 * for that to be verified rather than assumed, and this collection is what
 * the answer bought.
 *
 * A unique index is the one atomic primitive left: SQLite evaluates it inside
 * the INSERT, so of two concurrent creates exactly one succeeds and the other
 * raises a constraint violation. That violation is the guard.
 *
 * ## Why the claim is per payment and not per sponsorship
 *
 * A Mollie payment covers every sponsorship in one order — `lib/mollie.ts`
 * puts the whole list in `metadata.sponsorshipIds` — so "this delivery is
 * being handled" is a fact about the payment. The per-sponsorship writes that
 * follow are separately idempotent (an already-advanced row matches nothing
 * and produces no log entry), so the claim only has to serialise deliveries,
 * not individual rows.
 *
 * The endpoint **deletes its claim when it could not advance everything**,
 * which is what keeps that choice safe: a half-applied delivery leaves no
 * record saying it was handled, so replaying the webhook finishes the job
 * rather than being waved through.
 *
 * ## Access
 *
 * Written only by the endpoint, through the local API with
 * `overrideAccess: true` — the same arrangement as `admin-logs`, and for a
 * weaker reason than that collection's: nothing here is evidence, but a lock
 * anyone can POST to or delete is not a lock.
 */
export const WebhookDeliveries: CollectionConfig = {
  slug: "webhook-deliveries",
  admin: {
    useAsTitle: "paymentId",
    defaultColumns: ["paymentId", "createdAt"],
  },
  access: {
    read: isAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    // The whole point of the collection. `unique` is not an optimisation and
    // not a data-quality nicety: it is the only atomic operation this
    // database offers, and removing it silently turns the webhook back into
    // read-then-write.
    {
      name: "paymentId",
      type: "text",
      required: true,
      index: true,
      unique: true,
    },
  ],
};
