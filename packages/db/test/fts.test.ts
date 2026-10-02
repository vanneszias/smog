import { env } from "cloudflare:workers";
import { newId } from "@smog/utils";
import { eq, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  category,
  gestureCategory,
  gestureKeyword,
  rebuildCategoryGesturesFtsSql,
  rebuildGestureFtsSql,
  rebuildGesturesFtsSql,
} from "../src";
import { createDb, type Db } from "../src/client";
import { makeCategory, makeGesture } from "../src/testing";

/*
 * The set forms of the one `gesture_fts` row definition: for every gesture
 * they cover, they must write exactly the row `rebuildGestureFtsSql` writes,
 * and leave every other gesture's row alone.
 */

interface FtsRow {
  categories: string;
  description: string;
  gesture_id: string;
  keywords: string;
  name: string;
}

const db: Db = createDb(env.DB);
const INVALID_GESTURE_ID = /Invalid gesture id/;
const INVALID_CATEGORY_ID = /Invalid category id/;

async function run(statements: readonly SQL[]): Promise<void> {
  if (statements.length === 0) {
    return;
  }
  const [first, ...rest] = statements.map((statement) => db.run(statement));
  if (first) {
    await db.batch([first, ...rest]);
  }
}

async function ftsRow(gestureId: string): Promise<FtsRow | null> {
  return await env.DB.prepare(
    "SELECT gesture_id, name, keywords, categories, description FROM gesture_fts WHERE gesture_id = ?"
  )
    .bind(gestureId)
    .first<FtsRow>();
}

async function ftsCount(gestureId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM gesture_fts WHERE gesture_id = ?"
  )
    .bind(gestureId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** A gesture in `categories` with keywords, indexed one at a time. */
async function indexedGesture(name: string, categoryIds: string[]) {
  const row = await makeGesture(db, { description: `${name} uitleg`, name });
  if (categoryIds.length > 0) {
    await db
      .insert(gestureCategory)
      .values(
        categoryIds.map((categoryId) => ({ categoryId, gestureId: row.id }))
      );
  }
  await db.insert(gestureKeyword).values([
    { gestureId: row.id, keyword: `${name}-a`, position: 0 },
    { gestureId: row.id, keyword: `${name}-b`, position: 1 },
  ]);
  await run(rebuildGestureFtsSql(row.id));
  return row;
}

describe("rebuildGesturesFtsSql", () => {
  it("writes the one-row definition for every id and leaves others alone", async () => {
    const shown = await makeCategory(db, { name: "Zichtbaar" });
    const hidden = await makeCategory(db, {
      name: "Verborgen",
      publishedAt: null,
    });
    const one = await indexedGesture("Een", [shown.id, hidden.id]);
    const two = await indexedGesture("Twee", [shown.id]);
    const other = await indexedGesture("Ander", [shown.id]);
    const expected = {
      one: await ftsRow(one.id),
      two: await ftsRow(two.id),
    };
    expect(expected.one?.categories).toBe("Zichtbaar");

    // Stale rows (and a duplicate) that the set rebuild must replace.
    await env.DB.prepare(
      "UPDATE gesture_fts SET name = 'stale' WHERE gesture_id IN (?, ?, ?)"
    )
      .bind(one.id, two.id, other.id)
      .run();
    await env.DB.prepare(
      "INSERT INTO gesture_fts (gesture_id, name, keywords, categories, description) VALUES (?, 'dup', '', '', '')"
    )
      .bind(one.id)
      .run();

    await run(rebuildGesturesFtsSql([one.id, two.id, one.id]));

    expect(await ftsCount(one.id)).toBe(1);
    expect(await ftsRow(one.id)).toEqual(expected.one);
    expect(await ftsRow(two.id)).toEqual(expected.two);
    expect((await ftsRow(other.id))?.name).toBe("stale");
  });

  it("drops the rows of deleted gestures and is empty for no ids", async () => {
    const gone = await indexedGesture("Weg", []);
    await env.DB.prepare("DELETE FROM gesture WHERE id = ?")
      .bind(gone.id)
      .run();
    await run(rebuildGesturesFtsSql([gone.id]));
    expect(await ftsCount(gone.id)).toBe(0);
    expect(rebuildGesturesFtsSql([])).toEqual([]);
  });

  it("refuses an id it cannot inline safely", () => {
    expect(() => rebuildGesturesFtsSql(["ok", "x' OR 1=1 --"])).toThrow(
      INVALID_GESTURE_ID
    );
  });
});

describe("rebuildCategoryGesturesFtsSql", () => {
  it("reindexes every gesture of the category after a rename or unpublish", async () => {
    const renamed = await makeCategory(db, { name: "Oud" });
    const a = await indexedGesture("Alfa", [renamed.id]);
    const b = await indexedGesture("Beta", [renamed.id]);
    const outside = await indexedGesture("Gamma", []);
    expect((await ftsRow(a.id))?.categories).toBe("Oud");

    await db
      .update(category)
      .set({ name: "Nieuw" })
      .where(eq(category.id, renamed.id));
    await run(rebuildCategoryGesturesFtsSql(renamed.id));
    expect((await ftsRow(a.id))?.categories).toBe("Nieuw");
    expect((await ftsRow(b.id))?.categories).toBe("Nieuw");

    await db
      .update(category)
      .set({ publishedAt: null })
      .where(eq(category.id, renamed.id));
    await env.DB.prepare(
      "UPDATE gesture_fts SET name = 'stale' WHERE gesture_id = ?"
    )
      .bind(outside.id)
      .run();
    await run(rebuildCategoryGesturesFtsSql(renamed.id));
    expect((await ftsRow(a.id))?.categories).toBe("");
    expect(await ftsCount(b.id)).toBe(1);
    // Built from the tables, exactly as the one-row form.
    const viaOne = await ftsRow(b.id);
    await run(rebuildGestureFtsSql(b.id));
    expect(await ftsRow(b.id)).toEqual(viaOne);
    expect((await ftsRow(outside.id))?.name).toBe("stale");
  });

  it("refuses a category id it cannot inline safely", () => {
    expect(() => rebuildCategoryGesturesFtsSql(`${newId()}'`)).toThrow(
      INVALID_CATEGORY_ID
    );
  });
});
