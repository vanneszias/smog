/**
 * The catalogue's write rules (ruling 8), shared by the gesture and
 * category routes:
 *
 * - every write is one `db.batch([guards…, changes…, fts…, audit…])`, so the
 *   change, the `gesture_fts` rows and the audit entry land together or
 *   not at all;
 * - the checks a handler makes on its first read (a stale
 *   `expectedUpdatedAt`, a gesture left without a category, …) are repeated
 *   inside the batch by `failWhen` guards, so a write that raced another
 *   admin's rolls back instead of landing on rows it did not check;
 * - after the batch, `deps.bumpCatalogVersion(kv)`; a KV failure is logged
 *   and swallowed (D1 is written; only the typo tier and the public
 *   categories snapshot stay stale until the next bump).
 */
import { type category, gesture } from "@smog/db";
import type { Db } from "@smog/db/client";
import { slugify } from "@smog/utils";
import { or, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { AdminDeps } from "./procedure";

export type Statement = BatchItem<"sqlite">;

/**
 * `alias."column"`. Drizzle renders columns unqualified in single-table
 * statements, where a correlated subquery would resolve them against its
 * own tables (`json_each` has an `id` column too), so every subquery names
 * both sides: the outer row by its table name, inner tables by an alias.
 */
export function ref(alias: string, column: SQLiteColumn): SQL {
  return sql`${sql.raw(alias)}.${sql.identifier(column.name)}`;
}

/** A `failWhen` guard that fired: the batch rolled back. */
export class GuardFailedError extends Error {
  readonly guard: string;

  constructor(guard: string, options: { cause: unknown }) {
    super(`[admin] The ${guard} guard stopped the write`, options);
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
 * `runCatalogBatch` turns it into `GuardFailedError`.
 */
export function failWhen(db: Db, guard: string, condition: SQL): Statement {
  return db
    .select({
      guard: sql`CASE WHEN ${condition} THEN json_extract('{}', ${GUARD_PREFIX + guard}) END`,
    })
    .from(sql`(SELECT 1)`);
}

function guardName(error: unknown): string | null {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const at = e.message.indexOf(GUARD_PREFIX);
    if (at !== -1) {
      const rest = e.message.slice(at + GUARD_PREFIX.length);
      return rest.slice(0, rest.search(GUARD_NAME_END));
    }
  }
  return null;
}

/** Whether `error` is a unique-index violation on `<table>.slug`. */
function isSlugConflict(error: unknown, table: string): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(`UNIQUE constraint failed: ${table}.slug`)) {
      return true;
    }
  }
  return false;
}

/**
 * Runs the statements as one D1 batch (one transaction). A `failWhen`
 * guard that fired is `GuardFailedError`; anything else is logged and
 * rethrown.
 */
export async function runCatalogBatch(
  db: Db,
  statements: readonly Statement[],
  what: string
): Promise<void> {
  const [first, ...rest] = statements;
  if (!first) {
    return;
  }
  try {
    await db.batch([first, ...rest]);
  } catch (error) {
    const guard = guardName(error);
    if (guard !== null) {
      throw new GuardFailedError(guard, { cause: error });
    }
    if (
      !(isSlugConflict(error, "gesture") || isSlugConflict(error, "category"))
    ) {
      console.error(`[admin] Failed to ${what}:`, error);
    }
    throw error;
  }
}

/**
 * Starts a new catalog version after a catalogue write. D1 is already
 * written, so a KV failure is logged and swallowed (ruling 8): only the
 * typo tier and the public categories snapshot stay stale until the next
 * bump.
 */
export async function bumpCatalog(
  deps: AdminDeps,
  kv: KVNamespace,
  what: string
): Promise<void> {
  try {
    await deps.bumpCatalogVersion(kv);
  } catch (error) {
    console.error(
      `[admin] Failed to bump the catalog version after ${what}; the catalog snapshot stays stale until the next bump:`,
      error
    );
  }
}

/** How often a create retries a slug another write took meanwhile. */
const SLUG_ATTEMPTS = 3;

type SluggedTable = typeof category | typeof gesture;

/**
 * The first free slug for `name` in `table`: `slugify(name)` (`fallback`
 * when that is empty), else `-2`, `-3`, …. The taken ones are read with a
 * range on the unique slug index (`base` or `base-…`).
 */
async function freeSlug(
  db: Db,
  table: SluggedTable,
  name: string,
  fallback: string
): Promise<string> {
  const base = slugify(name) || fallback;
  // Every `base-…` sorts between `base-` and `base.` ('-' < '.').
  const rows = await db
    .select({ slug: table.slug })
    .from(table)
    .where(
      or(
        sql`${table.slug} = ${base}`,
        sql`${table.slug} > ${`${base}-`} AND ${table.slug} < ${`${base}.`}`
      )
    );
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

/**
 * Runs `write(slug)`'s batch with the first free slug, and retries with
 * the next one when another write took it meanwhile (the unique index).
 */
export async function withFreeSlug(
  db: Db,
  table: SluggedTable,
  name: string,
  write: (slug: string) => Promise<void>
): Promise<string> {
  const tableName = table === gesture ? "gesture" : "category";
  for (let attempt = 1; ; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each retry needs the slugs the failed attempt did not see.
    const slug = await freeSlug(db, table, name, tableName);
    try {
      await write(slug);
      return slug;
    } catch (error) {
      if (!isSlugConflict(error, tableName) || attempt >= SLUG_ATTEMPTS) {
        if (isSlugConflict(error, tableName)) {
          console.error(
            `[admin] Failed to find a free ${tableName} slug:`,
            error
          );
        }
        throw error;
      }
    }
  }
}

/**
 * The `updated_at` of a write that replaces `previous`: now, but always
 * later than `previous`, so two saves in one millisecond still look stale
 * to an editor holding the first one.
 */
export function nextUpdatedAt(previous: Date | number): Date {
  const at = typeof previous === "number" ? previous : previous.getTime();
  return new Date(Math.max(Date.now(), at + 1));
}

/** A JSON array parameter, for `json_each(?)`: one bound value for any list. */
export function jsonList(values: readonly unknown[]): string {
  return JSON.stringify(values);
}
