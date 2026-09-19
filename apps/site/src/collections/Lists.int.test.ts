// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

describe("List item ordering", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  // The D1/SQLite adapter uses integer autoincrement IDs, not UUID strings,
  // so `number` is the real type here (the brief's sketch used
  // `string | number`, presumably written against a Mongo-backed Payload
  // project where document IDs are strings).
  let gestureIds: number[];
  let listId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: "Ordering", isActive: true },
    });

    gestureIds = [];
    for (const name of ["Een", "Twee", "Drie"]) {
      const gesture = await payload.create({
        collection: "gestures",
        data: {
          name,
          categories: [category.id],
          playbackId: `pb-${name}`,
          isActive: true,
        },
      });
      gestureIds.push(gesture.id);
    }

    const owner = await payload.create({
      collection: "users",
      data: {
        email: `list-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "Mijn lijst",
        owner: owner.id,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: gestureIds.map((gesture) => ({ gesture })),
      },
    });
    listId = list.id;
  });

  it("preserves insertion order", async () => {
    const list = await payload.findByID({ collection: "lists", id: listId });
    const ids = (list.items ?? []).map((item) =>
      typeof item.gesture === "object" ? item.gesture.id : item.gesture
    );
    expect(ids).toEqual(gestureIds);
  });

  it("preserves the exact set across a reorder", async () => {
    const reversed = [...gestureIds].reverse();

    const updated = await payload.update({
      collection: "lists",
      id: listId,
      data: { items: reversed.map((gesture) => ({ gesture })) },
    });

    const ids = (updated.items ?? []).map((item) =>
      typeof item.gesture === "object" ? item.gesture.id : item.gesture
    );

    expect(ids).toEqual(reversed);
    expect(ids).toHaveLength(gestureIds.length);
    expect(new Set(ids)).toEqual(new Set(gestureIds));
  });
});
