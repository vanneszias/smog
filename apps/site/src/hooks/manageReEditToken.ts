import type { CollectionBeforeChangeHook } from "payload";
import type { Sponsorship } from "@/payload-types";

/**
 * How long a re-edit link lives.
 *
 * Seven days, and deliberately not up for tuning: "how long does the link I
 * just sent a sponsor work for" is behaviour sponsors and administrators
 * already rely on.
 */
const RE_EDIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mints a re-edit token when a sponsorship enters `pending_resubmission`, and
 * destroys it when it leaves.
 *
 * ## Why this is the whole of "generate a re-edit link"
 *
 * Generating a re-edit link is one write: set the status to
 * `pending_resubmission`, set a fresh `crypto.randomUUID()` and set an expiry.
 * The statuses it may start from are `pending_approval`, `pending_resubmission`
 * and `rejected`, which is precisely the set `lib/sponsorshipStatus.ts` allows
 * into `pending_resubmission` — `rejected` included. So the admin does not need
 * a bespoke button: moving the status to `pending_resubmission` in the Payload
 * panel *is* the action, and this hook is what makes it mean something.
 *
 * `beforeChange` rather than `afterChange`, for the reason
 * `collections/Lists.ts` spells out for share tokens: an `afterChange` hook
 * cannot change the document it is told about, so it would need a second
 * write with `overrideAccess: true` and a `context` flag to stop that write
 * re-entering itself, and the response the caller already holds would carry
 * the old value. Here that is one write instead of two on a path with no
 * transactions behind it.
 *
 * It runs after field-level access has been applied — Payload 3.89.0 enforces
 * `field.access[operation]` in the `beforeValidate` *field* pass and
 * `collections/operations/utilities/update.js` orders that strictly before
 * the collection's `beforeChange` hooks — and it must, because `reEditToken`
 * is a credential no request may set for itself.
 *
 * ## Only on the transition, in both directions
 *
 * **Minting** fires when the status *becomes* `pending_resubmission`, and mints
 * unconditionally rather than with the `??` `Lists.ts` uses. Entering this
 * state is the act of issuing a capability; issuing one is issuing a new one,
 * with a new seven days, every time. Honouring a token supplied in the same
 * write would let a caller choose the secret.
 *
 * **Clearing** fires when the status *leaves* `pending_resubmission`, for
 * whatever reason — the sponsor resubmitting, an admin cancelling, an admin
 * pushing it back to the queue by hand. It is what makes the token one-shot,
 * and it is load-bearing well beyond tidiness: `pending_resubmission` may
 * legally become `pending_approval`, and `pending_approval` may legally
 * become `active`, so a token that survived its own use would be two ordinary
 * updates away from approving the sponsorship it belongs to.
 *
 * A create is left alone. Every sponsorship this app creates starts in
 * `pending_payment` (`lib/sponsorshipCreate.ts`), a create is not a
 * transition — the same reason `enforceStatusTransitions` polices none — and
 * leaving it alone is what lets the integration fixtures create a row in
 * `pending_resubmission` holding a token they chose, including an expired
 * one.
 */
export const manageReEditToken: CollectionBeforeChangeHook<Sponsorship> = ({
  data,
  operation,
  originalDoc,
}) => {
  if (operation !== "update" || originalDoc === undefined) {
    return data;
  }

  const from = originalDoc.status;
  // `data` is the whole merged document rather than the caller's patch —
  // Payload fills absent fields from `originalDoc` before this runs, which
  // `enforceStatusTransitions` documents — so an update that never mentions
  // `status` arrives carrying the current one and reads as "no transition".
  const to = data.status ?? from;

  if (from === to) {
    return data;
  }

  if (to === "pending_resubmission") {
    return {
      ...data,
      reEditToken: crypto.randomUUID(),
      reEditTokenExpiresAt: new Date(Date.now() + RE_EDIT_TTL_MS).toISOString(),
    };
  }

  if (from === "pending_resubmission") {
    return { ...data, reEditToken: null, reEditTokenExpiresAt: null };
  }

  return data;
};
