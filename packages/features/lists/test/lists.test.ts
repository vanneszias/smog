import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import type { User } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { LISTS_MAX } from "../src/schema";
import {
  containingQuery,
  removeItem,
  reorderList,
} from "../src/server/service";
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
    // Adding bumps `updated_at`, so the first list moves to the top. Both
    // lists are dated a minute back first, so the bump is later than either
    // whatever the clock did in between (no sleep).
    await env.DB.prepare(
      "UPDATE list SET updated_at = updated_at - 60000 WHERE id IN (?, ?)"
    )
      .bind(first.id, second.id)
      .run();
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
      () => call(router.containing, { gestureId: "g" }, guest),
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

describe("lists: containing", () => {
  it("answers which of the owner's lists hold the gesture, in one query", async () => {
    const [hond, kat] = (await addGestures(["Hond", "Kat"])) as [
      string,
      string,
    ];
    const dieren = await listWith([hond, kat]);
    const huisdieren = await listWith([hond]);
    await listWith([kat]);
    // Someone else's list with the same gesture is never answered.
    const other = await addUser("Bert");
    const theirs = await newList("Van Bert", other);
    await call(
      router.addItem,
      { gestureId: hond, id: theirs.id },
      contextFor(other)
    );

    const ids = await call(
      router.containing,
      { gestureId: hond },
      contextFor(owner)
    );
    expect([...ids].sort()).toEqual([dieren.id, huisdieren.id].sort());
    expect(
      await call(router.containing, { gestureId: "nope" }, contextFor(owner))
    ).toEqual([]);
  });

  it("seeks the owner's lists and the list_item key (no scan)", async () => {
    const { params, sql: text } = containingQuery(
      createDb(env.DB),
      owner.id,
      "g"
    ).toSQL();
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${text}`)
      .bind(...params)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail);
    expect(details.some((detail) => detail.startsWith("SCAN"))).toBe(false);
    expect(details.some((detail) => detail.includes("TEMP B-TREE"))).toBe(
      false
    );
  });
});

/**
 * `db` whose `nth` batch first runs `before`: a write that lands between a
 * service's read and its write.
 */
function raceBeforeBatch(
  db: Db,
  nth: number,
  before: () => Promise<unknown>
): Db {
  let batches = 0;
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== "batch") {
        return Reflect.get(target, property, receiver);
      }
      return async (statements: Parameters<Db["batch"]>[0]) => {
        batches += 1;
        if (batches === nth) {
          await before();
        }
        return await target.batch(statements);
      };
    },
  });
}

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

  it("keeps positions dense when a remove lands between a reorder's read and write", async () => {
    const [a, b, c] = (await addGestures(["A", "B", "C"])) as [
      string,
      string,
      string,
    ];
    const created = await listWith([a, b, c]);
    const db = createDb(env.DB);
    const racing = raceBeforeBatch(db, 2, () =>
      removeItem(db, owner.id, { gestureId: b, id: created.id })
    );

    await reorderList(racing, owner.id, {
      gestureIds: [b, c, a],
      id: created.id,
    });

    expect(await storedItems(created.id)).toEqual([
      { gestureId: c, position: 0 },
      { gestureId: a, position: 1 },
    ]);
  });

  it("closes a gap a gesture delete left on the list's next write", async () => {
    const [a, b, c, d] = (await addGestures(["A", "B", "C", "D"])) as [
      string,
      string,
      string,
      string,
    ];
    const created = await listWith([a, b, c, d]);
    // Deleting a gesture cascades to its list items (phase 5 admin).
    await env.DB.prepare("DELETE FROM gesture WHERE id = ?").bind(b).run();
    expect((await storedItems(created.id)).map((row) => row.position)).toEqual([
      0, 2, 3,
    ]);

    await call(
      router.removeItem,
      { gestureId: d, id: created.id },
      contextFor(owner)
    );
    expect(await storedItems(created.id)).toEqual([
      { gestureId: a, position: 0 },
      { gestureId: c, position: 1 },
    ]);

    await env.DB.prepare("DELETE FROM gesture WHERE id = ?").bind(a).run();
    await call(
      router.reorder,
      { gestureIds: [c], id: created.id },
      contextFor(owner)
    );
    expect(await storedItems(created.id)).toEqual([
      { gestureId: c, position: 0 },
    ]);
  });

  it("renumbers by position when the row order differs from it", async () => {
    const [a, b, c, d] = (await addGestures(["A", "B", "C", "D"])) as [
      string,
      string,
      string,
      string,
    ];
    const created = await listWith([a, b, c, d]);
    await call(
      router.reorder,
      { gestureIds: [d, c, b, a], id: created.id },
      contextFor(owner)
    );
    await env.DB.prepare("DELETE FROM gesture WHERE id = ?").bind(d).run();

    await call(
      router.removeItem,
      { gestureId: c, id: created.id },
      contextFor(owner)
    );
    expect(await storedItems(created.id)).toEqual([
      { gestureId: b, position: 0 },
      { gestureId: a, position: 1 },
    ]);
  });

  it("keeps an add that lands between a reorder's read and write after the rest", async () => {
    const [a, b, c] = (await addGestures(["A", "B", "C"])) as [
      string,
      string,
      string,
    ];
    const created = await listWith([a, b]);
    const db = createDb(env.DB);
    const racing = raceBeforeBatch(db, 2, () =>
      call(router.addItem, { gestureId: c, id: created.id }, contextFor(owner))
    );

    await reorderList(racing, owner.id, { gestureIds: [b, a], id: created.id });

    expect(await storedItems(created.id)).toEqual([
      { gestureId: b, position: 0 },
      { gestureId: a, position: 1 },
      { gestureId: c, position: 2 },
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
