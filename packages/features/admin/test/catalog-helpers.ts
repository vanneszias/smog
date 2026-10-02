/**
 * Catalogue fixtures for the gesture and category tests (and their auth
 * inputs): rows written like the services write them (`sort_name`, the
 * FTS row), and readers for what the admin writes must keep in step.
 */
import { env } from "cloudflare:workers";
import {
  type Category,
  type Gesture,
  gestureCategory,
  gestureKeyword,
  rebuildGestureFtsSql,
  sponsor,
  sponsorship,
} from "@smog/db";
import { makeCategory, makeGesture } from "@smog/db/testing";
import { newId } from "@smog/utils";
import { testDb } from "./helpers";

export async function addCategory(
  name = `Categorie ${newId().slice(0, 8)}`,
  options: { published?: boolean; sortOrder?: number } = {}
): Promise<Category> {
  return await makeCategory(testDb(), {
    name,
    publishedAt: options.published === false ? null : new Date(),
    sortOrder: options.sortOrder ?? 0,
  });
}

interface GestureFixture {
  categories?: Category[];
  keywords?: string[];
  name?: string;
  published?: boolean;
}

/** A gesture with categories and keywords, and its FTS row. */
export async function addGesture(
  fixture: GestureFixture = {}
): Promise<Gesture> {
  const db = testDb();
  const row = await makeGesture(db, {
    name: fixture.name ?? `Gebaar ${newId().slice(0, 8)}`,
    publishedAt: fixture.published === false ? null : new Date(),
  });
  const categories = fixture.categories ?? [await addCategory()];
  if (categories.length > 0) {
    await db
      .insert(gestureCategory)
      .values(
        categories.map((item) => ({ categoryId: item.id, gestureId: row.id }))
      );
  }
  const keywords = fixture.keywords ?? [];
  if (keywords.length > 0) {
    await db.insert(gestureKeyword).values(
      keywords.map((keyword, position) => ({
        gestureId: row.id,
        keyword,
        position,
      }))
    );
  }
  const [remove, insert] = rebuildGestureFtsSql(row.id);
  await db.batch([db.run(remove), db.run(insert)]);
  return row;
}

/** A sponsorship (any status) on the gesture. */
export async function addSponsorship(gestureId: string): Promise<void> {
  const db = testDb();
  const sponsorId = newId();
  await db.insert(sponsor).values({
    email: "sponsor@smog.test",
    id: sponsorId,
    locale: "nl",
    name: "Sponsor",
  });
  await db.insert(sponsorship).values({
    displayName: "Sponsor",
    gestureId,
    id: newId(),
    sponsorId,
    status: "expired",
  });
}

export interface FtsRow {
  categories: string;
  description: string;
  keywords: string;
  name: string;
}

export async function ftsRows(gestureId: string): Promise<FtsRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT name, keywords, categories, description FROM gesture_fts WHERE gesture_id = ?"
  )
    .bind(gestureId)
    .all<FtsRow>();
  return results;
}

/** The row `rebuildGestureFtsSql` would write now (computed on the side). */
async function expectedFtsRow(gestureId: string): Promise<FtsRow | null> {
  return await env.DB.prepare(
    "SELECT g.name AS name, coalesce((SELECT group_concat(k.keyword, ' ') FROM gesture_keyword k WHERE k.gesture_id = g.id), '') AS keywords, coalesce((SELECT group_concat(c.name, ' ') FROM gesture_category gc JOIN category c ON c.id = gc.category_id WHERE gc.gesture_id = g.id AND c.published_at IS NOT NULL), '') AS categories, g.description AS description FROM gesture g WHERE g.id = ?"
  )
    .bind(gestureId)
    .first<FtsRow>();
}

/**
 * The ids among `gestureIds` whose `gesture_fts` rows are not exactly the
 * one row the definition gives now (none, several, or other values).
 */
export async function ftsOutOfStep(
  gestureIds: readonly string[]
): Promise<string[]> {
  const checks = await Promise.all(
    gestureIds.map(async (id) => {
      const [rows, expected] = await Promise.all([
        ftsRows(id),
        expectedFtsRow(id),
      ]);
      const inStep =
        rows.length === 1 &&
        JSON.stringify(rows[0]) === JSON.stringify(expected);
      return inStep ? null : id;
    })
  );
  return checks.filter((id): id is string => id !== null);
}

export interface StoredGesture {
  name: string;
  published_at: number | null;
  slug: string;
  sort_name: string;
  updated_at: number;
}

export async function storedGesture(id: string): Promise<StoredGesture | null> {
  return await env.DB.prepare(
    "SELECT name, slug, sort_name, published_at, updated_at FROM gesture WHERE id = ?"
  )
    .bind(id)
    .first<StoredGesture>();
}

export async function catalogVersion(): Promise<string | null> {
  return await env.KV.get("catalog:version");
}

/** The gesture's category ids, sorted. */
export async function categoryIdsOf(gestureId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT category_id AS id FROM gesture_category WHERE gesture_id = ? ORDER BY category_id"
  )
    .bind(gestureId)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}
