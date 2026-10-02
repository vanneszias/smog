import { type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * `alias."column"`. Drizzle renders columns unqualified in single-table
 * statements, where a correlated subquery would resolve them against its
 * own tables (`json_each` has an `id` column too), so every correlated
 * reference names its side: the outer row by its table name, inner tables
 * by an alias.
 */
export function ref(alias: string, column: SQLiteColumn): SQL {
  return sql`${sql.raw(alias)}.${sql.identifier(column.name)}`;
}
