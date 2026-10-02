import { env } from "cloudflare:workers";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { gesture } from "../src";
import { createTestDb, insertGestures } from "../src/testing";

describe("insertGestures", () => {
  it("inserts many gestures in one batch, in order, published by default", async () => {
    const db = createTestDb(env);
    const ids = await insertGestures(
      db,
      Array.from({ length: 499 }, (_, index) => ({ name: `G${index}` }))
    );
    expect(ids).toHaveLength(499);
    expect(new Set(ids).size).toBe(499);

    const rows = await db
      .select({
        id: gesture.id,
        name: gesture.name,
        publishedAt: gesture.publishedAt,
      })
      .from(gesture)
      .where(inArray(gesture.id, ids.slice(0, 3)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(ids.slice(0, 3).map((id) => byId.get(id)?.name)).toEqual([
      "G0",
      "G1",
      "G2",
    ]);
    expect(rows.every((row) => row.publishedAt instanceof Date)).toBe(true);
  });

  it("takes the same overrides as makeGesture (a draft)", async () => {
    const db = createTestDb(env);
    const [id] = await insertGestures(db, [
      { name: "Concept", publishedAt: null },
    ]);
    const [row] = await db
      .select({ publishedAt: gesture.publishedAt, sortName: gesture.sortName })
      .from(gesture)
      .where(inArray(gesture.id, [id as string]));
    expect(row).toEqual({ publishedAt: null, sortName: "concept" });
  });

  it("does nothing for no rows", async () => {
    expect(await insertGestures(createTestDb(env), [])).toEqual([]);
  });
});
