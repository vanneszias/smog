import type { CollectionBeforeChangeHook } from "payload";
import { APIError } from "payload";
import type { Sponsorship } from "@/payload-types";

/** HTTP 400, passed explicitly for the reason `enforceStatusTransitions` gives. */
const BAD_REQUEST = 400;

/**
 * The two statuses that are a *decision about* a sponsorship rather than a
 * step of the flow it is already in.
 *
 * `pending_resubmission` is deliberately not one of them: asking for changes
 * is not yet a verdict, so it stamps no `reviewedBy` and no `reviewedAt`,
 * where approving and rejecting both do.
 */
const DECISIONS: ReadonlySet<string> = new Set(["active", "rejected"]);

/** The reviewer's id, whatever depth the document came back at. */
function reviewerId(value: Sponsorship["reviewedBy"]): null | number {
  if (typeof value === "object" && value !== null) {
    return value.id;
  }

  return value ?? null;
}

/**
 * Stamps who decided a sponsorship's fate and when, and refuses a rejection
 * with nothing to tell the sponsor.
 *
 * ## Why a hook, and not field access
 *
 * The obvious guard is admin-only field access on `rejectionReason`,
 * `reviewedBy` and `reviewedAt`. Written as `access.update: isAdminField` those
 * three guards would be **unreachable**, and a mutation sweep would show all
 * three surviving: `sponsorships.update` is already `isAdmin` at the document
 * level, so a non-admin never reaches the field pass at all — and the writers
 * that *do* get past the document rule are the ones running
 * `overrideAccess: true`, which skips field access too. A guard nothing can
 * reach is not a weaker guard, it is a comment.
 *
 * So it is a hook, for exactly the reason `enforceStatusTransitions`
 * documents for the transition table: every server-side writer runs with
 * `overrideAccess: true` — the Mollie webhook, the re-edit endpoint, the
 * admin-log hook — so a guard the access layer could bypass would be a guard
 * none of them is subject to. A hook is subject to all of them.
 *
 * ## What it does
 *
 * - **On a review decision**, it writes `reviewedBy` and `reviewedAt` itself
 *   from the request rather than from the submitted data. Who reviewed a
 *   sponsorship is a fact about the request, not a field somebody fills in,
 *   and a posted `reviewedBy` is a claim. `null` when there is no user, which
 *   is the same convention `logSponsorshipTransitions` uses for the webhook
 *   and for every job: an entry with an unknown actor still gets written.
 * - **On every other write by a non-admin**, it puts the stored values back.
 *   That is the half that answers "refuses a non-admin setting `reviewedBy`":
 *   the re-edit endpoint writes with `overrideAccess: true`, so the only
 *   thing between a sponsor's form and the review columns is this line. An
 *   administrator is left alone, because correcting the record by hand in the
 *   panel is a legitimate thing for one to do and nothing else can.
 * - **A rejection needs a reason.** This is the only place it can be
 *   required: the admin panel's own `required` is per field and not per
 *   transition, and a `rejectionReason` marked required would make every
 *   approval unsaveable. `data` is the merged document, so a sponsorship
 *   rejected a second time keeps the reason it already carries.
 */
export const stampReviewDecision: CollectionBeforeChangeHook<Sponsorship> = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== "update" || originalDoc === undefined) {
    return data;
  }

  const from = originalDoc.status;
  // `data` is the whole merged document rather than the caller's patch, which
  // `enforceStatusTransitions` documents; an update that never mentions
  // `status` arrives carrying the current one and is not a decision.
  const to = data.status ?? from;

  if (from !== to && DECISIONS.has(to)) {
    if (to === "rejected" && (data.rejectionReason ?? "").trim() === "") {
      throw new APIError(
        "A rejected sponsorship needs a reason the sponsor can be given.",
        BAD_REQUEST,
        undefined,
        true
      );
    }

    return {
      ...data,
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.user?.id ?? null,
    };
  }

  if (req.user?.role === "admin") {
    return data;
  }

  return {
    ...data,
    reviewedAt: originalDoc.reviewedAt ?? null,
    reviewedBy: reviewerId(originalDoc.reviewedBy),
  };
};
