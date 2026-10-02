import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Db } from "./client";

/** One statement of a D1 batch (`db.batch([...])`). */
export type Statement = BatchItem<"sqlite">;

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
 * A JSON array parameter, for `json_each(?)`: one bound value for any list.
 * D1 allows at most 100 bound parameters per statement (also in a batch),
 * so a list of values is never bound one parameter per value (`inArray`,
 * which biome refuses in package source).
 */
export function jsonList(values: readonly unknown[]): string {
  return JSON.stringify(values);
}

/** `column IN (the values)`, bound as one parameter (see `jsonList`). */
export function inList(column: SQLWrapper, values: readonly unknown[]): SQL {
  return sql`${column} IN (SELECT value FROM json_each(${jsonList(values)}))`;
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

/**
 * A `failWhen` guard that fired: the batch rolled back. `guard` is its
 * name; `cause` is D1's error.
 */
export class GuardFailedError extends Error {
  readonly guard: string;

  constructor(guard: string, options: { cause: unknown }) {
    super(`[db] The ${guard} guard stopped the write`, options);
    this.guard = guard;
    this.name = "GuardFailedError";
  }
}

const GUARD_PREFIX = "smog-guard:";
/** Where a guard's name ends in the error message. */
const GUARD_NAME_END = /[^A-Za-z0-9-]|$/;

/**
 * A batch statement that fails the whole batch when `condition` holds at
 * that point of the batch (it sees the earlier statements' writes). SQLite
 * has no `RAISE` outside triggers, so the guard evaluates an invalid JSON
 * path, whose error names the guard (`bad JSON path: 'smog-guard:<name>'`);
 * `toGuardFailure` turns that error into `GuardFailedError`. The
 * catalogue writes (`@smog/admin`) and the sponsorship transitions
 * (`@smog/sponsorships`) use the same guard.
 */
export function failWhen(db: Db, guard: string, condition: SQL): Statement {
  return db
    .select({
      guard: sql`CASE WHEN ${condition} THEN json_extract('{}', ${GUARD_PREFIX + guard}) END`,
    })
    .from(sql`(SELECT 1)`);
}

/**
 * The `GuardFailedError` for a batch error that a `failWhen` guard
 * caused (D1 wraps it in causes), or `null` for any other error.
 */
export function toGuardFailure(error: unknown): GuardFailedError | null {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const at = e.message.indexOf(GUARD_PREFIX);
    if (at !== -1) {
      const rest = e.message.slice(at + GUARD_PREFIX.length);
      return new GuardFailedError(rest.slice(0, rest.search(GUARD_NAME_END)), {
        cause: error,
      });
    }
  }
  return null;
}
