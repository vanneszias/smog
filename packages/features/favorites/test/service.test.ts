import { env } from "cloudflare:workers";
import { favorite, gesture, type User } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeGesture, makeUser } from "@smog/db/testing";
import { encodeCursor, InvalidCursorError } from "@smog/utils";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addFavorite,
  GestureNotFoundError,
  listFavoriteIds,
  listFavorites,
  removeFavorite,
  toggleFavorite,
} from "../src/server";
import { favoritesOf } from "../src/server/service";
import { findSummaries, resetTables } from "./helpers";

let db: Db;
let alice: User;
let bob: User;

beforeEach(async () => {
  db = createDb(env.DB);
  await resetTables();
  alice = await makeUser(db);
  bob = await makeUser(db);
});

/** `count` published gestures, `g0`…, in id order. */
async function gestures(count: number) {
  return await Promise.all(
    Array.from({ length: count }, (_, index) =>
      makeGesture(db, { id: `g${index}`, name: `Gebaar ${index}` })
    )
  );
}

function at(ms: number): Date {
  return new Date(Date.UTC(2026, 8, 29) + ms);
}

describe("addFavorite / removeFavorite", () => {
  it("is idempotent", async () => {
    const [hond] = await gestures(1);
    const id = hond?.id ?? "";

    await addFavorite(db, alice.id, id, at(1));
    await addFavorite(db, alice.id, id, at(2));
    expect(await listFavoriteIds(db, alice.id)).toEqual([id]);
    const rows = await db.select().from(favorite);
    // The second add keeps the first row (and its date).
    expect(rows).toEqual([
      { createdAt: at(1), gestureId: id, userId: alice.id },
    ]);

    await removeFavorite(db, alice.id, id);
    await removeFavorite(db, alice.id, id);
    expect(await listFavoriteIds(db, alice.id)).toEqual([]);
  });

  it("adds only published gestures, without writing otherwise", async () => {
    const hidden = await makeGesture(db, { publishedAt: null });

    await expect(addFavorite(db, alice.id, "nope")).rejects.toBeInstanceOf(
      GestureNotFoundError
    );
    await expect(addFavorite(db, alice.id, hidden.id)).rejects.toBeInstanceOf(
      GestureNotFoundError
    );
    await expect(
      toggleFavorite(db, alice.id, hidden.id)
    ).rejects.toBeInstanceOf(GestureNotFoundError);
    expect(await db.select().from(favorite)).toEqual([]);
  });

  it("removes whatever the gesture's state, and always succeeds", async () => {
    const [a, b] = await gestures(2);
    await addFavorite(db, alice.id, a?.id ?? "");
    await addFavorite(db, alice.id, b?.id ?? "");
    await db
      .update(gesture)
      .set({ publishedAt: null })
      .where(eq(gesture.id, a?.id ?? ""));

    // An unpublished favorite (a stale heart) can still be cleared.
    await removeFavorite(db, alice.id, a?.id ?? "");
    await removeFavorite(db, alice.id, "nope");
    expect(
      (await db.select().from(favorite)).map((row) => row.gestureId)
    ).toEqual([b?.id]);
    // Toggling a hidden favorite removes it too.
    await db
      .update(gesture)
      .set({ publishedAt: null })
      .where(eq(gesture.id, b?.id ?? ""));
    expect(await toggleFavorite(db, alice.id, b?.id ?? "")).toBe(false);
    expect(await db.select().from(favorite)).toEqual([]);
  });

  it("keeps each user's favorites apart", async () => {
    const [a, b] = await gestures(2);
    await addFavorite(db, alice.id, a?.id ?? "");
    await addFavorite(db, bob.id, b?.id ?? "");

    await removeFavorite(db, bob.id, a?.id ?? "");
    expect(await listFavoriteIds(db, alice.id)).toEqual([a?.id]);
    expect(await listFavoriteIds(db, bob.id)).toEqual([b?.id]);
    const page = await listFavorites({ db, findSummaries }, bob.id, {
      limit: 10,
    });
    expect(page.items.map((item) => item.id)).toEqual([b?.id]);
  });
});

describe("toggleFavorite", () => {
  it("adds when missing and removes when present", async () => {
    const [hond] = await gestures(1);
    const id = hond?.id ?? "";

    expect(await toggleFavorite(db, alice.id, id)).toBe(true);
    expect(await listFavoriteIds(db, alice.id)).toEqual([id]);
    expect(await toggleFavorite(db, alice.id, id)).toBe(false);
    expect(await listFavoriteIds(db, alice.id)).toEqual([]);
  });
});

describe("the favorite rows", () => {
  it("go when their gesture is deleted (ON DELETE CASCADE)", async () => {
    const [a, b] = await gestures(2);
    await addFavorite(db, alice.id, a?.id ?? "");
    await addFavorite(db, alice.id, b?.id ?? "");

    await db.delete(gesture).where(eq(gesture.id, a?.id ?? ""));
    expect(
      (await db.select().from(favorite)).map((row) => row.gestureId)
    ).toEqual([b?.id]);
  });

  it("are hidden, not deleted, while their gesture is unpublished", async () => {
    const [a, b] = await gestures(2);
    await addFavorite(db, alice.id, a?.id ?? "", at(1));
    await addFavorite(db, alice.id, b?.id ?? "", at(2));

    await db
      .update(gesture)
      .set({ publishedAt: null })
      .where(eq(gesture.id, b?.id ?? ""));
    expect(await listFavoriteIds(db, alice.id)).toEqual([a?.id]);
    const page = await listFavorites({ db, findSummaries }, alice.id, {
      limit: 10,
    });
    expect(page.items.map((item) => item.id)).toEqual([a?.id]);
    expect(await db.select().from(favorite)).toHaveLength(2);
  });
});

describe("listFavorites", () => {
  it("pages newest first with a keyset cursor, ties by id", async () => {
    const rows = await gestures(5);
    // g1 and g2 share a timestamp: the tie goes to the larger id first.
    const dates = [at(10), at(30), at(30), at(20), at(40)];
    for (const [index, row] of rows.entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: the dates are the point, keep the order readable.
      await addFavorite(db, alice.id, row.id, dates[index]);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor.
      const page = await listFavorites({ db, findSummaries }, alice.id, {
        cursor,
        limit: 2,
      });
      pages += 1;
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(["g4", "g2", "g1", "g3", "g0"]);
    expect(await listFavoriteIds(db, alice.id)).toEqual(seen);
  });

  it("seeks favorite_user_created_idx without a sort", async () => {
    const { params, sql: text } = favoritesOf(db, alice.id, {
      createdAt: at(5),
      gestureId: "g",
    })
      .limit(51)
      .toSQL();
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${text}`)
      .bind(...params)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail);
    expect(
      details.some((detail) =>
        detail.startsWith(
          "SEARCH favorite USING COVERING INDEX favorite_user_created_idx"
        )
      )
    ).toBe(true);
    expect(details.some((detail) => detail.includes("TEMP B-TREE"))).toBe(
      false
    );
  });

  it("rejects a cursor it did not issue", async () => {
    for (const cursor of [
      "nope",
      encodeCursor(["a", "b"]),
      encodeCursor([1]),
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one rejection at a time.
      await expect(
        listFavorites({ db, findSummaries }, alice.id, { cursor, limit: 5 })
      ).rejects.toBeInstanceOf(InvalidCursorError);
    }
  });
});
