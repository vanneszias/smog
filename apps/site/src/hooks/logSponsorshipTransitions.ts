import type { CollectionAfterChangeHook } from "payload";
import type { Sponsorship } from "@/payload-types";

/** The `admin-logs.action` every sponsorship status change is filed under. */
const ACTION = "sponsorship.status_changed";

/**
 * Appends one `admin-logs` row per sponsorship status change.
 *
 * ## Why a hook, and why `overrideAccess: true`
 *
 * `admin-logs` denies `create` to everyone, admins included — see
 * `access/denyAll` for why that is the point rather than an oversight. The
 * only door left is the local API, where `overrideAccess: true` skips
 * `denyAll`. So this is not a convenience flag: without it the collection is
 * unwritable and the audit trail is permanently empty, which is precisely the
 * failure `collections/AdminLogs.int.test.ts` calls "half 2".
 *
 * ## Why `afterChange` and not `beforeChange`
 *
 * There are no transactions on any write path — `sqliteD1Adapter` is built
 * without `transactionOptions`, so `beginTransaction` resolves to `null` and
 * nothing is ever rolled back. That makes ordering the only tool available, and
 * it points one way: the log follows the change it describes. A `beforeChange`
 * log would record transitions that then failed their own write, and nothing
 * would remove the row.
 *
 * The same reasoning is why the `catch` below swallows. By the time this runs
 * the sponsorship has already moved; rethrowing would report a failure for a
 * write that happened. For the Mollie webhook that is worse than losing a log
 * line: Mollie retries every non-2xx, so a throw here turns one successful
 * payment into an endless redelivery of a transition that already succeeded.
 *
 * ## What "no log row" means
 *
 * Only a *change* is logged. Every update re-submits `status` — Payload fills
 * absent fields from `originalDoc` before `beforeChange` runs, which
 * `enforceStatusTransitions` documents — so an admin renaming a sponsor
 * arrives here with `doc.status === previousDoc.status`. Logging those would
 * bury the transitions under one row per edit.
 *
 * A create is not a transition either, for the same reason
 * `enforceStatusTransitions` refuses to police one: a new row has no previous
 * status to move from. The `operation` test is what expresses that, and it is
 * load-bearing — `previousDoc` is `{}` on a create, so without it every
 * sponsorship would be born with a `undefined -> pending_payment` log row.
 */
export const logSponsorshipTransitions: CollectionAfterChangeHook<
  Sponsorship
> = async ({ doc, operation, previousDoc, req }) => {
  if (operation !== "update" || previousDoc.status === doc.status) {
    return doc;
  }

  try {
    await req.payload.create({
      collection: "admin-logs",
      data: {
        action: ACTION,
        // Both ends, not just the new one. "It is `cancelled` now" does not
        // say whether a sponsor was refunded before paying or pulled after
        // going live, and the previous value is the half no other row holds.
        metadata: { from: previousDoc.status, to: doc.status },
        targetId: String(doc.id),
        targetType: "sponsorships",
        // Null for the webhook and for every job, by design: `admin-logs.user`
        // is deliberately optional so that an entry with an unknown actor
        // still gets written.
        user: req.user?.id ?? null,
      },
      overrideAccess: true,
      req,
    });
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      `[logSponsorshipTransitions] Failed to log sponsorship ${doc.id} moving from ${previousDoc.status} to ${doc.status}`
    );
  }

  return doc;
};
