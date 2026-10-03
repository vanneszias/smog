import { type GetColumnData, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * `column AS alias`, decoded like the column. Drizzle's D1 `batch` reads
 * each row as an object keyed by the column name, so two columns of a join
 * with the same name (`sponsorship.id` and `gesture.id`) collapse into one
 * and every later field shifts; a joined select inside a batch names each
 * such column uniquely with this.
 */
export function aliased<T extends AnySQLiteColumn>(
  column: T,
  alias: string
): SQL.Aliased<GetColumnData<T>> {
  return sql<GetColumnData<T>>`${column}`.mapWith(column).as(alias);
}
