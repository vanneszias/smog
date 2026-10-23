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
 * The gate of the sponsor end card (phase 10b ruling 9): `false` sends a
 * paid, revived or resubmitted sponsorship straight to `in_review`, because
 * the sponsor message is an app-side overlay on the gesture's own video
 * and nothing is rendered. `true` restores the render states (`rendering`,
 * a render job, `render_failed`) for the whole pipeline, which stays in the
 * code until the owner confirms its removal (spec R2). Rows already in a
 * render state keep their transitions either way.
 */
export const RENDER_NEW_SPONSORSHIPS: boolean = false;

function buildTable(renderNew: boolean) {
  const paid: SponsorshipStatus = renderNew ? "rendering" : "in_review";
  return {
    approved: { in_review: "live" },
    cancelled: { awaiting_payment: "cancelled" },
    changes_requested: {
      in_review: "changes_requested",
      rejected: "changes_requested",
    },
    expired: { expiring: "expired", live: "expired" },
    force_expired: { expiring: "expired", live: "expired" },
    marked_paid_manually: { awaiting_payment: paid },
    payment_failed: { awaiting_payment: "cancelled" },
    payment_paid: { awaiting_payment: paid },
    rejected: { changes_requested: "rejected", in_review: "rejected" },
    reminder_sent: { live: "expiring" },
    render_failed: { rendering: "render_failed" },
    render_retried: { render_failed: "rendering" },
    render_succeeded: { rendering: "in_review" },
    renewed: { expiring: "live", live: "live" },
    resubmitted: { changes_requested: paid },
    revived: { cancelled: paid },
  } as const satisfies Partial<Record<SponsorshipEventType, From>>;
}

type Table = ReturnType<typeof buildTable>;

const TABLE: Table = buildTable(RENDER_NEW_SPONSORSHIPS);

/** The table of one gate position (the tests check both). */
export function transitionTable(renderNew: boolean): Table {
  return buildTable(renderNew);
}

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
