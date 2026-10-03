/**
 * The fan-out marker of a payment (KV `mollie:fanout:<paymentId>`): a
 * `payment.settled` for it was enqueued in the last few minutes, so the
 * Mollie webhook's `already` outcome need not enqueue another. It is
 * written only after a successful enqueue, so a failed one (a 503 and its
 * retry, a poll whose enqueue was lost) always resends:
 * - by the webhook after an `already` fan-out (a replay throttle);
 * - by `sponsorships.paymentStatus` after the poll settled the payment
 *   (Phase 6 fix wave, payments M-2): the webhook that follows a few
 *   seconds later is `already`, and without the marker the sponsor emails
 *   would rest on the email consumer's best-effort KV dedupe alone.
 * The hourly reconciliation re-sends a fan-out that was still lost.
 * It is a filter, not a lock: KV may serve a missing key for a minute.
 */

/** How long the marker lives: the reconciliation's 5-minute grace. */
export const FANOUT_MARKER_TTL_S = 5 * 60;

function fanoutKey(paymentId: string): string {
  return `mollie:fanout:${paymentId}`;
}

/** Whether a fan-out for this payment was enqueued in the last 5 minutes. */
export async function recentFanout(
  kv: KVNamespace,
  paymentId: string
): Promise<boolean> {
  try {
    return (await kv.get(fanoutKey(paymentId))) !== null;
  } catch (error) {
    console.error("[sponsorships] Failed to read the fan-out marker:", error);
    return false;
  }
}

/** Records a successful fan-out enqueue; a KV failure is logged. */
export async function markFanout(
  kv: KVNamespace,
  paymentId: string
): Promise<void> {
  try {
    await kv.put(fanoutKey(paymentId), "1", {
      expirationTtl: FANOUT_MARKER_TTL_S,
    });
  } catch (error) {
    console.error("[sponsorships] Failed to write the fan-out marker:", error);
  }
}
