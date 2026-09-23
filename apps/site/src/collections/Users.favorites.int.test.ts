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
   * Payload's hasMany relationship does NOT dedupe on its own — verified
   * against a real database, where `[id, id]` round-tripped as `[3, 3]`. It
   * was once assumed that dropping the join table made this structural; it
   * did not, so a `beforeChange` hook on the field enforces it. This test
   * pins the hook: remove it and the assertion fails.
   */
  it("stores the same gesture only once", async () => {
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
