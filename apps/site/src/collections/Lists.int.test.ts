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

describe("List item deduplication", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureAId: number;
  let gestureBId: number;
  let ownerId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: "Dedup", isActive: true },
    });

    const gestureA = await payload.create({
      collection: "gestures",
      data: {
        name: "Vier",
        categories: [category.id],
        playbackId: "pb-vier",
        isActive: true,
      },
    });
    gestureAId = gestureA.id;

    const gestureB = await payload.create({
      collection: "gestures",
      data: {
        name: "Vijf",
        categories: [category.id],
        playbackId: "pb-vijf",
        isActive: true,
      },
    });
    gestureBId = gestureB.id;

    const owner = await payload.create({
      collection: "users",
      data: {
        email: `list-dedup-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    ownerId = owner.id;
  });

  /**
   * Same latent bug Task 4 found for `users.favorites` — Payload's array
   * field does not dedupe on its own. Convex enforced one row per
   * (list, gesture) via a `by_list_gesture` index plus an early return; the
   * `beforeChange` hook on `items` is what restores that here. First
   * occurrence wins so the gesture keeps its original position rather than
   * jumping to wherever the duplicate was added.
   */
  it("keeps only the first occurrence when the same gesture is added twice", async () => {
    const list = await payload.create({
      collection: "lists",
      data: {
        name: "Met duplicaat",
        owner: ownerId,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: [
          { gesture: gestureAId },
          { gesture: gestureBId },
          { gesture: gestureAId },
        ],
      },
    });

    const ids = (list.items ?? []).map((item) =>
      typeof item.gesture === "object" ? item.gesture.id : item.gesture
    );

    expect(ids).toEqual([gestureAId, gestureBId]);
  });
});

describe("List item addedBy across a reorder", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  /**
   * Review-round finding: sending only `{ gesture }` on reorder (as the
   * ordering tests above do, and as a "drag to reorder" UI naturally would)
   * replaces the entire `items` array, including sibling fields the request
   * didn't mention. This test pins the *actual* observed behavior rather
   * than asserting the ideal one, and reports it — see task-5-report.md —
   * because whether reorder should be a partial update that preserves
   * unlisted fields, or a full replace, is a design question for whoever's
   * calling this from the client, not something to silently patch with a
   * merge hook.
   */
  it("does not survive a reorder that only sends gesture ids", async () => {
    const category = await payload.create({
      collection: "categories",
      data: { name: "AddedBy", isActive: true },
    });

    const gestureA = await payload.create({
      collection: "gestures",
      data: {
        name: "Zes",
        categories: [category.id],
        playbackId: "pb-zes",
        isActive: true,
      },
    });

    const gestureB = await payload.create({
      collection: "gestures",
      data: {
        name: "Zeven",
        categories: [category.id],
        playbackId: "pb-zeven",
        isActive: true,
      },
    });

    const owner = await payload.create({
      collection: "users",
      data: {
        email: `list-addedby-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });

    const contributor = await payload.create({
      collection: "users",
      data: {
        email: `list-addedby-contributor-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "AddedBy lijst",
        owner: owner.id,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: [
          { gesture: gestureA.id, addedBy: contributor.id },
          { gesture: gestureB.id, addedBy: contributor.id },
        ],
      },
    });

    const beforeReorder = (list.items ?? []).map((item) =>
      typeof item.addedBy === "object" ? item.addedBy?.id : item.addedBy
    );
    expect(beforeReorder).toEqual([contributor.id, contributor.id]);

    const reordered = await payload.update({
      collection: "lists",
      id: list.id,
      data: {
        items: [{ gesture: gestureB.id }, { gesture: gestureA.id }],
      },
    });

    const afterReorder = (reordered.items ?? []).map((item) =>
      typeof item.addedBy === "object" ? item.addedBy?.id : item.addedBy
    );

    // Documents the current behavior: addedBy is lost, not preserved. (It
    // comes back `undefined`, not `null` — the field is simply absent from
    // the newly-written rows rather than explicitly cleared.)
    expect(afterReorder).toEqual([undefined, undefined]);
  });
});
