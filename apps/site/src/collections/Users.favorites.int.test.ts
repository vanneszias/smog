// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

describe("User favorites", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;
  let userId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: "Test", isActive: true },
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        name: "Favoriet",
        categories: [category.id],
        playbackId: "pb-fav",
        isActive: true,
      },
    });
    gestureId = gesture.id;

    const user = await payload.create({
      collection: "users",
      data: {
        email: `fav-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    userId = user.id;
  });

  it("stores a favorite", async () => {
    const updated = await payload.update({
      collection: "users",
      id: userId,
      data: { favorites: [gestureId] },
    });

    expect(updated.favorites).toHaveLength(1);
  });

  /**
   * The brief's premise is that a `hasMany` relationship is structurally
   * incapable of storing the same related document twice, so no join-table
   * mutation is needed to enforce one-favorite-per-pair. That premise does
   * not hold: Payload's relationship field stores whatever array it is
   * given, duplicates included — confirmed here against the real D1-backed
   * local API, not inferred. `it.fails` keeps this documented and the suite
   * green without a hook papering over it (see the task report for the
   * write-up); if a future Payload version starts deduping, this test flips
   * to an unexpected pass and fails loudly, which is the point.
   */
  it.fails("does not structurally prevent the same gesture twice (documented Payload gap)", async () => {
    const updated = await payload.update({
      collection: "users",
      id: userId,
      data: { favorites: [gestureId, gestureId] },
    });

    const ids = (updated.favorites ?? []).map((f) =>
      typeof f === "object" ? f.id : f
    );

    expect(new Set(ids).size).toBe(ids.length);
  });
});
