import { env } from "cloudflare:workers";
import { BLOCKING_SPONSORSHIP_STATUSES, type Gesture } from "@smog/db";
import { createDb } from "@smog/db/client";
import { makeGesture } from "@smog/db/testing";
import { DAY_MS, newId } from "@smog/utils";
import { describe, expect, it } from "vitest";
import type { Availability, Quote } from "../src/schema";
import { availabilityQuery, getAvailability } from "../src/server/availability";
import { countingD1 } from "./counting-d1";
import { callAt, NOW, seedCheckout, testDb } from "./helpers";

const db = testDb();

describe("sponsorships.availability", () => {
  it("is pending for every blocking status but live and expiring (bug 17)", async () => {
    const pendingStatuses = BLOCKING_SPONSORSHIP_STATUSES.filter(
      (status) => status !== "live" && status !== "expiring"
    );
    const seeded = await Promise.all(
      pendingStatuses.map((status) => seedCheckout(db, { count: 1, status }))
    );
    const ids = seeded.map((s) => s.gestures[0]?.id as string);
    const result = await callAt<Availability>("availability", {
      gestureIds: ids,
    });
    expect(result.checkoutEnabled).toBe(true);
    expect(result.items).toEqual(
      ids.map((gestureId) => ({ gestureId, state: "pending" }))
    );
  });

  it("shows the sponsor name and the end only when live or expiring (S-26)", async () => {
    const endsAt = new Date(NOW.getTime() + 100 * DAY_MS);
    const live = await seedCheckout(db, { count: 1, endsAt, status: "live" });
    const expiring = await seedCheckout(db, {
      count: 1,
      endsAt,
      status: "expiring",
    });
    const items = await getAvailability(db, [
      live.gestures[0]?.id as string,
      expiring.gestures[0]?.id as string,
    ]);
    for (const item of items) {
      expect(item).toEqual({
        endsAt: endsAt.getTime(),
        gestureId: item.gestureId,
        sponsorName: "Acme BV",
        state: "sponsored",
      });
    }
  });

  it("is available after a terminal sponsorship, and unavailable for unknown or unpublished gestures", async () => {
    const free = await makeGesture(db);
    const ended = await seedCheckout(db, { count: 1, status: "expired" });
    const cancelled = await seedCheckout(db, {
      gestures: [ended.gestures[0] as Gesture],
      status: "cancelled",
    });
    const hidden = await makeGesture(db, { publishedAt: null });
    const unknown = newId();
    const items = await getAvailability(db, [
      free.id,
      ended.gestures[0]?.id as string,
      hidden.id,
      unknown,
      free.id,
    ]);
    expect(cancelled.sponsorshipIds).toHaveLength(1);
    expect(items).toEqual([
      { gestureId: free.id, state: "available" },
      { gestureId: ended.gestures[0]?.id, state: "available" },
      { gestureId: hidden.id, state: "unavailable" },
      { gestureId: unknown, state: "unavailable" },
    ]);
  });

  it("is one D1 read for 100 ids", async () => {
    const gestures = await Promise.all(
      Array.from({ length: 3 }, () => makeGesture(db))
    );
    const ids = [
      ...gestures.map((g) => g.id),
      ...Array.from({ length: 97 }, () => newId()),
    ];
    const { counter, d1 } = countingD1(env.DB);
    const result = await callAt<Availability>(
      "availability",
      { gestureIds: ids },
      { db: createDb(d1) }
    );
    expect(result.items).toHaveLength(100);
    expect(counter.roundTrips).toBe(1);
  });

  it("says checkout is off without a Mollie key", async () => {
    const gesture = await makeGesture(db);
    const result = await callAt<Availability>(
      "availability",
      { gestureIds: [gesture.id] },
      { env: { MOLLIE_API_KEY: undefined } }
    );
    expect(result.checkoutEnabled).toBe(false);
  });

  it("seeks the gesture primary key and the blocking index (no scan of sponsorship)", async () => {
    const { params, sql } = availabilityQuery(db, [newId(), newId()]).toSQL();
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...params)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail);
    expect(details.some((d) => d.startsWith("SCAN ids VIRTUAL TABLE"))).toBe(
      true
    );
    expect(details.some((d) => d.includes("TEMP B-TREE"))).toBe(false);
    expect(
      details.some(
        (d) =>
          d.startsWith(
            "SEARCH gesture USING INDEX sqlite_autoindex_gesture_1"
          ) || d.startsWith("SEARCH gesture USING INTEGER PRIMARY KEY")
      )
    ).toBe(true);
    expect(
      details.some(
        (d) =>
          d.startsWith("SEARCH sponsorship USING INDEX") &&
          (d.includes("sponsorship_gesture_blocking_uq") ||
            d.includes("sponsorship_gesture_status_idx"))
      )
    ).toBe(true);
    expect(details.some((d) => d.startsWith("SCAN sponsorship"))).toBe(false);
    expect(details.some((d) => d.startsWith("SCAN gesture"))).toBe(false);
  });
});

describe("sponsorships.quote", () => {
  it("prices every gesture asked and lists the unavailable ones", async () => {
    const free = await makeGesture(db);
    const taken = await seedCheckout(db, { count: 1, status: "live" });
    const result = await callAt<Quote>("quote", {
      gestureIds: [free.id, taken.gestures[0]?.id as string],
      logo: true,
    });
    expect(result).toEqual({
      currency: "EUR",
      items: [
        { amountCents: 6000, gestureId: free.id, includesLogo: true },
        {
          amountCents: 6000,
          gestureId: taken.gestures[0]?.id,
          includesLogo: true,
        },
      ],
      totalCents: 12_000,
      unavailable: [taken.gestures[0]?.id],
    });
  });

  it("refuses 11 gestures", async () => {
    const ids = Array.from({ length: 11 }, () => newId());
    await expect(
      callAt("quote", { gestureIds: ids, logo: false })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
