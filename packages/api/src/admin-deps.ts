/**
 * The sponsorship operations the admin runs (phase 6 ruling 1), from
 * `@smog/sponsorships/server`: the admin never imports another feature's
 * server, so the composition root hands them over. The admin's own tests
 * import this file by relative path, so they run the exact wiring.
 */
import type { AdminSponsorshipServices } from "@smog/admin/server";
import {
  approveStatements,
  cancelPaymentStatements,
  forceExpireStatements,
  isGestureTaken,
  isStalePayment,
  isStaleTransition,
  markPaidStatements,
  recordRefundStatements,
  regenerateTokenStatements,
  rejectStatements,
  requestChangesStatements,
  SponsorshipActionError,
  settlePayment,
} from "@smog/sponsorships/server";

/**
 * A refusal the admin answers with a typed error: the builders' own
 * (`notFound`, `stale`, `noVideo`, …), a guard that fired in the batch (a
 * lost race: `stale`), or the partial unique index refusing a gesture that
 * was taken in between (`gestureTaken`).
 */
function sponsorshipRefusal(
  error: unknown
): ReturnType<AdminSponsorshipServices["refusalOf"]> {
  if (error instanceof SponsorshipActionError) {
    return error.reason;
  }
  if (isStaleTransition(error) || isStalePayment(error)) {
    return "stale";
  }
  if (isGestureTaken(error)) {
    return "gestureTaken";
  }
  return null;
}

export const adminSponsorshipServices: AdminSponsorshipServices = {
  approve: approveStatements,
  cancelPayment: cancelPaymentStatements,
  forceExpire: forceExpireStatements,
  markPaid: markPaidStatements,
  recordRefund: recordRefundStatements,
  refusalOf: sponsorshipRefusal,
  regenerateToken: regenerateTokenStatements,
  reject: rejectStatements,
  requestChanges: requestChangesStatements,
  settle: settlePayment,
};
