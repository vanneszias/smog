/**
 * The D1 half of the daily retention purge (phase 6 ruling 9, J-04; the
 * privacy text's promises). `runRetentionPurge` in `@smog/sponsorships`
 * runs these and adds the R2 logo sweep. Each purge deletes in chunks,
 * `WHERE rowid IN (SELECT rowid … LIMIT 500)`, at most 20 chunks per table
 * per run; whatever is left waits for the next day. Each chunk is its own
 * statement, so a crash half way loses nothing and a re-run continues.
 */
import { DAY_MS } from "@smog/utils";
import { or, type SQL, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "./client";
import { auditLog } from "./schema/account";
import { session, verification } from "./schema/auth";
import { sponsorshipToken } from "./schema/sponsorships";

/** Audit entries are kept 3 × 365 days (spec §5.6). */
export const AUDIT_RETENTION_MS = 3 * 365 * DAY_MS;
/** A used or expired sponsorship token is kept 30 days, for support. */
export const SPONSORSHIP_TOKEN_GRACE_MS = 30 * DAY_MS;
/** Rows per chunk. */
export const RETENTION_CHUNK_SIZE = 500;
/** Chunks per purge per run. */
export const RETENTION_MAX_CHUNKS = 20;

export type RetentionTable =
  | "audit_log"
  | "session"
  | "verification"
  | "sponsorship_token";

function chunk(db: Db, table: SQLiteTable, where: SQL) {
  return db
    .delete(table)
    .where(
      sql`rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${sql.raw(String(RETENTION_CHUNK_SIZE))})`
    );
}

export interface RetentionPurge {
  /** The table the purge deletes from. */
  from: SQLiteTable;
  /** Whether the chunk read seeks an index (a query-plan test checks it). */
  indexed: boolean;
  /** One chunk: deletes at most `RETENTION_CHUNK_SIZE` rows. */
  statement: (db: Db, now: Date) => ReturnType<typeof chunk>;
  table: RetentionTable;
  /** What the purge deletes, for the logs. */
  what: string;
  /** The rows the purge deletes at `now`. */
  where: (now: Date) => SQL;
}

/** Before `now − ms`, as the integer milliseconds the columns hold. */
function before(now: Date, ms: number): number {
  return now.getTime() - ms;
}

function definePurge(input: Omit<RetentionPurge, "statement">): RetentionPurge {
  return {
    ...input,
    statement: (db, now) => chunk(db, input.from, input.where(now)),
  };
}

/**
 * Every D1 purge, in order. Each chunk read seeks an index
 * (`audit_log_created_at_idx`, migration 0008's `session_expires_at_idx`
 * and `verification_expires_at_idx`, `sponsorship_token_expires_at_idx`),
 * except the used-token purge: `used_at` has no index, and the table holds
 * a few rows per sponsorship, so that scan stays small.
 */
export const RETENTION_PURGES: readonly RetentionPurge[] = [
  definePurge({
    from: auditLog,
    indexed: true,
    table: "audit_log",
    what: "audit entries older than 3 × 365 days",
    where: (now) =>
      sql`${auditLog.createdAt} < ${before(now, AUDIT_RETENTION_MS)}`,
  }),
  definePurge({
    from: session,
    indexed: true,
    table: "session",
    what: "expired sessions",
    where: (now) => sql`${session.expiresAt} < ${now.getTime()}`,
  }),
  definePurge({
    from: verification,
    indexed: true,
    table: "verification",
    what: "expired verifications",
    where: (now) => sql`${verification.expiresAt} < ${now.getTime()}`,
  }),
  definePurge({
    from: sponsorshipToken,
    indexed: true,
    table: "sponsorship_token",
    what: "sponsorship tokens expired more than 30 days ago",
    where: (now) =>
      sql`${sponsorshipToken.expiresAt} < ${before(now, SPONSORSHIP_TOKEN_GRACE_MS)}`,
  }),
  definePurge({
    from: sponsorshipToken,
    indexed: false,
    table: "sponsorship_token",
    what: "sponsorship tokens used more than 30 days ago",
    where: (now) =>
      sql`${sponsorshipToken.usedAt} < ${before(now, SPONSORSHIP_TOKEN_GRACE_MS)}`,
  }),
];

function emptyCounts(): Record<RetentionTable, number> {
  return { audit_log: 0, session: 0, sponsorship_token: 0, verification: 0 };
}

/**
 * A dry run: how many rows each table would lose at `now`, without the
 * chunk cap and without deleting anything. A row that two purges match (a
 * token both used and expired long ago) counts once.
 */
async function countPurgeable(
  db: Db,
  now: Date
): Promise<Record<RetentionTable, number>> {
  const counts = emptyCounts();
  for (const table of Object.keys(counts) as RetentionTable[]) {
    const purges = RETENTION_PURGES.filter((p) => p.table === table);
    const [first] = purges;
    if (first) {
      // biome-ignore lint/performance/noAwaitInLoops: four small counts, one per table.
      const [row] = await db
        .select({ n: sql<number>`count(*)` })
        .from(first.from)
        .where(or(...purges.map((p) => p.where(now))));
      counts[table] = row?.n ?? 0;
    }
  }
  return counts;
}

export interface RetentionOptions {
  /** Count what would be deleted and delete nothing (tests and ops). */
  dryRun?: boolean;
  /** At most this many chunks per purge (default `RETENTION_MAX_CHUNKS`). */
  maxChunks?: number;
}

/**
 * Runs every D1 purge and returns the rows deleted per table (with
 * `dryRun`, the rows it would delete, and nothing is deleted). A purge
 * that fails is logged and the others still run; the error is rethrown at
 * the end, so the cron reports the failure and the next day continues.
 */
export async function runRetentionPurges(
  db: Db,
  now: Date,
  { dryRun = false, maxChunks = RETENTION_MAX_CHUNKS }: RetentionOptions = {}
): Promise<Record<RetentionTable, number>> {
  if (dryRun) {
    return await countPurgeable(db, now);
  }
  const counts = emptyCounts();
  let failure: unknown;
  for (const purge of RETENTION_PURGES) {
    try {
      for (let round = 0; round < maxChunks; round += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: chunks run one after another; each one decides whether the next is needed.
        const result = await purge.statement(db, now).run();
        const deleted = result.meta.changes;
        counts[purge.table] += deleted;
        if (deleted < RETENTION_CHUNK_SIZE) {
          break;
        }
      }
    } catch (error) {
      console.error(`[db] Failed to purge ${purge.what}:`, error);
      failure ??= error;
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
  return counts;
}
