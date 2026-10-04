/**
 * The SQL emitter (phase 8 rulings 7 and 14).
 *
 * - Every statement is one line of plain SQL with its values inlined
 *   (`wrangler d1 execute --file` takes no parameters), ending in `;`.
 *   Strings are quoted with quote doubling, the complete escape for a
 *   SQLite string literal; a line break inside a value is spliced in as
 *   `char(10)` / `char(13)`, so a statement never spans two lines.
 * - Typed statements go through drizzle: `insertRow` checks each key
 *   against the table's columns, maps values with the column's own driver
 *   mapping, names every conflict target, and is rendered by
 *   `SQLiteSyncDialect` (as the dev seed is).
 * - Statements are grouped (`FILE_GROUPS`, run in that order) and chunked
 *   into files of at most 500 statements and 512 KiB, named
 *   `<group>-<nnn>.sql`. An empty group still gets one empty file, so the
 *   manifest always lists every group.
 * - `reset-imported-<nnn>.sql` deletes what the import created, from the
 *   key lists the transforms return, in RESTRICT order (ruling 14).
 * - `manifest.json` holds the target, `--now`, the input hashes and every
 *   file's statement count, size and SHA-256.
 */
import { rebuildGesturesFtsSql } from "@smog/db";
import { sha256Hex } from "@smog/utils";
import { getTableColumns, getTableName, type SQL, sql } from "drizzle-orm";
import {
  type SQLiteColumn,
  SQLiteSyncDialect,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import type { Target } from "./target";

const dialect = new SQLiteSyncDialect();
const encoder = new TextEncoder();

export const FILE_STATEMENTS_MAX = 500;
export const FILE_BYTES_MAX = 512 * 1024;
/** Gestures per `gesture_fts` rebuild statement pair (ruling 9). */
export const FTS_CHUNK = 200;
/** Keys per reset statement. */
export const RESET_CHUNK = 250;

/** The SQL files, in the order `apply` runs them (ruling 14). */
export const FILE_GROUPS = [
  "10-users",
  "20-catalog",
  "30-learning",
  "40-account",
  "50-sponsorships",
  "90-fts",
] as const;
export type FileGroup = (typeof FILE_GROUPS)[number];
export const RESET_GROUP = "reset-imported";

export type SqlValue = string | number | bigint | boolean | null;

/** A SQL expression inlined as it is (a subquery the emitter built). */
export interface RawSql {
  readonly rawSql: string;
}

export function rawSql(text: string): RawSql {
  assertOneLine(text);
  return { rawSql: text };
}

function isRawSql(value: unknown): value is RawSql {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { rawSql?: unknown }).rawSql === "string"
  );
}

function assertOneLine(text: string): void {
  if (text.includes("\n") || text.includes("\r")) {
    throw new Error("[migrate-convex] A SQL statement must be one line");
  }
}

const LINE_BREAKS = /(\r\n|\r|\n)/;

function quote(text: string): string {
  if (text.includes("\0")) {
    throw new Error("[migrate-convex] A SQL string cannot hold a NUL byte");
  }
  return `'${text.replaceAll("'", "''")}'`;
}

/** `value` as a one-line SQLite literal. */
export function sqlLiteral(value: SqlValue): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`[migrate-convex] Not a SQL number: ${value}`);
    }
    return String(value);
  }
  if (!LINE_BREAKS.test(value)) {
    return quote(value);
  }
  const parts = value
    .split(LINE_BREAKS)
    .filter((part) => part.length > 0)
    .flatMap((part) => {
      if (part === "\r\n") {
        return ["char(13, 10)"];
      }
      if (part === "\n") {
        return ["char(10)"];
      }
      if (part === "\r") {
        return ["char(13)"];
      }
      return [quote(part)];
    });
  return `(${parts.join(" || ")})`;
}

function toSqlValue(value: unknown): SqlValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  throw new Error(
    `[migrate-convex] Cannot inline a ${typeof value} value in SQL`
  );
}

/**
 * Replaces each `?` outside quoted text and identifiers with its
 * parameter's literal.
 */
function inlineParams(text: string, params: readonly unknown[]): string {
  let out = "";
  let next = 0;
  let quoteChar: string | null = null;
  for (const char of text) {
    if (quoteChar) {
      out += char;
      if (char === quoteChar) {
        quoteChar = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quoteChar = char;
      out += char;
      continue;
    }
    if (char === "?") {
      if (next >= params.length) {
        throw new Error("[migrate-convex] More placeholders than parameters");
      }
      out += sqlLiteral(toSqlValue(params[next]));
      next += 1;
      continue;
    }
    out += char;
  }
  if (next !== params.length) {
    throw new Error("[migrate-convex] More parameters than placeholders");
  }
  return out;
}

/** A drizzle `SQL` statement as one line with its parameters inlined and a final `;`. */
export function renderSql(statement: SQL): string {
  const query = dialect.sqlToQuery(statement);
  const text = `${inlineParams(query.sql, query.params).trim()};`;
  assertOneLine(text);
  return text;
}

type InsertValues<T extends SQLiteTable> = {
  [K in keyof T["$inferInsert"]]?: T["$inferInsert"][K] | RawSql;
};

/**
 * `INSERT INTO <table> (…) VALUES (…) ON CONFLICT (<target>) DO NOTHING`,
 * one `ON CONFLICT` clause per target (ruling 7: the conflict target is
 * always named, so any other constraint violation fails loudly). Keys are
 * the table's TS column names; `undefined` leaves a column out; a `RawSql`
 * value is inlined as it is (`legacyIdRef`).
 */
export function insertRow<T extends SQLiteTable>(
  table: T,
  row: InsertValues<T>,
  conflictTargets: readonly (readonly SQLiteColumn[])[]
): string {
  const columns = getTableColumns(table) as Record<string, SQLiteColumn>;
  const name = getTableName(table);
  for (const key of Object.keys(row)) {
    if (!Object.hasOwn(columns, key)) {
      throw new Error(`[migrate-convex] ${name} has no column ${key}`);
    }
  }
  if (conflictTargets.length === 0) {
    throw new Error(
      `[migrate-convex] An insert into ${name} needs a conflict target`
    );
  }
  const own = new Set(Object.values(columns));
  for (const target of conflictTargets) {
    if (target.length === 0 || target.some((column) => !own.has(column))) {
      throw new Error(
        `[migrate-convex] A conflict target of ${name} names a column of another table`
      );
    }
  }
  const names: SQL[] = [];
  const values: SQL[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = (row as Record<string, unknown>)[key];
    if (value === undefined) {
      continue;
    }
    names.push(sql`${sql.identifier(column.name)}`);
    values.push(
      isRawSql(value)
        ? sql.raw(value.rawSql)
        : sql`${value === null ? null : column.mapToDriverValue(value)}`
    );
  }
  if (names.length === 0) {
    throw new Error(`[migrate-convex] An insert into ${name} needs a column`);
  }
  const conflicts = conflictTargets.map(
    (target) =>
      sql` ON CONFLICT (${sql.join(
        target.map((column) => sql.identifier(column.name)),
        sql`, `
      )}) DO NOTHING`
  );
  return renderSql(
    sql`INSERT INTO ${table} (${sql.join(names, sql`, `)}) VALUES (${sql.join(values, sql`, `)})${sql.join(conflicts, sql``)}`
  );
}

/** The tables whose rows carry a `legacy_id` (ruling 7). */
export type LegacyTable = "user" | "category" | "gesture" | "sponsorship";

const LEGACY_TABLES: readonly LegacyTable[] = [
  "user",
  "category",
  "gesture",
  "sponsorship",
];

/**
 * `(SELECT id FROM <table> WHERE legacy_id = '<legacyId>')`: how a child
 * row finds a parent whose id it cannot know (a claimed user keeps its own
 * id, ruling 7).
 */
export function legacyIdRef(table: LegacyTable, legacyId: string): RawSql {
  if (!LEGACY_TABLES.includes(table)) {
    throw new Error(`[migrate-convex] ${table} has no legacy_id`);
  }
  return rawSql(
    `(SELECT "id" FROM "${table}" WHERE "legacy_id" = ${sqlLiteral(legacyId)})`
  );
}

/** The `gesture_fts` rebuild of `gestureIds`, 200 gestures per statement pair (ruling 9). */
export function ftsRebuildStatements(gestureIds: readonly string[]): string[] {
  const ids = [...new Set(gestureIds)].sort();
  const statements: string[] = [];
  for (let start = 0; start < ids.length; start += FTS_CHUNK) {
    for (const statement of rebuildGesturesFtsSql(
      ids.slice(start, start + FTS_CHUNK)
    )) {
      statements.push(renderSql(statement));
    }
  }
  return statements;
}

// --- Reset (ruling 14) -----------------------------------------------------

/**
 * The tables `reset-imported` deletes from, in RESTRICT order: payment
 * items; then payments and sponsorships with their events and tokens; then
 * sponsors and invoice requests; then lists, favorites, consents and audit
 * rows; then the catalogue; users last.
 */
export const RESET_TABLES = [
  "payment_item",
  "sponsorship_token",
  "sponsorship_event",
  "payment",
  "sponsorship",
  "invoice_request",
  "sponsor",
  "list_share",
  "list_item",
  "list",
  "favorite",
  "consent_event",
  "audit_log",
  "gesture_keyword",
  "gesture_category",
  "gesture",
  "category",
] as const;
export type ResetTable = (typeof RESET_TABLES)[number];

/** Each table's key columns (a single key is a string, a composite a tuple). */
export const RESET_KEY_COLUMNS: Readonly<
  Record<ResetTable, readonly string[]>
> = {
  audit_log: ["id"],
  category: ["id"],
  consent_event: ["id"],
  favorite: ["user_id", "gesture_id"],
  gesture: ["id"],
  gesture_category: ["gesture_id", "category_id"],
  gesture_keyword: ["gesture_id", "keyword"],
  invoice_request: ["sponsor_id"],
  list: ["id"],
  list_item: ["list_id", "gesture_id"],
  list_share: ["id"],
  payment: ["id"],
  payment_item: ["payment_id", "sponsorship_id"],
  sponsor: ["id"],
  sponsorship: ["id"],
  sponsorship_event: ["id"],
  sponsorship_token: ["id"],
};

/** A user the import wrote: its new id (`legacyUuid`) and its Convex `_id`. */
export interface ResetUser {
  readonly id: string;
  readonly legacyId: string;
}

/**
 * What one transform created, for `reset-imported`. A key is a string for
 * a one-column key and a tuple in `RESET_KEY_COLUMNS` order otherwise.
 */
export interface ResetKeys {
  readonly rows?: {
    readonly [T in ResetTable]?: readonly (string | readonly string[])[];
  };
  /**
   * Every migrated user. A user the import created (its id is the
   * `legacyUuid`) is deleted, unless it is the last admin; a claimed
   * account (its own id) keeps its row with `legacy_id` set to NULL.
   */
  readonly users?: readonly ResetUser[];
}

function keyText(key: string | readonly string[]): string {
  return typeof key === "string" ? key : JSON.stringify(key);
}

/** All transforms' reset keys in one, distinct and sorted. */
export function mergeResetKeys(parts: readonly ResetKeys[]): ResetKeys {
  const rows: Partial<Record<ResetTable, (string | readonly string[])[]>> = {};
  for (const table of RESET_TABLES) {
    const seen = new Map<string, string | readonly string[]>();
    for (const part of parts) {
      for (const key of part.rows?.[table] ?? []) {
        seen.set(keyText(key), key);
      }
    }
    if (seen.size > 0) {
      rows[table] = [...seen]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([, key]) => key);
    }
  }
  const users = new Map<string, ResetUser>();
  for (const part of parts) {
    for (const entry of part.users ?? []) {
      users.set(`${entry.id}\u0000${entry.legacyId}`, entry);
    }
  }
  return {
    rows,
    users: [...users]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, entry]) => entry),
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

function ident(name: string): string {
  return `"${name}"`;
}

/** `(SELECT json_extract(value, '$[0]'), … FROM json_each('<json>'))` for tuples. */
function tupleSource(width: number, json: string): string {
  const columns = Array.from(
    { length: width },
    (_, index) => `json_extract(value, '$[${index}]')`
  );
  return `(SELECT ${columns.join(", ")} FROM json_each(${sqlLiteral(json)}))`;
}

function deleteStatements(
  table: ResetTable,
  keys: readonly (string | readonly string[])[]
): string[] {
  const columns = RESET_KEY_COLUMNS[table];
  return chunks(keys, RESET_CHUNK).map((part) => {
    for (const key of part) {
      const width = typeof key === "string" ? 1 : key.length;
      if (width !== columns.length) {
        throw new Error(
          `[migrate-convex] A ${table} reset key needs ${columns.length} part(s)`
        );
      }
    }
    if (columns.length === 1) {
      const json = JSON.stringify(
        part.map((key) => (typeof key === "string" ? key : key[0]))
      );
      return `DELETE FROM ${ident(table)} WHERE ${ident(columns[0] ?? "id")} IN (SELECT value FROM json_each(${sqlLiteral(json)}));`;
    }
    const json = JSON.stringify(part);
    return `DELETE FROM ${ident(table)} WHERE (${columns.map(ident).join(", ")}) IN ${tupleSource(columns.length, json)};`;
  });
}

/**
 * Deletes the users the import created, never the last admin: an admin
 * row goes only while another admin with no ban in force remains outside
 * the statement's set (a `DELETE` does not fire 0007's role trigger, so
 * the statement guards itself). Then claimed accounts lose their
 * `legacy_id`.
 */
function userResetStatements(users: readonly ResetUser[]): string[] {
  const statements: string[] = [];
  for (const part of chunks(users, RESET_CHUNK)) {
    const pairs = JSON.stringify(
      part.map((entry) => [entry.id, entry.legacyId])
    );
    const ids = JSON.stringify(part.map((entry) => entry.id));
    statements.push(
      `DELETE FROM "user" WHERE ("id", "legacy_id") IN ${tupleSource(2, pairs)} AND ("role" <> 'admin' OR EXISTS (SELECT 1 FROM "user" AS "other" WHERE "other"."role" = 'admin' AND NOT (coalesce("other"."banned", 0) = 1 AND ("other"."ban_expires" IS NULL OR "other"."ban_expires" > CAST(strftime('%s', 'now') AS INTEGER) * 1000)) AND "other"."id" NOT IN (SELECT value FROM json_each(${sqlLiteral(ids)}))));`
    );
  }
  for (const part of chunks(users, RESET_CHUNK)) {
    const legacyIds = JSON.stringify(part.map((entry) => entry.legacyId));
    statements.push(
      `UPDATE "user" SET "legacy_id" = NULL WHERE "legacy_id" IN (SELECT value FROM json_each(${sqlLiteral(legacyIds)}));`
    );
  }
  return statements;
}

/**
 * The reset statements in RESTRICT order (`RESET_TABLES`, then users); the
 * deleted gestures' `gesture_fts` rows go right after the gestures.
 */
export function resetStatements(keys: ResetKeys): string[] {
  const statements: string[] = [];
  for (const table of RESET_TABLES) {
    const tableKeys = keys.rows?.[table] ?? [];
    statements.push(...deleteStatements(table, tableKeys));
    if (table === "gesture" && tableKeys.length > 0) {
      statements.push(
        ...ftsRebuildStatements(
          tableKeys.map((key) =>
            typeof key === "string" ? key : (key[0] ?? "")
          )
        )
      );
    }
  }
  statements.push(...userResetStatements(keys.users ?? []));
  return statements;
}

// --- Files and the manifest -----------------------------------------------

export interface SqlFile {
  readonly content: string;
  readonly name: string;
  readonly statements: number;
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/**
 * `statements` as files `<base>-001.sql`, `<base>-002.sql` …: each at most
 * 500 statements and 512 KiB, one statement per line. No statements give
 * one empty file.
 */
export function chunkStatements(
  base: string,
  statements: readonly string[]
): SqlFile[] {
  const files: SqlFile[] = [];
  let lines: string[] = [];
  let bytes = 0;
  const flush = () => {
    files.push({
      content: lines.length === 0 ? "" : `${lines.join("\n")}\n`,
      name: `${base}-${String(files.length + 1).padStart(3, "0")}.sql`,
      statements: lines.length,
    });
    lines = [];
    bytes = 0;
  };
  for (const statement of statements) {
    assertOneLine(statement);
    if (!statement.endsWith(";")) {
      throw new Error("[migrate-convex] A SQL statement must end with ;");
    }
    const size = byteLength(statement) + 1;
    if (size > FILE_BYTES_MAX) {
      throw new Error(
        `[migrate-convex] A ${base} statement is larger than ${FILE_BYTES_MAX} bytes`
      );
    }
    if (lines.length === FILE_STATEMENTS_MAX || bytes + size > FILE_BYTES_MAX) {
      flush();
    }
    lines.push(statement);
    bytes += size;
  }
  if (lines.length > 0 || files.length === 0) {
    flush();
  }
  return files;
}

export interface ManifestFile {
  readonly bytes: number;
  readonly name: string;
  readonly sha256: string;
  readonly statements: number;
}

/** The SHA-256 of each input file's text, or null when it was not given. */
export interface InputHashes {
  /** The content hash of the export's table files (`hashExport`). */
  readonly export: string;
  readonly muxMap: string | null;
  readonly overrides: string | null;
  readonly workosUsers: string | null;
}

export interface Manifest {
  /** Every SQL file, in the order `apply` runs them. */
  readonly files: readonly (ManifestFile & { readonly group: FileGroup })[];
  readonly inputs: InputHashes;
  /** `--now` as an ISO string. */
  readonly now: string;
  readonly report: { readonly blockers: number; readonly warnings: number };
  /** `reset-imported` (`apply --reset`), in order. */
  readonly reset: readonly ManifestFile[];
  readonly target: Target;
  readonly version: 1;
}

async function describe(file: SqlFile): Promise<ManifestFile> {
  return {
    bytes: byteLength(file.content),
    name: file.name,
    sha256: await sha256Hex(file.content),
    statements: file.statements,
  };
}

export interface EmitInput {
  /** The migrated gestures, whose `gesture_fts` rows are rebuilt last. */
  readonly ftsGestureIds: readonly string[];
  /** The statements of each group (all but `90-fts`, which `ftsGestureIds` makes). */
  readonly groups: Readonly<
    Partial<Record<Exclude<FileGroup, "90-fts">, readonly string[]>>
  >;
  readonly inputs: InputHashes;
  readonly now: Date;
  readonly report: { readonly blockers: number; readonly warnings: number };
  readonly resetKeys: ResetKeys;
  readonly target: Target;
}

export interface Emitted {
  /** Every SQL file (the groups, then reset), with its content. */
  readonly files: readonly SqlFile[];
  readonly manifest: Manifest;
}

/** The SQL files and the manifest of a plan. */
export async function emitPlan(input: EmitInput): Promise<Emitted> {
  const grouped = FILE_GROUPS.flatMap((group) =>
    chunkStatements(
      group,
      group === "90-fts"
        ? ftsRebuildStatements(input.ftsGestureIds)
        : (input.groups[group] ?? [])
    ).map((file) => ({ file, group }))
  );
  const resetFiles = chunkStatements(
    RESET_GROUP,
    resetStatements(input.resetKeys)
  );
  const manifestFiles = await Promise.all(
    grouped.map(async ({ file, group }) => ({
      group,
      ...(await describe(file)),
    }))
  );
  const reset = await Promise.all(resetFiles.map(describe));
  return {
    files: [...grouped.map(({ file }) => file), ...resetFiles],
    manifest: {
      files: manifestFiles,
      inputs: input.inputs,
      now: input.now.toISOString(),
      report: input.report,
      reset,
      target: input.target,
      version: 1,
    },
  };
}

/** `manifest.json`: two-space JSON with a final newline. */
export function renderManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
