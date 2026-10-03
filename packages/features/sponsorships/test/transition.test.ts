import { GuardFailedError, toGuardFailure } from "@smog/db";
import { DAY_MS } from "@smog/utils";
import { describe, expect, it } from "vitest";
import {
  eventStatement,
  InvalidTransitionError,
  isStaleTransition,
  SponsorshipEventDataError,
  transitionStatements,
} from "../src/server/transition";
import {
  eventsOf,
  NOW,
  seedCheckout,
  sponsorshipRow,
  statusOf,
  testDb,
} from "./helpers";

describe("transitionStatements", () => {
  it("moves the status, sets the patch and writes the event in one batch", async () => {
    const db = testDb();
    const { sponsorshipIds } = await seedCheckout(db, {
      count: 1,
      status: "in_review",
      videoPlaybackId: "playback-1",
    });
    const id = sponsorshipIds[0] as string;
    const endsAt = new Date(NOW.getTime() + 365 * DAY_MS);
    const statements = transitionStatements(db, {
      actorId: null,
      data: { endsAt: endsAt.toISOString(), startsAt: NOW.toISOString() },
      event: "approved",
      from: "in_review",
      now: NOW,
      patch: { endsAt, startsAt: NOW },
      sponsorshipId: id,
    });
    expect(statements).toHaveLength(3);
    await db.batch(statements);
    const row = await sponsorshipRow(db, id);
    expect(row.status).toBe("live");
    expect(row.startsAt?.getTime()).toBe(NOW.getTime());
    expect(row.endsAt?.getTime()).toBe(endsAt.getTime());
    expect(row.updatedAt.getTime()).toBe(NOW.getTime());
    const events = await eventsOf(db, id);
    expect(events.map((event) => [event.type, event.data])).toEqual([
      [
        "approved",
        { endsAt: endsAt.toISOString(), startsAt: NOW.toISOString() },
      ],
    ]);
  });

  it("a guard failure (the status moved on) leaves nothing: no update, no event", async () => {
    const db = testDb();
    const { sponsorshipIds } = await seedCheckout(db, {
      count: 1,
      status: "rendering",
    });
    const id = sponsorshipIds[0] as string;
    // Built for `awaiting_payment`, but the row is already `rendering`.
    const statements = transitionStatements(db, {
      actorId: null,
      data: { paymentId: "p" },
      event: "payment_paid",
      from: "awaiting_payment",
      now: NOW,
      sponsorshipId: id,
    });
    const error = await db.batch(statements).catch((e: unknown) => e);
    expect(isStaleTransition(error)).toBe(true);
    expect(toGuardFailure(error)).toBeInstanceOf(GuardFailedError);
    expect(await statusOf(db, id)).toBe("rendering");
    expect(await eventsOf(db, id)).toEqual([]);
  });

  it("a lost race between two writers lands once", async () => {
    const db = testDb();
    const { sponsorshipIds } = await seedCheckout(db, {
      count: 1,
      status: "in_review",
    });
    const id = sponsorshipIds[0] as string;
    const reject = () =>
      db.batch(
        transitionStatements(db, {
          actorId: null,
          data: { reason: "Not suitable" },
          event: "rejected",
          from: "in_review",
          now: NOW,
          sponsorshipId: id,
        })
      );
    const results = await Promise.allSettled([reject(), reject()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    expect(isStaleTransition(failed?.reason)).toBe(true);
    expect((await eventsOf(db, id)).map((event) => event.type)).toEqual([
      "rejected",
    ]);
  });

  it("refuses a transition the table refuses, before anything is built", () => {
    const db = testDb();
    expect(() =>
      transitionStatements(db, {
        actorId: null,
        data: {},
        event: "expired",
        from: "awaiting_payment",
        now: NOW,
        sponsorshipId: "x",
      })
    ).toThrow(InvalidTransitionError);
  });

  it("validates the event data per type and refuses an unknown key", () => {
    const db = testDb();
    const build = (data: unknown) =>
      transitionStatements(db, {
        actorId: null,
        data: data as { reason: string },
        event: "rejected",
        from: "in_review",
        now: NOW,
        sponsorshipId: "x",
      });
    expect(() => build({ reason: "" })).toThrow(SponsorshipEventDataError);
    expect(() => build({ reason: "x".repeat(501) })).toThrow(
      SponsorshipEventDataError
    );
    expect(() => build({ extra: 1, reason: "ok" })).toThrow(
      SponsorshipEventDataError
    );
    expect(build({ reason: "ok" })).toHaveLength(3);
  });

  it("never takes a status in the patch", () => {
    const db = testDb();
    expect(() =>
      transitionStatements(db, {
        actorId: null,
        data: {},
        event: "expired",
        from: "live",
        now: NOW,
        patch: { status: "live" } as never,
        sponsorshipId: "x",
      })
    ).toThrow(TypeError);
  });

  it("eventStatement writes only the trail-only events", async () => {
    const db = testDb();
    const { sponsorshipIds, paymentId } = await seedCheckout(db, { count: 1 });
    const id = sponsorshipIds[0] as string;
    await eventStatement(db, {
      actorId: null,
      data: { paymentId, reason: "late" },
      now: NOW,
      sponsorshipId: id,
      type: "refund_needed",
    });
    expect((await eventsOf(db, id)).map((event) => event.type)).toEqual([
      "refund_needed",
    ]);
    expect(() =>
      eventStatement(db, {
        actorId: null,
        data: { paymentId } as never,
        now: NOW,
        sponsorshipId: id,
        type: "payment_paid" as never,
      })
    ).toThrow(TypeError);
    expect(() =>
      eventStatement(db, {
        actorId: null,
        data: {} as never,
        now: NOW,
        sponsorshipId: id,
        type: "legacy" as never,
      })
    ).toThrow(TypeError);
  });
});
