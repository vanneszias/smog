import { describe, expect, test } from "bun:test";
import {
  SPONSORSHIP_EVENT_TYPES,
  SPONSORSHIP_STATUSES,
  type SponsorshipEventType,
  type SponsorshipStatus,
} from "@smog/db/enums";
import { TRANSITION_EVENTS, transition } from "./transition-table";

/**
 * The state machine of spec §5.5 and ruling 6, written out independently
 * of the implementation: every allowed (status, event) pair and its target.
 * Every pair not listed here must be refused (`null`).
 */
const ALLOWED: readonly [
  SponsorshipStatus,
  SponsorshipEventType,
  SponsorshipStatus,
][] = [
  ["awaiting_payment", "payment_paid", "rendering"],
  ["awaiting_payment", "marked_paid_manually", "rendering"],
  ["awaiting_payment", "payment_failed", "cancelled"],
  ["awaiting_payment", "cancelled", "cancelled"],
  ["cancelled", "revived", "rendering"],
  ["rendering", "render_succeeded", "in_review"],
  ["rendering", "render_failed", "render_failed"],
  ["render_failed", "render_retried", "rendering"],
  ["in_review", "approved", "live"],
  ["in_review", "rejected", "rejected"],
  ["changes_requested", "rejected", "rejected"],
  ["in_review", "changes_requested", "changes_requested"],
  ["rejected", "changes_requested", "changes_requested"],
  ["changes_requested", "resubmitted", "rendering"],
  ["live", "reminder_sent", "expiring"],
  ["expiring", "renewed", "live"],
  ["live", "renewed", "live"],
  ["live", "expired", "expired"],
  ["expiring", "expired", "expired"],
  ["live", "force_expired", "expired"],
  ["expiring", "force_expired", "expired"],
];

const NON_TRANSITION_EVENTS: readonly SponsorshipEventType[] = [
  "created",
  "render_started",
  "refund_needed",
  "token_issued",
  "legacy",
];

describe("transition (spec §5.5)", () => {
  const allowed = new Map(
    ALLOWED.map(([from, event, to]) => [`${from}:${event}`, to])
  );

  // Every pair of the whole product, one test each: 10 statuses × 21 events.
  for (const from of SPONSORSHIP_STATUSES) {
    for (const event of SPONSORSHIP_EVENT_TYPES) {
      const expected = allowed.get(`${from}:${event}`) ?? null;
      test(`${from} --${event}--> ${expected ?? "refused"}`, () => {
        expect(transition(from, event)).toBe(expected);
      });
    }
  }

  test("the transition events are every event but the trail-only ones", () => {
    expect<string[]>([...TRANSITION_EVENTS].sort()).toEqual(
      SPONSORSHIP_EVENT_TYPES.filter(
        (event) => !NON_TRANSITION_EVENTS.includes(event)
      ).sort()
    );
  });

  test("terminal statuses only leave by revival or a request for changes", () => {
    for (const event of SPONSORSHIP_EVENT_TYPES) {
      const fromExpired = transition("expired", event);
      expect(fromExpired).toBeNull();
      const fromCancelled = transition("cancelled", event);
      expect(fromCancelled === null || event === "revived").toBe(true);
      const fromRejected = transition("rejected", event);
      expect(fromRejected === null || event === "changes_requested").toBe(true);
    }
  });

  test("an unknown status or event is refused", () => {
    expect(transition("nope" as SponsorshipStatus, "payment_paid")).toBeNull();
    expect(
      transition("awaiting_payment", "nope" as SponsorshipEventType)
    ).toBeNull();
    expect(
      transition("awaiting_payment", "toString" as SponsorshipEventType)
    ).toBeNull();
  });
});
