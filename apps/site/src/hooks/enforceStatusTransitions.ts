import type { CollectionBeforeChangeHook } from "payload";
import { APIError } from "payload";
import { canTransition } from "@/lib/sponsorshipStatus";
import type { Sponsorship } from "@/payload-types";

/** HTTP 400. Passed explicitly rather than relying on `APIError`'s default
 * of making anything other than a 500 public. */
const BAD_REQUEST = 400;

/**
 * Refuses a status transition the table in `lib/sponsorshipStatus.ts` does
 * not allow.
 *
 * `beforeChange` and not `beforeValidate`: `originalDoc` is what the
 * comparison needs and it is populated for an update by the time this runs.
 *
 * Nothing is refused on create — the field's own `defaultValue` and its
 * `options` already constrain what a new row may hold, and a create is not a
 * transition. The `operation` test is what does that, and it is load-bearing
 * rather than defensive: Payload's own types say `originalDoc` is
 * "`undefined` on 'create' operation", and in 3.89.0 it is not.
 * `collections/operations/create.js` passes `duplicatedFromDoc`, which is
 * `{}` for an ordinary create and the source document for a duplicate. So
 * `originalDoc === undefined` never fires; it is there to narrow the
 * optional property for TypeScript, and dropping it fails the typecheck
 * rather than changing behaviour.
 *
 * It is a hook rather than an access rule on purpose. Every server-side
 * writer runs with `overrideAccess: true` — the Mollie webhook, the
 * admin-log hook, the re-edit endpoint — so a guard the access layer could
 * bypass would be a guard none of them is subject to.
 *
 * `APIError` with an explicit `isPublic`, for the reason
 * `blockDeleteWhenSponsored` documents: the bulk-update path collects
 * `{ id, isPublic, message }` per document rather than rethrowing, and a
 * bare `Error` reaches the admin panel as "Something went wrong".
 */
export const enforceStatusTransitions: CollectionBeforeChangeHook<
  Sponsorship
> = ({ data, operation, originalDoc }) => {
  if (operation !== "update" || originalDoc === undefined) {
    return data;
  }

  const from = originalDoc.status;
  const to = data.status;

  // `data` is the whole merged document here, not the caller's patch:
  // `fields/hooks/beforeValidate/promise.js` (3.89.0) fills every absent
  // field from `originalDoc` through `getFallbackValue` before the
  // collection's `beforeChange` runs, so an update that sends only
  // `sponsorName` still arrives carrying its current `status`. An earlier
  // draft treated an absent `status` as "not a transition" and returned
  // early; the mutation that deletes that branch survives the whole suite,
  // because nothing can reach it. What is left is the `undefined` arm
  // `Partial<Sponsorship>` needs to narrow — dropping it fails the
  // typecheck rather than changing behaviour.
  if (to !== undefined && !canTransition(from, to)) {
    throw new APIError(
      `A sponsorship cannot go from ${from} to ${to}.`,
      BAD_REQUEST,
      undefined,
      true
    );
  }

  return data;
};
