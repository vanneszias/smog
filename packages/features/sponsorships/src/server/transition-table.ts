/**
 * The sponsorship state machine (spec §5.5, ruling 6) as a pure table:
 * which event moves which status where. `transition()` is exhaustive over
 * every status × event pair; anything not listed is `null` (refused). The
 * events that are not transitions (`created`, `render_started`,
 * `refund_needed`, `token_issued`, `legacy`) only go into the trail.
 * `transitionStatements` (`./transition`) is the only writer of
 * `sponsorship.status` and refuses what this table refuses.
 */
import type { SponsorshipEventType, SponsorshipStatus } from "@smog/db/enums";

type From = Partial<Record<SponsorshipStatus, SponsorshipStatus>>;

/**
 * Paid, revived and resubmitted sponsorships go straight to `in_review`:
 * the sponsor message is an app-side end card over the gesture's own video
 * and nothing is rendered (phase 10b tasks 8 and 9). The render pipeline is
 * retired; `rendering` and `render_failed` remain readable statuses of old
 * rows, and `render_succeeded` is the one event that leaves them (the
 * retirement sweep, `retireRenderStates`, writes it with `retired: true`).
 */
const TABLE = {
  approved: { in_review: "live" },
  cancelled: { awaiting_payment: "cancelled" },
  changes_requested: {
    in_review: "changes_requested",
    rejected: "changes_requested",
  },
  expired: { expiring: "expired", live: "expired" },
  force_expired: { expiring: "expired", live: "expired" },
  marked_paid_manually: { awaiting_payment: "in_review" },
  payment_failed: { awaiting_payment: "cancelled" },
  payment_paid: { awaiting_payment: "in_review" },
  rejected: { changes_requested: "rejected", in_review: "rejected" },
  reminder_sent: { live: "expiring" },
  render_succeeded: { render_failed: "in_review", rendering: "in_review" },
  renewed: { expiring: "live", live: "live" },
  resubmitted: { changes_requested: "in_review" },
  revived: { cancelled: "in_review" },
} as const satisfies Partial<Record<SponsorshipEventType, From>>;

type Table = typeof TABLE;

/** The events that change a status (every other event is trail only). */
export type TransitionEvent = keyof Table;

export const TRANSITION_EVENTS = Object.keys(TABLE) as TransitionEvent[];

/** The status `event` moves `status` to, or `null` when it may not. */
export function transition(
  status: SponsorshipStatus,
  event: SponsorshipEventType
): SponsorshipStatus | null {
  if (!Object.hasOwn(TABLE, event)) {
    return null;
  }
  const from: From = TABLE[event as TransitionEvent];
  return Object.hasOwn(from, status) ? (from[status] ?? null) : null;
}

/** Whether `event` is one of the transition events. */
export function isTransitionEvent(
  event: SponsorshipEventType
): event is TransitionEvent {
  return Object.hasOwn(TABLE, event);
}
