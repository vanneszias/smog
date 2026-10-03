/**
 * The logo half of the daily retention purge (ruling 9, J-04). Logos are
 * private R2 objects under `logos/` (ruling 10). One checkout shares its
 * logo key between all its sponsorships, and a re-edit points one of them
 * at a new key and leaves the old object behind, so an object is deleted
 * only when no sponsorship references it:
 *
 * 1. `releaseTerminalLogos`: a key whose every sponsorship ended
 *    (`rejected`, `cancelled`, `expired`) more than 30 days ago is
 *    cleared (`logo_key` NULL); `payment_item.includes_logo` keeps the
 *    fact for the CSV.
 * 2. `orphanLogoSweep`: every `logos/*` object that no sponsorship
 *    references and that was uploaded more than 24 h ago is deleted (an
 *    upload whose checkout never happened, a replaced logo, and the ones
 *    step 1 released). A fresh upload waiting for its checkout is kept.
 */
import { inList, ref, type SponsorshipStatus, sponsorship } from "@smog/db";
import type { Db } from "@smog/db/client";
import { DAY_MS } from "@smog/utils";
import { and, eq, isNotNull, lt, not, sql } from "drizzle-orm";

const LOGO_PREFIX = "logos/";
/** An unreferenced upload younger than this waits for its checkout. */
export const ORPHAN_LOGO_MIN_AGE_MS = DAY_MS;
/** A sponsorship that ended keeps its logo this long. */
export const TERMINAL_LOGO_GRACE_MS = 30 * DAY_MS;
/** The statuses a sponsorship never leaves by itself. */
export const TERMINAL_LOGO_STATUSES = [
  "rejected",
  "cancelled",
  "expired",
] as const satisfies readonly SponsorshipStatus[];

/** Keys per R2 listing page (R2's maximum). */
const LIST_LIMIT = 1000;
/** Listing pages per run; the next day continues. */
const MAX_LIST_PAGES = 20;
/** Keys read per page of terminal sponsorships. */
const RELEASE_PAGE_SIZE = 100;
/** Pages of terminal keys per status per run. */
const MAX_RELEASE_PAGES = 20;

/** The part of the `MEDIA` R2 binding the sweep uses. */
export type LogoBucket = Pick<R2Bucket, "delete" | "list">;

export interface LogoSweepOptions {
  /** Count what would be released or deleted, and change nothing. */
  dryRun?: boolean;
}

/**
 * Whether a sponsorship still needs the key `key` names: one that has
 * not ended, or ended less than 30 days ago.
 */
function stillNeeded(key: ReturnType<typeof ref>, cutoff: Date) {
  const other = "other";
  return sql`EXISTS (SELECT 1 FROM ${sponsorship} AS ${sql.raw(other)} WHERE ${ref(other, sponsorship.logoKey)} = ${key} AND NOT (${inList(ref(other, sponsorship.status), TERMINAL_LOGO_STATUSES)} AND ${ref(other, sponsorship.updatedAt)} < ${cutoff.getTime()}))`;
}

/**
 * Clears `logo_key` on sponsorships that ended more than 30 days ago,
 * one key per statement, when no other sponsorship still needs that key.
 * Returns the number of sponsorships cleared (with `dryRun`, the number
 * that would be). `updated_at` is kept: the row did not change status.
 */
export async function releaseTerminalLogos(
  db: Db,
  now: Date,
  { dryRun = false }: LogoSweepOptions = {}
): Promise<number> {
  const cutoff = new Date(now.getTime() - TERMINAL_LOGO_GRACE_MS);
  let released = 0;
  for (const status of TERMINAL_LOGO_STATUSES) {
    const skip: string[] = [];
    for (let round = 0; round < MAX_RELEASE_PAGES; round += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each page reads what the last one left.
      const rows = await db
        .select({ key: sponsorship.logoKey })
        .from(sponsorship)
        .where(
          and(
            eq(sponsorship.status, status),
            isNotNull(sponsorship.logoKey),
            lt(sponsorship.updatedAt, cutoff),
            not(inList(sponsorship.logoKey, skip))
          )
        )
        .groupBy(sponsorship.logoKey)
        .limit(RELEASE_PAGE_SIZE);
      for (const { key } of rows) {
        if (key) {
          // biome-ignore lint/performance/noAwaitInLoops: one key per statement (spec §8.1), in order.
          released += await releaseKey(db, key, cutoff, dryRun);
          // A dry run changes nothing, and a key still needed stays: both
          // would be read again.
          skip.push(key);
        }
      }
      if (rows.length < RELEASE_PAGE_SIZE) {
        break;
      }
    }
  }
  return released;
}

async function releaseKey(
  db: Db,
  key: string,
  cutoff: Date,
  dryRun: boolean
): Promise<number> {
  const self = ref("sponsorship", sponsorship.logoKey);
  const where = and(
    eq(sponsorship.logoKey, key),
    not(stillNeeded(self, cutoff))
  );
  try {
    if (dryRun) {
      const [row] = await db
        .select({ n: sql<number>`count(*)` })
        .from(sponsorship)
        .where(where);
      return row?.n ?? 0;
    }
    const result = await db
      .update(sponsorship)
      .set({ logoKey: null, updatedAt: sql`${sponsorship.updatedAt}` })
      .where(where)
      .run();
    return result.meta.changes;
  } catch (error) {
    console.error(`[sponsorships] Failed to release the logo ${key}:`, error);
    return 0;
  }
}

/**
 * Deletes every `logos/*` object that no sponsorship references and that
 * was uploaded more than 24 h ago (R2's own `uploaded`, which the
 * presigned PUT sets too). Returns the number deleted (with `dryRun`, the
 * number that would be). One D1 read per listing page (one `json_each`
 * parameter for its keys) and one R2 delete per page.
 */
export async function orphanLogoSweep(
  db: Db,
  media: LogoBucket,
  now: Date,
  { dryRun = false }: LogoSweepOptions = {}
): Promise<number> {
  const uploadedBefore = now.getTime() - ORPHAN_LOGO_MIN_AGE_MS;
  let deleted = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: listing pages follow the cursor.
    const listed = await media.list({
      limit: LIST_LIMIT,
      prefix: LOGO_PREFIX,
      ...(cursor ? { cursor } : {}),
    });
    const old = listed.objects
      .filter((object) => object.uploaded.getTime() < uploadedBefore)
      .map((object) => object.key);
    if (old.length > 0) {
      const referenced = await db
        .select({ key: sponsorship.logoKey })
        .from(sponsorship)
        .where(inList(sponsorship.logoKey, old));
      const used = new Set(referenced.map((row) => row.key));
      const orphans = old.filter((key) => !used.has(key));
      if (orphans.length > 0 && !dryRun) {
        await media.delete(orphans);
      }
      deleted += orphans.length;
    }
    if (!listed.truncated) {
      break;
    }
    ({ cursor } = listed);
  }
  return deleted;
}
