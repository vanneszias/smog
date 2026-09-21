import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";
import { APIError } from "payload";
import { denyAll, isAdmin } from "@/access";
import { canAdvance, RENDER_STATES, type RenderState } from "@/lib/renderState";
import type { Render } from "@/payload-types";

/** HTTP 400, passed explicitly for the reason `enforceStatusTransitions` gives. */
const BAD_REQUEST = 400;

/**
 * Refuses a state change the table in `lib/renderState.ts` does not allow.
 *
 * Modelled on `hooks/enforceStatusTransitions.ts`, and a hook rather than an
 * access rule for the same reason: every writer this stage adds runs with
 * `overrideAccess: true`, so a guard the access layer could bypass would be a
 * guard nothing in this stage is subject to. It lives in this file rather than
 * in `hooks/` because it has exactly one collection and no second caller.
 *
 * `data` is the whole merged document by the time a collection `beforeChange`
 * runs — `fields/hooks/beforeValidate/promise.js` (3.89.0) fills every absent
 * field from `originalDoc` — so an update that sends only `failureReason`
 * still arrives carrying its current `state`. The `undefined` arm is what
 * narrows `Partial<Render>` for TypeScript; dropping it fails the typecheck
 * rather than changing behaviour.
 */
const enforceRenderStateTransitions: CollectionBeforeChangeHook<Render> = ({
  data,
  operation,
  originalDoc,
}) => {
  if (operation !== "update" || originalDoc === undefined) {
    return data;
  }

  const from = originalDoc.state;
  const to = data.state;

  if (to !== undefined && !canAdvance(from, to)) {
    throw new APIError(
      `A render cannot go from ${from} to ${to}.`,
      BAD_REQUEST,
      undefined,
      true
    );
  }

  return data;
};

/**
 * One row per render job submitted to Remotion Lambda. The unique `jobId` is
 * the claim.
 *
 * ## Why the unique index, again
 *
 * This is `collections/WebhookDeliveries.ts` applied to renders, and its doc
 * block is the long version. The short one: there are no transactions here
 * (`sqliteD1Adapter` is built without `transactionOptions`, so
 * `beginTransaction` resolves to `null`), and **a `where` on an update is a
 * SELECT, not a conditional UPDATE** — Payload resolves the filter with a
 * separate `payload.db.find` and then updates each id it found. Measured
 * against a real D1: two concurrent conditional updates on one row both
 * reported a changed document; five concurrent ones all five did. Payload's
 * own `unique` pre-check has the same shape, a read then a write, and does
 * not serialise either.
 *
 * A unique index is the one atomic operation this database offers, because
 * SQLite evaluates it inside the INSERT. `jobId` carrying one is therefore not
 * a data-quality nicety — remove it and `claimRenderJob` silently becomes
 * read-then-write, which is to say it becomes nothing at all.
 *
 * ## What one row means, and what it does not
 *
 * A row is a job *this application submitted and owns*. It is created by the
 * submitter, which is the only party that knows which sponsorship the job is
 * for — `claimRenderJob` will not create one without it.
 *
 * **That has a consequence for the callback, and it is worth stating here
 * rather than letting the next task discover it.** Because the row already
 * exists by the time Remotion Lambda calls back, the callback cannot claim
 * the job by inserting this row — both of two concurrent callbacks would lose
 * the insert and neither would upload. Serialising two callbacks for one job
 * needs its own insert against its own unique index (the `webhook-deliveries`
 * shape, a row per callback delivery), or else moving row creation into the
 * callback and dropping `queued`. It cannot be done by updating this row,
 * whatever the `where` says.
 *
 * ## Retries are new rows
 *
 * `ready` and `failed` have no outgoing edges, so a render that must be done
 * again is submitted as a new job with a new id and gets a new row. Reusing a
 * finished row would let a second callback overwrite the first one's
 * `muxAssetId` — and an unreferenced Mux asset is a bill that arrives every
 * month, for ever, with nothing pointing at the thing being paid for.
 *
 * ## Access
 *
 * Admin-only read; nothing may be written over the API at all. Nothing public
 * ever needs a render row — the public page reads a playback id off the
 * sponsorship — and the callback writes through the local API with
 * `overrideAccess: true`. A lock anyone can POST to or delete is not a lock.
 */
export const Renders: CollectionConfig = {
  slug: "renders",
  admin: {
    useAsTitle: "jobId",
    defaultColumns: ["jobId", "state", "sponsorship", "createdAt"],
  },
  access: {
    read: isAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  hooks: {
    beforeChange: [enforceRenderStateTransitions],
  },
  fields: [
    // The whole point of the collection. `unique` is the only atomic
    // operation available; see the doc block above before touching it.
    {
      name: "jobId",
      type: "text",
      required: true,
      index: true,
      unique: true,
    },
    /**
     * The sponsorship this render is for.
     *
     * **Not `required`, and that is measured rather than preferred.** Payload
     * emits `ON DELETE set null` for every relationship whether or not the
     * column can hold NULL, so with `required: true` the DDL is a NOT NULL
     * column carrying a set-null foreign key — and deleting a sponsorship
     * that has a render row fails with a raw `Failed query: delete from
     * "sponsorships"`, which reaches an administrator as "Something went
     * wrong". Probed against this app's own D1 before this field was written;
     * `user_consents.user` is the same defect, found the same way, and
     * `20260919_222612_nullable_consent_user` is the migration that fixed it.
     *
     * The nullable column is also the better behaviour, not merely the
     * working one: a render that outlives its sponsorship still knows the
     * `muxAssetId` that Mux charges for every month, so the row is exactly
     * what a cleanup has left to work from. A deleted sponsorship with no
     * surviving render row is an asset nobody can name.
     *
     * Nothing may *create* a row without one — `claimRenderJob` takes the
     * sponsorship id as a mandatory argument — so the only way a render has
     * no sponsorship is that the sponsorship was deleted afterwards. Callers
     * that read it back have to handle that.
     */
    {
      name: "sponsorship",
      type: "relationship",
      relationTo: "sponsorships",
      index: true,
    },
    {
      name: "state",
      type: "select",
      required: true,
      index: true,
      defaultValue: "queued" satisfies RenderState,
      // Spread from `RENDER_STATES` rather than restated, so the table that
      // decides which moves are legal and the column that stores the result
      // cannot drift apart. `renderState.test.ts` asserts the two agree.
      options: [...RENDER_STATES],
    },
    /** Mux's asset id, which is what expiry deletes. */
    { name: "muxAssetId", type: "text" },
    /** Mux's playback id, which is what the public page ends up playing. */
    { name: "muxPlaybackId", type: "text" },
    /** Whatever Lambda or Mux said went wrong, kept verbatim for an operator. */
    { name: "failureReason", type: "textarea" },
    /**
     * How many times this job has been submitted to Lambda.
     *
     * `defaultValue` without `required`, deliberately. Payload's
     * `RequiredDataFromCollectionSlug` marks a `required` field as mandatory
     * on create *even when it has a default* — the problem
     * `SPONSORSHIP_DEFAULTS` exists to work around — so requiring it would
     * force every writer to restate the zero the default is there to supply,
     * and the two would eventually disagree. The column is still born `0`.
     */
    { name: "attempts", type: "number", defaultValue: 0 },
  ],
};
