import { SPONSORSHIP_STATUSES } from "@smog/config";
import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, canTransition } from "./sponsorshipStatus";

describe("the sponsorship status machine", () => {
  it("covers every status the collection can hold", () => {
    // Not decoration. The options on the field are generated from the same
    // tuple, so a status added there without a row here would be settable
    // and then permanently stuck — `canTransition` would answer false for
    // every move out of it.
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual(
      [...SPONSORSHIP_STATUSES].sort()
    );
  });

  it("lets a paid sponsorship reach the approval queue", () => {
    expect(canTransition("pending_payment", "pending_approval")).toBe(true);
  });

  it("refuses a move from active back to pending_payment", () => {
    // Without the table nothing would stop `active` -> `pending_payment`.
    // This is the line that makes that false.
    expect(canTransition("active", "pending_payment")).toBe(false);
  });

  it("refuses a jump from pending_payment straight to active", () => {
    // Approval is a person. The webhook may only reach the queue.
    expect(canTransition("pending_payment", "active")).toBe(false);
    expect(canTransition("pending_payment", "pending_approval")).toBe(true);
  });

  it("treats a status staying put as allowed", () => {
    // Every update that touches any other field re-submits `status`. If a
    // no-op move were refused, editing a sponsor's name would fail.
    for (const status of SPONSORSHIP_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it("lets nothing out of a terminal status", () => {
    // `rejected` is deliberately absent: an administrator may offer a rejected
    // sponsorship a re-edit, so it is re-openable. See the next test, and the
    // doc block on ALLOWED_TRANSITIONS.
    for (const terminal of ["expired", "cancelled"] as const) {
      const reachable = SPONSORSHIP_STATUSES.filter(
        (to) => to !== terminal && canTransition(terminal, to)
      );

      expect(reachable).toEqual([]);
    }
  });

  it("lets a rejected sponsorship be re-opened for resubmission, and nothing else", () => {
    // Established sponsorship behaviour, not chosen here: a rejected
    // sponsorship may be re-opened for a re-edit, and nothing else leaves
    // `rejected`.
    expect(canTransition("rejected", "pending_resubmission")).toBe(true);

    const reachable = SPONSORSHIP_STATUSES.filter(
      (to) => to !== "rejected" && canTransition("rejected", to)
    );

    expect(reachable).toEqual(["pending_resubmission"]);
  });

  it("can reach every non-initial status from somewhere", () => {
    // A status nothing can transition *into* is dead configuration that
    // reads as a supported state. Guards against a table that is merely
    // self-consistent.
    for (const to of SPONSORSHIP_STATUSES) {
      if (to === "pending_payment") {
        continue;
      }

      const sources = SPONSORSHIP_STATUSES.filter(
        (from) => from !== to && canTransition(from, to)
      );

      expect(sources.length).toBeGreaterThan(0);
    }
  });
});
