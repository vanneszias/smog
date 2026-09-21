import type { CollectionConfig } from "payload";
import { denyAll, isAdmin } from "@/access";

/**
 * One row per render callback this app has taken responsibility for. The
 * unique `jobId` is the lock.
 *
 * ## Why this is a second table and not `renders`
 *
 * The plan said to reuse Task 1's claim on the `renders` row, and **that
 * cannot work**. `collections/Renders.ts` says so in its own doc block, and
 * this collection is the consequence.
 *
 * A `renders` row is created by the *submitter*, at checkout, because the
 * submitter is the only party that knows which sponsorship the job is for. So
 * by the time Remotion Lambda calls back the row already exists, and two
 * concurrent callbacks inserting against `renders.jobId` would **both** lose
 * the race — neither would upload, and a paid-for render would be dropped by
 * the very mechanism meant to protect it.
 *
 * Nor can the callbacks be serialised by updating that row, however the
 * filter is phrased. **A `where` on an update is a SELECT, not a conditional
 * UPDATE**: Payload's `collections/operations/update.js` (3.89.0) resolves it
 * with a separate `payload.db.find` and then updates each id it found, and the
 * adapter's `updateOne` does the same one layer down. Measured against a real
 * D1, two concurrent conditional updates on one row both reported a changed
 * document; five concurrent ones all five did. There are no transactions to
 * fall back on either — `sqliteD1Adapter` is built without
 * `transactionOptions`, so `beginTransaction` resolves to `null`.
 *
 * A unique index is the one atomic primitive this database offers, because
 * SQLite evaluates it inside the INSERT. Serialising two callbacks therefore
 * needs **its own insert against its own unique index**, which is what this
 * table is. It is `collections/WebhookDeliveries.ts` applied to a different
 * provider, for the same reason and with the same failure mode.
 *
 * ## What one row costs if it is wrong
 *
 * The thing being serialised is `POST https://api.mux.com/video/v1/assets`.
 * Two callbacks that both get past this claim create two Mux assets for one
 * render, and only one of them is ever referenced. The other is not a stray
 * record, it is **a bill that arrives every month, for ever**, for a video
 * nothing points at and nobody can name. AWS's delivery contract for a Lambda
 * callback is at-least-once, so the second callback is not a hypothetical.
 *
 * ## Why the claim is not deleted on the happy path
 *
 * `endpoints/render.ts` hands the claim back when the work did not complete —
 * a Mux outage, mainly — for the reason `endpoints/mollie.ts` documents: a
 * claim that outlives the work it covers is worse than no claim at all,
 * because the retry that would have finished the job is waved through as a
 * replay. A claim that *did* cover completed work stays, for ever: a render
 * job id is used once (`ready` and `failed` have no outgoing edges, so a
 * re-render is a new job with a new id), so nothing legitimate ever needs the
 * row back.
 *
 * ## Why this is not yet a general `claims` collection
 *
 * There will be at least four consumers — this, the Mollie webhook, and Stage
 * 7's `expire-sponsorships` and `cleanup-stale-payments`. One `claims`
 * collection keyed on an opaque string is the right abstraction *then*, when
 * all four are visible and it can be done once. Doing it here would mean
 * editing Stage 5's shipped and mutation-proven webhook mid-stage to serve an
 * abstraction with two users. **Stage 7 owns that refactor.**
 *
 * ## Access
 *
 * Admin-only read; nothing may be written over the API at all, exactly as for
 * `webhook-deliveries` and `renders`. The only legitimate writer is the
 * callback, going through the local API with `overrideAccess: true`. A lock
 * anyone can POST to or delete is not a lock.
 */
export const RenderCompletions: CollectionConfig = {
  slug: "render-completions",
  admin: {
    useAsTitle: "jobId",
    defaultColumns: ["jobId", "createdAt"],
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
    // database offers, and removing it silently turns the callback back into
    // read-then-write — which is to say, into two Mux assets.
    {
      name: "jobId",
      type: "text",
      required: true,
      index: true,
      unique: true,
    },
  ],
};
