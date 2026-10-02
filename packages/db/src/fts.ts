/**
 * The one definition of a `gesture_fts` row (migration 0001): the gesture's
 * name, its keywords and the names of its **published** categories (each
 * joined by spaces) and its description.
 *
 * The rows are rebuilt from the tables with `INSERT … SELECT`, so the
 * statements see every earlier write of the same D1 batch: a service puts
 * them after its writes (`reindexGesture` in `@smog/gestures/server`, the
 * admin catalogue writes), and the dev seed renders them into
 * `seed/dev.sql`. The one-row form and the set forms share `rebuild`, so
 * they cannot drift apart.
 */
import { type SQL, sql } from "drizzle-orm";
import { category, gesture, gestureCategory, gestureKeyword } from "./schema";

/** The ids that may be inlined: UUIDs, seed ids. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A quoted SQLite string literal. The id is inlined rather than bound
 * because drizzle-orm 0.45's D1 `batch()` cannot bind the parameters of a
 * raw `db.run(sql)` statement, and the seed needs plain SQL text anyway.
 * Quote doubling is the complete escape for SQLite string literals; the id
 * pattern is defence in depth.
 */
// TODO(drizzle upgrade): bind the ids once D1 `batch()` binds raw statements.
function literal(kind: "category" | "gesture", value: string): SQL {
  if (!ID.test(value)) {
    throw new Error(`[db] Invalid ${kind} id: ${JSON.stringify(value)}`);
  }
  return sql.raw(`'${value.replaceAll("'", "''")}'`);
}

/**
 * The two statements that replace the `gesture_fts` rows of a set of
 * gestures: `ftsRows` picks them by `gesture_fts.gesture_id`, `gestureRows`
 * by `gesture.id` (the same set). A deleted gesture loses its row.
 */
function rebuild(ftsRows: SQL, gestureRows: SQL): readonly [SQL, SQL] {
  return [
    sql`DELETE FROM gesture_fts WHERE ${ftsRows}`,
    sql`INSERT INTO gesture_fts (gesture_id, name, keywords, categories, description) SELECT ${gesture.id}, ${gesture.name}, coalesce((SELECT group_concat(${gestureKeyword.keyword}, ' ') FROM ${gestureKeyword} WHERE ${gestureKeyword.gestureId} = ${gesture.id}), ''), coalesce((SELECT group_concat(${category.name}, ' ') FROM ${gestureCategory} JOIN ${category} ON ${category.id} = ${gestureCategory.categoryId} WHERE ${gestureCategory.gestureId} = ${gesture.id} AND ${category.publishedAt} IS NOT NULL), ''), ${gesture.description} FROM ${gesture} WHERE ${gestureRows}`,
  ];
}

/**
 * The statements that replace one gesture's `gesture_fts` row, without
 * bound parameters. An unknown or deleted id leaves no row.
 */
export function rebuildGestureFtsSql(gestureId: string): readonly [SQL, SQL] {
  const id = literal("gesture", gestureId);
  return rebuild(sql`gesture_id = ${id}`, sql`${gesture.id} = ${id}`);
}

/**
 * The set form of `rebuildGestureFtsSql`: the rows of every gesture in
 * `gestureIds` (duplicates are ignored; a deleted id loses its row), in two
 * statements. Empty for no ids.
 */
export function rebuildGesturesFtsSql(
  gestureIds: readonly string[]
): readonly SQL[] {
  const ids = [...new Set(gestureIds)];
  if (ids.length === 0) {
    return [];
  }
  const list = sql.join(
    ids.map((id) => literal("gesture", id)),
    sql`, `
  );
  return rebuild(sql`gesture_id IN (${list})`, sql`${gesture.id} IN (${list})`);
}

/**
 * The rows of every gesture in the category, for a category rename,
 * publish or unpublish (the `categories` column holds the published
 * category names). Put it after the category write in the same batch.
 */
export function rebuildCategoryGesturesFtsSql(
  categoryId: string
): readonly [SQL, SQL] {
  const members = sql`(SELECT ${gestureCategory.gestureId} FROM ${gestureCategory} WHERE ${gestureCategory.categoryId} = ${literal("category", categoryId)})`;
  return rebuild(
    sql`gesture_id IN ${members}`,
    sql`${gesture.id} IN ${members}`
  );
}
