import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import type { User } from "@smog/db";
import { newId } from "@smog/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { LISTS_MAX } from "../src/schema";
import {
  addGestures,
  addUser,
  contextFor,
  router,
  storedItems,
} from "./helpers";

let owner: User;

beforeEach(async () => {
  owner = await addUser("Anna");
});

async function newList(name = "Dieren", as: User = owner) {
  return await call(router.create, { name }, contextFor(as));
}

async function listWith(gestureIds: readonly string[]) {
  const created = await newList();
  for (const gestureId of gestureIds) {
    // biome-ignore lint/performance/noAwaitInLoops: the order is the point.
    await call(
      router.addItem,
      { gestureId, id: created.id },
      contextFor(owner)
    );
  }
  return created;
}

describe("lists: create, update, mine", () => {
  it("trims the name, stores an empty description as null", async () => {
    const created = await call(
      router.create,
      { description: "   ", name: "  Dieren  " },
      contextFor(owner)
    );

    expect(created).toMatchObject({
      description: null,
      itemCount: 0,
      name: "Dieren",
      shares: { edit: false, view: false },
    });
    expect(typeof created.updatedAt).toBe("number");
  });

  it("rejects a blank or too long name and a too long description", async () => {
    await expect(
      call(router.create, { name: "   " }, contextFor(owner))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(router.create, { name: "x".repeat(81) }, contextFor(owner))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(
        router.create,
        { description: "x".repeat(281), name: "Ok" },
        contextFor(owner)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await call(router.create, { name: "x".repeat(80) }, contextFor(owner))
    ).toMatchObject({ name: "x".repeat(80) });
  });

  it("updates the name and clears the description with null or empty", async () => {
    const created = await call(
      router.create,
      { description: "Beschrijving", name: "Dieren" },
      contextFor(owner)
    );

    const renamed = await call(
      router.update,
      { id: created.id, name: " Huisdieren " },
      contextFor(owner)
    );
    expect(renamed).toMatchObject({
      description: "Beschrijving",
      name: "Huisdieren",
    });
    const cleared = await call(
      router.update,
      { description: "", id: created.id },
      contextFor(owner)
    );
    expect(cleared.description).toBeNull();
    const described = await call(
      router.update,
      { description: " Nieuw ", id: created.id },
      contextFor(owner)
    );
    expect(described.description).toBe("Nieuw");
    await call(
      router.update,
      { description: null, id: created.id },
      contextFor(owner)
    );
    expect(
      (await call(router.get, { id: created.id }, contextFor(owner)))
        .description
    ).toBeNull();
  });

  it("lists only the owner's lists, most recently changed first, with counts", async () => {
    const [hond, kat] = await addGestures(["Hond", "Kat"]);
    const first = await newList("Eerste");
    const second = await newList("Tweede");
    await newList("Van iemand anders", await addUser("Bert"));
    // Adding bumps `updated_at`, so the first list moves to the top.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await call(
      router.addItem,
      { gestureId: hond as string, id: first.id },
      contextFor(owner)
    );
    await call(
      router.addItem,
      { gestureId: kat as string, id: first.id },
      contextFor(owner)
    );
    await call(
      router.share.create,
      { id: second.id, role: "view" },
      contextFor(owner)
    );

    const mine = await call(router.mine, undefined, contextFor(owner));

    expect(mine.map((item) => item.name)).toEqual(["Eerste", "Tweede"]);
    expect(mine[0]).toMatchObject({
      itemCount: 2,
      shares: { edit: false, view: false },
    });
    expect(mine[1]).toMatchObject({
      itemCount: 0,
      shares: { edit: false, view: true },
    });
  });

  it("counts published gestures only", async () => {
    const [hond] = await addGestures(["Hond"]);
    const [verborgen] = await addGestures(["Verborgen"]);
    const created = await listWith([hond as string, verborgen as string]);
    await env.DB.prepare("UPDATE gesture SET published_at = NULL WHERE id = ?")
      .bind(verborgen as string)
      .run();

    const [summary] = await call(router.mine, undefined, contextFor(owner));
    expect(summary?.id).toBe(created.id);
    expect(summary?.itemCount).toBe(1);
  });

  it(`refuses a list beyond ${LISTS_MAX} with INVALID_STATE`, async () => {
    const now = Date.now();
    await env.DB.batch(
      Array.from({ length: LISTS_MAX }, (_, index) =>
        env.DB.prepare(
          "INSERT INTO list (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(newId(), owner.id, `Lijst ${index}`, now, now)
      )
    );

    await expect(newList("Eén te veel")).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    expect(await call(router.mine, undefined, contextFor(owner))).toHaveLength(
      LISTS_MAX
    );
  });
});

describe("lists: ownership", () => {
  it("every owner procedure needs a session", async () => {
    const created = await newList();
    const guest = contextFor(null);
    const attempts = [
      () => call(router.mine, undefined, guest),
      () => call(router.get, { id: created.id }, guest),
      () => call(router.create, { name: "X" }, guest),
      () => call(router.update, { id: created.id, name: "X" }, guest),
      () => call(router.delete, { id: created.id }, guest),
      () => call(router.addItem, { gestureId: "g", id: created.id }, guest),
      () => call(router.removeItem, { gestureId: "g", id: created.id }, guest),
      () => call(router.reorder, { gestureIds: [], id: created.id }, guest),
      () => call(router.share.get, { id: created.id }, guest),
      () => call(router.share.create, { id: created.id, role: "view" }, guest),
      () => call(router.share.revoke, { id: created.id, role: "view" }, guest),
    ];
    for (const attempt of attempts) {
      // biome-ignore lint/performance/noAwaitInLoops: one assertion each.
      await expect(attempt()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("another user's list is NOT_FOUND everywhere and stays unchanged", async () => {
    const [hond] = await addGestures(["Hond"]);
    const created = await listWith([hond as string]);
    const other = contextFor(await addUser("Bert"));
    const { id } = created;
    const attempts = [
      () => call(router.get, { id }, other),
      () => call(router.update, { id, name: "Gekaapt" }, other),
      () => call(router.delete, { id }, other),
      () => call(router.addItem, { gestureId: hond as string, id }, other),
      () => call(router.removeItem, { gestureId: hond as string, id }, other),
      () => call(router.reorder, { gestureIds: [hond as string], id }, other),
      () => call(router.share.get, { id }, other),
      () => call(router.share.create, { id, role: "edit" }, other),
      () => call(router.share.revoke, { id, role: "edit" }, other),
    ];
    for (const attempt of attempts) {
      // biome-ignore lint/performance/noAwaitInLoops: one assertion each.
      await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }

    const detail = await call(router.get, { id }, contextFor(owner));
    expect(detail.name).toBe("Dieren");
    expect(detail.items.map((item) => item.id)).toEqual([hond]);
    expect(await call(router.share.get, { id }, contextFor(owner))).toEqual({
      edit: null,
      view: null,
    });
  });

  it("an unknown id is NOT_FOUND", async () => {
    await expect(
      call(router.get, { id: newId() }, contextFor(owner))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("lists: items and order", () => {
  it("appends in order and is idempotent", async () => {
    const ids = await addGestures(["Aap", "Beer", "Cavia"]);
    const created = await listWith(ids);

    const again = await call(
      router.addItem,
      { gestureId: ids[0] as string, id: created.id },
      contextFor(owner)
    );

    expect(again).toEqual({ added: false });
    expect(await storedItems(created.id)).toEqual(
      ids.map((gestureId, position) => ({ gestureId, position }))
    );
    const detail = await call(
      router.get,
      { id: created.id },
      contextFor(owner)
    );
    expect(detail.items.map((item) => [item.name, item.position])).toEqual([
      ["Aap", 0],
      ["Beer", 1],
      ["Cavia", 2],
    ]);
    expect(detail.itemCount).toBe(3);
  });

  it("rejects an unknown or unpublished gesture with NOT_FOUND", async () => {
    const [verborgen] = await addGestures(["Verborgen"], { published: false });
    const created = await newList();

    for (const gestureId of [verborgen as string, newId()]) {
      // biome-ignore lint/performance/noAwaitInLoops: one assertion each.
      await expect(
        call(router.addItem, { gestureId, id: created.id }, contextFor(owner))
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await storedItems(created.id)).toEqual([]);
  });

  it("keeps positions dense under concurrent adds", async () => {
    const ids = await addGestures(["A", "B", "C", "D", "E", "F"]);
    const created = await newList();

    await Promise.all(
      ids.map((gestureId) =>
        call(router.addItem, { gestureId, id: created.id }, contextFor(owner))
      )
    );

    const positions = (await storedItems(created.id)).map(
      (row) => row.position
    );
    expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("re-densifies the positions after a remove", async () => {
    const ids = await addGestures(["A", "B", "C", "D"]);
    const created = await listWith(ids);

    expect(
      await call(
        router.removeItem,
        { gestureId: ids[1] as string, id: created.id },
        contextFor(owner)
      )
    ).toEqual({ removed: true });
    expect(
      await call(
        router.removeItem,
        { gestureId: ids[1] as string, id: created.id },
        contextFor(owner)
      )
    ).toEqual({ removed: false });

    expect(await storedItems(created.id)).toEqual([
      { gestureId: ids[0], position: 0 },
      { gestureId: ids[2], position: 1 },
      { gestureId: ids[3], position: 2 },
    ]);
  });

  it("reorders to an exact permutation", async () => {
    const [a, b, c] = (await addGestures(["A", "B", "C"])) as [
      string,
      string,
      string,
    ];
    const created = await listWith([a, b, c]);

    await call(
      router.reorder,
      { gestureIds: [c, a, b], id: created.id },
      contextFor(owner)
    );

    expect(await storedItems(created.id)).toEqual([
      { gestureId: c, position: 0 },
      { gestureId: a, position: 1 },
      { gestureId: b, position: 2 },
    ]);
  });

  it("rejects a missing, extra or duplicate gesture with INVALID_STATE", async () => {
    const [a, b, c] = (await addGestures(["A", "B", "C"])) as [
      string,
      string,
      string,
    ];
    const [d] = await addGestures(["D"]);
    const created = await listWith([a, b, c]);
    const before = await storedItems(created.id);

    for (const gestureIds of [
      [a, b],
      [a, b, c, d as string],
      [a, b, d as string],
      [a, a, b],
      [a, b, c, c],
      [],
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one assertion each.
      await expect(
        call(router.reorder, { gestureIds, id: created.id }, contextFor(owner))
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    }
    expect(await storedItems(created.id)).toEqual(before);
  });

  it("hides unpublished gestures and keeps them after the visible ones on reorder", async () => {
    const [a, hidden, b] = (await addGestures(["A", "Verborgen", "B"])) as [
      string,
      string,
      string,
    ];
    const created = await listWith([a, hidden, b]);
    await env.DB.prepare("UPDATE gesture SET published_at = NULL WHERE id = ?")
      .bind(hidden)
      .run();

    const detail = await call(
      router.get,
      { id: created.id },
      contextFor(owner)
    );
    expect(detail.items.map((item) => item.id)).toEqual([a, b]);

    // The client sees two gestures, so that is the exact current set.
    await call(
      router.reorder,
      { gestureIds: [b, a], id: created.id },
      contextFor(owner)
    );
    expect(await storedItems(created.id)).toEqual([
      { gestureId: b, position: 0 },
      { gestureId: a, position: 1 },
      { gestureId: hidden, position: 2 },
    ]);
  });

  it("deleting a list cascades to its items and share links", async () => {
    const [a] = await addGestures(["A"]);
    const created = await listWith([a as string]);
    const link = await call(
      router.share.create,
      { id: created.id, role: "view" },
      contextFor(owner)
    );

    await call(router.delete, { id: created.id }, contextFor(owner));

    expect(await storedItems(created.id)).toEqual([]);
    const shares = await env.DB.prepare(
      "SELECT count(*) AS n FROM list_share WHERE list_id = ?"
    )
      .bind(created.id)
      .first<{ n: number }>();
    expect(shares?.n).toBe(0);
    await expect(
      call(router.shared.get, { token: link.token }, contextFor(null))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.get, { id: created.id }, contextFor(owner))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await call(router.mine, undefined, contextFor(owner))).toEqual([]);
  });
});
