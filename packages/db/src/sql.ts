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

/**
 * A ban in force on the `user` row named `alias`: `banned` and an end that
 * is unset or still ahead (the admin users list and the last-admin guards;
 * migration 0007's trigger states the same in SQL).
 */
export function userBanInForce(now: Date, alias = "user"): SQL {
  const banned = sql`${sql.identifier(alias)}.${sql.identifier("banned")}`;
  const ends = sql`${sql.identifier(alias)}.${sql.identifier("ban_expires")}`;
  return sql`(coalesce(${banned}, 0) = 1 AND (${ends} IS NULL OR ${ends} > ${now.getTime()}))`;
}

/**
 * Whether an admin other than `userId` has no ban in force: the last-admin
 * rule (ruling 7) for a demotion or a deletion of `userId`.
 */
export function otherActiveAdminExists(userId: string, now: Date): SQL {
  return sql`EXISTS (SELECT 1 FROM ${sql.identifier("user")} AS ${sql.identifier("other")} WHERE ${sql.identifier("other")}.${sql.identifier("role")} = 'admin' AND ${sql.identifier("other")}.${sql.identifier("id")} <> ${userId} AND NOT ${userBanInForce(now, "other")})`;
}
