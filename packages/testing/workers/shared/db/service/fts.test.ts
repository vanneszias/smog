import { env } from "cloudflare:workers";
import { newId } from "@smog/utils";
import { eq, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../../../db/src/client";
import {
  category,
  categoryTranslation,
  gestureCategory,
  gestureKeyword,
  gestureTranslation,
  rebuildCategoryGesturesFtsSql,
  rebuildGestureFtsSql,
  rebuildGesturesFtsSql,
} from "../../../../../db/src/index";
import { makeCategory, makeGesture } from "../../../../support/db/index";

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

interface LocaleFtsRow extends FtsRow {
  locale: string;
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

/** Words in a stable order (`group_concat` has no defined order). */
const sorted = (text: string): string => text.split(" ").sort().join(" ");

/** Every row of a gesture, one per language, by locale (category and keyword words sorted). */
async function ftsRows(
  gestureId: string
): Promise<Partial<Record<string, LocaleFtsRow>>> {
  const { results } = await env.DB.prepare(
    "SELECT gesture_id, locale, name, keywords, categories, description FROM gesture_fts WHERE gesture_id = ? ORDER BY locale"
  )
    .bind(gestureId)
    .all<LocaleFtsRow>();
  return Object.fromEntries(
    results.map((row) => [
      row.locale,
      {
        ...row,
        categories: sorted(row.categories),
        keywords: sorted(row.keywords),
      },
    ])
  );
}

describe("one gesture_fts row per (gesture, language)", () => {
  it("writes the default-language row from the base columns and one row per translation", async () => {
    const shown = await makeCategory(db, { name: "Dieren" });
    const plain = await makeCategory(db, { name: "Kleuren" });
    const item = await makeGesture(db, {
      description: "Een hond aaien.",
      name: "Hond",
    });
    await db.insert(gestureCategory).values([
      { categoryId: shown.id, gestureId: item.id },
      { categoryId: plain.id, gestureId: item.id },
    ]);
    await db.insert(gestureKeyword).values([
      { gestureId: item.id, keyword: "huisdier", position: 0 },
      { gestureId: item.id, keyword: "chien", locale: "fr", position: 0 },
      { gestureId: item.id, keyword: "pet", locale: "en", position: 0 },
    ]);
    await db.insert(categoryTranslation).values({
      categoryId: shown.id,
      locale: "fr",
      name: "Animaux",
    });
    await db.insert(gestureTranslation).values([
      {
        description: "Caresser un chien.",
        gestureId: item.id,
        locale: "fr",
        name: "Chien",
      },
      { gestureId: item.id, locale: "en", name: "Dog" },
    ]);

    await run(rebuildGestureFtsSql(item.id));

    const rows = await ftsRows(item.id);
    expect(Object.keys(rows).sort()).toEqual(["en", "fr", "nl"]);
    // The default language: the base columns, the default keywords only.
    expect(rows.nl).toMatchObject({
      categories: "Dieren Kleuren",
      description: "Een hond aaien.",
      keywords: "huisdier",
      name: "Hond",
    });
    // A translation: its name, description and keywords, its category
    // names (the default name where a category has no translation).
    expect(rows.fr).toMatchObject({
      categories: "Animaux Kleuren",
      description: "Caresser un chien.",
      keywords: "chien",
      name: "Chien",
    });
    expect(rows.en).toMatchObject({
      categories: "Dieren Kleuren",
      description: "",
      keywords: "pet",
      name: "Dog",
    });

    // The set form writes the same rows.
    const viaOne = await ftsRows(item.id);
    await run(rebuildGesturesFtsSql([item.id]));
    expect(await ftsRows(item.id)).toEqual(viaOne);

    // A category rename reindexes the translated rows too, and a removed
    // translation loses its row.
    await db
      .update(category)
      .set({ name: "Huisdieren" })
      .where(eq(category.id, shown.id));
    await db
      .delete(gestureTranslation)
      .where(eq(gestureTranslation.locale, "en"));
    await run(rebuildCategoryGesturesFtsSql(shown.id));
    const after = await ftsRows(item.id);
    expect(Object.keys(after).sort()).toEqual(["fr", "nl"]);
    expect(after.nl?.categories).toBe("Huisdieren Kleuren");
    expect(after.fr?.categories).toBe("Animaux Kleuren");
  });

  it("searches one language with the locale column, accents folded", async () => {
    const item = await makeGesture(db, { name: "Koffie" });
    await db
      .insert(gestureTranslation)
      .values({ gestureId: item.id, locale: "fr", name: "Café" });
    await run(rebuildGestureFtsSql(item.id));
    const hit = async (query: string, locale: string): Promise<string[]> =>
      (
        await env.DB.prepare(
          "SELECT gesture_id FROM gesture_fts WHERE gesture_fts MATCH ? AND locale = ?"
        )
          .bind(query, locale)
          .all<{ gesture_id: string }>()
      ).results.map((row) => row.gesture_id);
    expect(await hit("cafe", "fr")).toEqual([item.id]);
    expect(await hit("cafe", "nl")).toEqual([]);
    expect(await hit("koffie", "nl")).toEqual([item.id]);
    expect(await hit("koffie", "fr")).toEqual([]);
  });

  it("indexes a language an admin adds (languages are data)", async () => {
    await env.DB.prepare(
      "INSERT INTO language (code, name, intl_tag, enabled, is_default, sort_order) VALUES ('de', 'Deutsch', 'de-BE', 1, 0, 9) ON CONFLICT (code) DO NOTHING"
    ).run();
    const item = await makeGesture(db, { name: "Danke" });
    await db
      .insert(gestureTranslation)
      .values({ gestureId: item.id, locale: "de", name: "Danke schön" });
    await run(rebuildGestureFtsSql(item.id));
    expect((await ftsRows(item.id)).de?.name).toBe("Danke schön");
  });
});
