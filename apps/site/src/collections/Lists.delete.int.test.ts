// @vitest-environment node
import type { RequiredDataFromCollectionSlug } from "payload";
import { getPayload, NotFound } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * The two halves of the referential-integrity ruling that belong to Stage 3:
 * `lists.owner` cascades, `lists.items.gesture` drops the array row.
 *
 * Every assertion goes through a real delete against a real database, which
 * is the spec's explicit requirement ("Referential integrity"): Payload emits
 * both columns as `NOT NULL` with `ON DELETE set null`, a pair SQLite cannot
 * satisfy, so a schema-level assertion cannot tell a rule the database
 * honours from one it rejects at runtime. Before the hooks in this task, both
 * deletes failed with a raw `Failed query: delete from "users" ...` /
 * `Failed query: delete from "gestures" ...`. That is the defect, and it is
 * only visible by deleting.
 *
 * The third describe block is the one that earns its keep. Dropping a row
 * from a Payload array field is naturally written as "read the list, filter,
 * write it back", and Payload's array writer deletes and re-inserts every row
 * on update (`@payloadcms/drizzle/dist/upsertRow/index.js`, the
 * `deleteExistingArrayRows` branch). So an implementation that rebuilds the
 * array from a re-query, or from a Set, or from anything that does not
 * preserve the caller's order, silently reorders the surviving rows and no
 * "the list survived" assertion notices.
 */
describe("deleting a user who owns lists", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;
  const runId = crypto.randomUUID();

  const createUser = async (label: string): Promise<{ id: number }> =>
    await payload.create({
      collection: "users",
      data: {
        email: `${label}-${runId}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });

  const createGesture = async (label: string): Promise<{ id: number }> =>
    await payload.create({
      collection: "gestures",
      data: {
        name: `${label} ${runId}`,
        categories: [categoryId],
        playbackId: `pb-${label}-${runId}`,
        isActive: true,
      },
    });

  beforeAll(async () => {
    payload = await getPayload({ config });
    const category = await payload.create({
      collection: "categories",
      data: { name: `List delete ${runId}`, isActive: true },
    });
    categoryId = category.id;
  });

  it("deletes a user's lists along with the user", async () => {
    const owner = await createUser("eigenaar");
    const gesture = await createGesture("in-lijst");

    const first = await payload.create({
      collection: "lists",
      data: {
        name: "Eerste lijst",
        owner: owner.id,
        visibility: "private",
        items: [{ gesture: gesture.id }],
      },
    });
    const second = await payload.create({
      collection: "lists",
      data: { name: "Tweede lijst", owner: owner.id, visibility: "shared" },
    });

    await payload.delete({ collection: "users", id: owner.id });

    for (const list of [first, second]) {
      await expect(
        payload.findByID({
          collection: "lists",
          id: list.id,
          overrideAccess: true,
        })
      ).rejects.toBeInstanceOf(NotFound);
    }

    await expect(
      payload.findByID({
        collection: "users",
        id: owner.id,
        overrideAccess: true,
      })
    ).rejects.toBeInstanceOf(NotFound);
  });

  it("leaves other owners' lists alone", async () => {
    // The control. A cascade with a missing or wrong `where` clause deletes
    // every list in the database and passes every assertion above.
    const doomed = await createUser("gedoemd");
    const bystander = await createUser("omstander");

    const theirs = await payload.create({
      collection: "lists",
      data: {
        name: "Van iemand anders",
        owner: bystander.id,
        visibility: "private",
      },
    });
    await payload.create({
      collection: "lists",
      data: {
        name: "Van de gedoemde",
        owner: doomed.id,
        visibility: "private",
      },
    });

    await payload.delete({ collection: "users", id: doomed.id });

    const survivor = await payload.findByID({
      collection: "lists",
      id: theirs.id,
      depth: 0,
      overrideAccess: true,
    });
    expect(survivor.owner).toBe(bystander.id);
  });

  it("keeps a departing contributor's row in someone else's list", async () => {
    // The cascade is on `owner`, not on `addedBy`. A user who added a
    // gesture to a list they do not own has contributed to that list, and
    // deleting their account must not take the entry with it — only the
    // provenance, which `lists_items.added_by_id` can hold as NULL because
    // `addedBy` is optional. This is also the one part of the user delete
    // that the database still handles by itself, so it is worth an actual
    // delete rather than an inspection of the constraint.
    const host = await createUser("gastheer");
    const contributor = await createUser("bijdrager");
    const gesture = await createGesture("bijgedragen");

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "Samen samengesteld",
        owner: host.id,
        visibility: "private",
        items: [{ gesture: gesture.id, addedBy: contributor.id }],
      },
    });

    await payload.delete({ collection: "users", id: contributor.id });

    const survivor = await payload.findByID({
      collection: "lists",
      id: list.id,
      depth: 0,
      overrideAccess: true,
    });
    expect(survivor.items).toEqual([
      { addedBy: null, gesture: gesture.id, id: expect.any(String) },
    ]);
  });

  it("still deletes a user who owns no lists", async () => {
    const loner = await createUser("lijstloos");

    await payload.delete({ collection: "users", id: loner.id });

    await expect(
      payload.findByID({
        collection: "users",
        id: loner.id,
        overrideAccess: true,
      })
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe("deleting a gesture that lists hold", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;
  let ownerId: number;
  const runId = crypto.randomUUID();

  const createGesture = async (label: string): Promise<{ id: number }> =>
    await payload.create({
      collection: "gestures",
      data: {
        name: `${label} ${runId}`,
        categories: [categoryId],
        playbackId: `pb-${label}-${runId}`,
        isActive: true,
      },
    });

  const createList = async (
    name: string,
    gestureIds: number[]
  ): Promise<{ id: number }> =>
    await payload.create({
      collection: "lists",
      data: {
        name: `${name} ${runId}`,
        owner: ownerId,
        visibility: "private",
        items: gestureIds.map((gesture) => ({ gesture, addedBy: ownerId })),
      },
    });

  const gestureIdsOf = async (listId: number): Promise<(number | string)[]> => {
    const list = await payload.findByID({
      collection: "lists",
      id: listId,
      depth: 0,
      overrideAccess: true,
    });
    return (list.items ?? []).map((item) =>
      typeof item.gesture === "object" ? item.gesture.id : item.gesture
    );
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
    const category = await payload.create({
      collection: "categories",
      data: { name: `Gesture in list ${runId}`, isActive: true },
    });
    categoryId = category.id;
    const owner = await payload.create({
      collection: "users",
      data: {
        email: `list-owner-${runId}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    ownerId = owner.id;
  });

  it("drops a deleted gesture from every list that held it, keeping the list", async () => {
    const [keep, doomed] = await Promise.all([
      createGesture("blijft"),
      createGesture("verdwijnt"),
    ]);

    // Three lists hold it, so a hook that only fixes the first one fails
    // here rather than in production.
    const holders = [
      await createList("Houder een", [keep.id, doomed.id]),
      await createList("Houder twee", [doomed.id]),
      await createList("Houder drie", [doomed.id, keep.id]),
    ];
    const innocent = await createList("Onbetrokken", [keep.id]);

    await payload.delete({ collection: "gestures", id: doomed.id });

    await expect(
      payload.findByID({
        collection: "gestures",
        id: doomed.id,
        overrideAccess: true,
      })
    ).rejects.toBeInstanceOf(NotFound);

    expect(await gestureIdsOf(holders[0].id)).toEqual([keep.id]);
    // A list whose only item was the deleted gesture survives empty. It is
    // the list that is the user's, not its contents.
    expect(await gestureIdsOf(holders[1].id)).toEqual([]);
    expect(await gestureIdsOf(holders[2].id)).toEqual([keep.id]);
    expect(await gestureIdsOf(innocent.id)).toEqual([keep.id]);
  });

  it("still deletes a gesture no list holds", async () => {
    // The control: a hook that refused every delete, or that threw when it
    // found no lists, would pass every assertion above.
    const gesture = await createGesture("nergens");

    await payload.delete({ collection: "gestures", id: gesture.id });

    await expect(
      payload.findByID({
        collection: "gestures",
        id: gesture.id,
        overrideAccess: true,
      })
    ).rejects.toBeInstanceOf(NotFound);
  });

  it("refuses a sponsored gesture without stripping it from any list", async () => {
    // The two rules on `gestures.beforeDelete` are different and must not be
    // conflated: a sponsorship refuses the delete, a list membership drops
    // the row. If the list-stripping hook ran before the sponsorship guard
    // outside a transaction, a refused delete would still have silently
    // emptied every list holding the gesture.
    const gesture = await createGesture("gesponsord");
    const list = await createList("Houdt gesponsorde", [gesture.id]);

    await payload.create({
      collection: "sponsorships",
      data: {
        gesture: gesture.id,
        sponsorName: `Acme ${runId}`,
        sponsorEmail: `sponsor-${runId}@example.com`,
        contactFullName: "Jan Janssens",
        overlayText: "Met dank",
        originalVideoPlaybackId: `pb-original-${runId}`,
        status: "active",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2027-01-01T00:00:00.000Z",
        durationYears: 1,
        paymentAmount: 500,
        // Payload's generated create type marks `status` and
        // `durationYears` as required despite both carrying defaults — the
        // Stage 1 hazard the spec records under "Deferred from Stage 1".
        // Both are supplied above; the cast is only to satisfy the
        // `data` union, exactly as `Gestures.delete.int.test.ts` does.
      } as RequiredDataFromCollectionSlug<"sponsorships">,
    });

    await expect(
      payload.delete({ collection: "gestures", id: gesture.id })
    ).rejects.toThrow(/sponsorship/i);

    expect(await gestureIdsOf(list.id)).toEqual([gesture.id]);
  });
});

describe("dropping a gesture from a list", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;
  let ownerId: number;
  let adderId: number;
  const runId = crypto.randomUUID();

  const createGesture = async (label: string): Promise<{ id: number }> =>
    await payload.create({
      collection: "gestures",
      data: {
        name: `${label} ${runId}`,
        categories: [categoryId],
        playbackId: `pb-${label}-${runId}`,
        isActive: true,
      },
    });

  const createList = async (
    name: string,
    gestureIds: number[]
  ): Promise<{ id: number }> =>
    await payload.create({
      collection: "lists",
      data: {
        name: `${name} ${runId}`,
        owner: ownerId,
        visibility: "private",
        items: gestureIds.map((gesture) => ({ gesture, addedBy: adderId })),
      },
    });

  const itemsOf = async (listId: number) => {
    const list = await payload.findByID({
      collection: "lists",
      id: listId,
      depth: 0,
      overrideAccess: true,
    });
    return (list.items ?? []).map((item) => ({
      addedBy:
        typeof item.addedBy === "object" ? item.addedBy?.id : item.addedBy,
      gesture:
        typeof item.gesture === "object" ? item.gesture.id : item.gesture,
      id: item.id,
    }));
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
    const category = await payload.create({
      collection: "categories",
      data: { name: `Ordering on delete ${runId}`, isActive: true },
    });
    categoryId = category.id;
    const owner = await payload.create({
      collection: "users",
      data: {
        email: `order-owner-${runId}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    ownerId = owner.id;
    const adder = await payload.create({
      collection: "users",
      data: {
        email: `order-adder-${runId}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    adderId = adder.id;
  });

  it("leaves the list's other items in their original order", async () => {
    // Five items, and the one removed sits in the middle. The surviving
    // order is deliberately NOT ascending by gesture id — the gestures are
    // created in order and then shuffled into the list — so a rebuild that
    // re-queries and sorts by id, or that appends survivors in any order but
    // the list's own, produces a different array and fails here.
    const [a, b, c, d, e] = await Promise.all([
      createGesture("alfa"),
      createGesture("bravo"),
      createGesture("charlie"),
      createGesture("delta"),
      createGesture("echo"),
    ]);
    const order = [e.id, b.id, c.id, a.id, d.id];
    const list = await createList("Volgorde", order);

    const before = await itemsOf(list.id);
    expect(before.map((item) => item.gesture)).toEqual(order);

    await payload.delete({ collection: "gestures", id: c.id });

    const surviving = await itemsOf(list.id);
    expect(surviving.map((item) => item.gesture)).toEqual([
      e.id,
      b.id,
      a.id,
      d.id,
    ]);

    // And the same rows, not equivalent replacements. Payload's array writer
    // deletes every row and re-inserts on update, so the row ids only carry
    // over because the surviving rows are sent back with their own `id`.
    // Asserting it here is what makes "the same rows in the same order" a
    // claim about identity rather than about a list of gesture ids that
    // happens to match.
    expect(surviving.map((item) => item.id)).toEqual(
      before.filter((item) => item.gesture !== c.id).map((item) => item.id)
    );
  });

  it("keeps addedBy intact on the surviving rows", async () => {
    // `addedBy` is provenance, and `Lists.ts`'s `items` `beforeChange` hook
    // carries it forward across writes that omit it. A removal path that
    // sends the surviving rows back without `addedBy` would rely on that
    // carry-forward silently; one that sends an explicit `null` would wipe
    // it just as silently, because an explicit `null` is respected as a
    // deliberate clear.
    const [a, b] = await Promise.all([
      createGesture("herkomst-blijft"),
      createGesture("herkomst-weg"),
    ]);
    const list = await createList("Herkomst", [a.id, b.id]);

    await payload.delete({ collection: "gestures", id: b.id });

    expect(await itemsOf(list.id)).toEqual([
      { addedBy: adderId, gesture: a.id, id: expect.any(String) },
    ]);
  });

  it("keeps the order when the removed gesture is first, and when it is last", async () => {
    const [a, b, c] = await Promise.all([
      createGesture("rand-een"),
      createGesture("rand-twee"),
      createGesture("rand-drie"),
    ]);
    const first = await createList("Eerste eruit", [a.id, b.id, c.id]);
    const last = await createList("Laatste eruit", [b.id, c.id, a.id]);

    await payload.delete({ collection: "gestures", id: a.id });

    expect((await itemsOf(first.id)).map((item) => item.gesture)).toEqual([
      b.id,
      c.id,
    ]);
    expect((await itemsOf(last.id)).map((item) => item.gesture)).toEqual([
      b.id,
      c.id,
    ]);
  });
});
