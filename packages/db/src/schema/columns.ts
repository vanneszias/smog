import { type SQL, sql } from "drizzle-orm";
import { integer, type SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * A `timestamp_ms` column: integer epoch milliseconds in SQL, `Date` in TS
 * (the mode Better Auth's Drizzle adapter uses; see DECISIONS).
 */
export function timestamp(name: string) {
  return integer(name, { mode: "timestamp_ms" });
}

/** `created_at`, defaulting to now in TS (the service layer may set it). */
export function createdAt() {
  return timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date());
}

/** `updated_at`, set to now on insert and on every Drizzle update. */
export function updatedAt() {
  return timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());
}

/**
 * The bare column name for CHECK constraints and partial index predicates.
 * `${column}` would render `"table"."column"`, which breaks the table
 * rebuilds drizzle-kit generates for SQLite (they create `__new_<table>`).
 */
export function col(column: SQLiteColumn): SQL {
  return sql`${sql.identifier(column.name)}`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** `<column> IN ('a', 'b', …)` for a CHECK constraint or a partial index. */
export function inValues(column: SQLiteColumn, values: readonly string[]): SQL {
  return sql`${col(column)} IN (${sql.raw(values.map(quote).join(", "))})`;
}

/** `length(<column>) BETWEEN min AND max` for a CHECK constraint. */
export function lengthBetween(
  column: SQLiteColumn,
  min: number,
  max: number
): SQL {
  return sql`length(${col(column)}) BETWEEN ${sql.raw(String(min))} AND ${sql.raw(String(max))}`;
}
