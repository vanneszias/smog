/**
 * The one definition of a `gesture_fts` row (migration 0001): the gesture's
 * name, its keywords and the names of its **published** categories (each
 * joined by spaces) and its description.
 *
 * The rows are rebuilt from the tables with `INSERT … SELECT`, so the
 * statements see every earlier write of the same D1 batch: a service puts
 * them after its writes (`reindexGesture` in `@smog/gestures/server`), and
 * the dev seed renders them into `seed/dev.sql`.
 */
import { type SQL, sql } from "drizzle-orm";
import { category, gesture, gestureCategory, gestureKeyword } from "./schema";

/**
 * A quoted SQLite string literal. The id is inlined rather than bound
 * because drizzle-orm 0.45's D1 `batch()` cannot bind the parameters of a
 * raw `db.run(sql)` statement, and the seed needs plain SQL text anyway.
 * Quote doubling is the complete escape for SQLite string literals.
 */
function literal(value: string): SQL {
  return sql.raw(`'${value.replaceAll("'", "''")}'`);
}

/**
 * The statements that replace one gesture's `gesture_fts` row, without
 * bound parameters. An unknown or deleted id leaves no row.
 */
export function rebuildGestureFtsSql(gestureId: string): readonly [SQL, SQL] {
  const id = literal(gestureId);
  return [
    sql`DELETE FROM gesture_fts WHERE gesture_id = ${id}`,
    sql`INSERT INTO gesture_fts (gesture_id, name, keywords, categories, description) SELECT ${gesture.id}, ${gesture.name}, coalesce((SELECT group_concat(${gestureKeyword.keyword}, ' ') FROM ${gestureKeyword} WHERE ${gestureKeyword.gestureId} = ${gesture.id}), ''), coalesce((SELECT group_concat(${category.name}, ' ') FROM ${gestureCategory} JOIN ${category} ON ${category.id} = ${gestureCategory.categoryId} WHERE ${gestureCategory.gestureId} = ${gesture.id} AND ${category.publishedAt} IS NOT NULL), ''), ${gesture.description} FROM ${gesture} WHERE ${gesture.id} = ${id}`,
  ];
}
