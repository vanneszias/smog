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
  let ownerId: number;
  let contributorId: number;

  const addedByIds = (
    items: { addedBy?: number | { id: number } | null }[] | null | undefined
  ) =>
    (items ?? []).map((item) =>
      typeof item.addedBy === "object" && item.addedBy !== null
        ? item.addedBy.id
        : item.addedBy
    );

  const makeGesture = async (name: string) => {
    const category = await payload.create({
      collection: "categories",
      data: { name: `AddedBy-${name}`, isActive: true },
    });
    return await payload.create({
      collection: "gestures",
      data: {
        name,
        categories: [category.id],
        playbackId: `pb-${name}`,
        isActive: true,
      },
    });
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const owner = await payload.create({
      collection: "users",
      data: {
        email: `list-addedby-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    ownerId = owner.id;

    const contributor = await payload.create({
      collection: "users",
      data: {
        email: `list-addedby-contributor-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    contributorId = contributor.id;
  });

  /**
   * Review-round finding, then ruling: sending only `{ gesture }` on
   * reorder (as the ordering tests above do, and as a "drag to reorder" UI
   * naturally would) replaces the entire `items` array, including sibling
   * fields the request didn't mention. `addedBy` is provenance, not
   * user-editable content, so a reorder has no business clearing it — the
   * `items` `beforeChange` hook now carries it forward for any gesture that
   * was already in the list. See that hook's comments for the exact
   * mechanics and why carry-forward runs before dedupe.
   */
  it("survives a reorder that only sends gesture ids", async () => {
    const gestureA = await makeGesture("Zes");
    const gestureB = await makeGesture("Zeven");

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "AddedBy lijst",
        owner: ownerId,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: [
          { gesture: gestureA.id, addedBy: contributorId },
          { gesture: gestureB.id, addedBy: contributorId },
        ],
      },
    });

    expect(addedByIds(list.items)).toEqual([contributorId, contributorId]);

    const reordered = await payload.update({
      collection: "lists",
      id: list.id,
      data: {
        items: [{ gesture: gestureB.id }, { gesture: gestureA.id }],
      },
    });

    expect(addedByIds(reordered.items)).toEqual([contributorId, contributorId]);
  });

  it("respects an explicit addedBy: null as a deliberate clear, rather than carrying the old value forward", async () => {
    const gesture = await makeGesture("Acht");

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "AddedBy clear",
        owner: ownerId,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: [{ gesture: gesture.id, addedBy: contributorId }],
      },
    });

    expect(addedByIds(list.items)).toEqual([contributorId]);

    const cleared = await payload.update({
      collection: "lists",
      id: list.id,
      data: {
        items: [{ gesture: gesture.id, addedBy: null }],
      },
    });

    expect(addedByIds(cleared.items)).toEqual([null]);
  });

  it("leaves a newly added gesture's addedBy exactly as sent, with nothing to carry forward", async () => {
    const gestureA = await makeGesture("Negen");
    const gestureB = await makeGesture("Tien");

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "AddedBy new gesture",
        owner: ownerId,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: [{ gesture: gestureA.id, addedBy: contributorId }],
      },
    });

    const updated = await payload.update({
      collection: "lists",
      id: list.id,
      data: {
        // gestureA continues (bare — should carry forward); gestureB is
        // brand new to this list and arrives with no addedBy at all, the
        // shape an anonymous share-link editor's request would have.
        items: [{ gesture: gestureA.id }, { gesture: gestureB.id }],
      },
    });

    // A relationship field with nothing written to it comes back `null`
    // after the round trip through storage, not `undefined` — SQLite (like
    // the rest of the DB layer) has no "undefined", only NULL.
    expect(addedByIds(updated.items)).toEqual([contributorId, null]);
  });

  /**
   * Ambiguous case, deliberately pinned rather than special-cased: the same
   * gesture appears twice in one request, once bare (eligible for
   * carry-forward) and once with an explicit clear. Dedupe (pass 2) keeps
   * only the first occurrence, so whichever intent the discarded duplicate
   * carried — here, the explicit clear — has no effect. There is no
   * principled way to merge two rows for the same gesture into one; this is
   * simply what "first occurrence wins" means when the duplicates disagree.
   */
  it("keeps only the first occurrence's addedBy when the same gesture is duplicated with conflicting intents", async () => {
    const gesture = await makeGesture("Elf");

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "AddedBy ambiguous",
        owner: ownerId,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: [{ gesture: gesture.id, addedBy: contributorId }],
      },
    });

    const updated = await payload.update({
      collection: "lists",
      id: list.id,
      data: {
        items: [
          { gesture: gesture.id }, // bare: carries contributorId forward
          { gesture: gesture.id, addedBy: null }, // explicit clear, discarded by dedupe
        ],
      },
    });

    expect(addedByIds(updated.items)).toEqual([contributorId]);
  });
});
