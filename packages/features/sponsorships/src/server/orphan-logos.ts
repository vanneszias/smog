/**
 * The logo half of the daily retention purge (ruling 9, J-04, amended by
 * fix round 1, I-1). Logos are private R2 objects under `logos/` (ruling
 * 10). One checkout shares its logo key between all its sponsorships, and
 * a re-edit points one of them at a new key and leaves the old object
 * behind, so an object is deleted only when no sponsorship references it:
 *
 * 1. `releaseTerminalLogos`: a key is cleared (`logo_key` NULL) only when
 *    every sponsorship using it ended more than 30 days ago **and** can no
 *    longer use a logo that was paid for: it is `expired` (final), or it
 *    is `rejected`/`cancelled` and none of its payments with
 *    `includes_logo` took money (each is `canceled`, `expired` or `failed`
 *    with no `paid_at`). A `rejected` sponsorship can come back through a
 *    request for changes, and a `cancelled` one through a late payment, so
 *    a paid logo stays with them. `payment_item.includes_logo` keeps the
 *    fact for the CSV, and a re-edit takes a new logo when the key is gone.
 * 2. `orphanLogoSweep`: every `logos/*` object that no sponsorship
 *    references and that was uploaded more than 24 h ago is deleted (an
 *    upload whose checkout never happened, a replaced logo, and the ones
 *    step 1 released). A fresh upload waiting for its checkout is kept.
 *    The listing resumes from a KV cursor, so every object is reached
 *    however many there are (20 pages a day).
 */
import {
  inList,
  payment,
  paymentItem,
  ref,
  type SponsorshipStatus,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { DAY_MS } from "@smog/utils";
import { and, eq, isNotNull, lt, not, type SQL, sql } from "drizzle-orm";

const LOGO_PREFIX = "logos/";
/** An unreferenced upload younger than this waits for its checkout. */
export const ORPHAN_LOGO_MIN_AGE_MS = DAY_MS;
/** A sponsorship that ended keeps its logo this long. */
export const TERMINAL_LOGO_GRACE_MS = 30 * DAY_MS;
/** The statuses a sponsorship rests in once it ended (it may come back from the first two). */
export const ENDED_STATUSES = [
  "rejected",
  "cancelled",
  "expired",
] as const satisfies readonly SponsorshipStatus[];
/** Payment statuses in which no money was taken (with no `paid_at`). */
const UNPAID_PAYMENT_STATUSES = ["canceled", "expired", "failed"] as const;
/** The KV key of the orphan listing's cursor between runs. */
export const LOGO_CURSOR_KEY = "retention:logo-cursor";

/** Keys per R2 listing page (R2's maximum). */
const LIST_LIMIT = 1000;
/** Listing pages per run; the KV cursor continues the next day. */
const MAX_LIST_PAGES = 20;
/** Keys read per page of ended sponsorships. */
const RELEASE_PAGE_SIZE = 100;
/** Pages of ended keys per status per run. */
const MAX_RELEASE_PAGES = 20;

/** The part of the `MEDIA` R2 binding the sweep uses. */
export type LogoBucket = Pick<R2Bucket, "delete" | "list">;
/** The part of the `KV` binding that keeps the listing cursor. */
export type LogoCursorStore = Pick<KVNamespace, "delete" | "get" | "put">;

/**
 * Whether the sponsorship row named `alias` may lose its logo at
 * `cutoff` (see the module comment, step 1).
 */
function releasable(alias: string, cutoff: Date): SQL {
  const id = ref(alias, sponsorship.id);
  const status = ref(alias, sponsorship.status);
  const paidLogo = sql`EXISTS (SELECT 1 FROM ${paymentItem} AS ${sql.raw("pi")} INNER JOIN ${payment} AS ${sql.raw("p")} ON ${ref("p", payment.id)} = ${ref("pi", paymentItem.paymentId)} WHERE ${ref("pi", paymentItem.sponsorshipId)} = ${id} AND ${ref("pi", paymentItem.includesLogo)} = 1 AND NOT (${inList(ref("p", payment.status), UNPAID_PAYMENT_STATUSES)} AND ${ref("p", payment.paidAt)} IS NULL))`;
  return sql`(${ref(alias, sponsorship.updatedAt)} < ${cutoff.getTime()} AND (${status} = 'expired' OR (${inList(status, ["rejected", "cancelled"])} AND NOT ${paidLogo})))`;
}

/** Whether a sponsorship that may not lose its logo uses the key `key` names. */
function stillNeeded(key: SQL, cutoff: Date): SQL {
  const other = "other";
  return sql`EXISTS (SELECT 1 FROM ${sponsorship} AS ${sql.raw(other)} WHERE ${ref(other, sponsorship.logoKey)} = ${key} AND NOT ${releasable(other, cutoff)})`;
}

export interface LogoSweepOptions {
  /** Count what would be released or deleted, and change nothing. */
  dryRun?: boolean;
}

/**
 * Clears `logo_key` on the sponsorships step 1 allows, one key per
 * statement whose `NOT EXISTS` guard checks again that no sponsorship
 * still needs it. Returns how many sponsorships were cleared and their
 * keys (with `dryRun`, the ones that would be). `updated_at` is kept: the
 * row did not change status.
 */
export async function releaseTerminalLogos(
  db: Db,
  now: Date,
  { dryRun = false }: LogoSweepOptions = {}
): Promise<{ count: number; keys: Set<string> }> {
  const cutoff = new Date(now.getTime() - TERMINAL_LOGO_GRACE_MS);
  const self = ref("sponsorship", sponsorship.logoKey);
  let count = 0;
  const keys = new Set<string>();
  for (const status of ENDED_STATUSES) {
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
            releasable("sponsorship", cutoff),
            not(stillNeeded(self, cutoff)),
            not(inList(sponsorship.logoKey, skip))
          )
        )
        .groupBy(sponsorship.logoKey)
        .limit(RELEASE_PAGE_SIZE);
      for (const { key } of rows) {
        if (key) {
          // biome-ignore lint/performance/noAwaitInLoops: one key per statement (spec §8.1), in order.
          const cleared = await releaseKey(db, key, cutoff, dryRun);
          count += cleared;
          if (cleared > 0) {
            keys.add(key);
          }
          // A dry run changes nothing: the key would be read again.
          skip.push(key);
        }
      }
      if (rows.length < RELEASE_PAGE_SIZE) {
        break;
      }
    }
  }
  return { count, keys };
}

async function releaseKey(
  db: Db,
  key: string,
  cutoff: Date,
  dryRun: boolean
): Promise<number> {
  const where = and(
    eq(sponsorship.logoKey, key),
    not(stillNeeded(ref("sponsorship", sponsorship.logoKey), cutoff))
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

export interface OrphanSweepOptions extends LogoSweepOptions {
  /** Where the listing resumes; without it every run starts at the top. */
  kv?: LogoCursorStore | undefined;
  /** Listing pages this run (default 20; tests use fewer). */
  maxPages?: number;
  /** Keys per listing page (default 1000, R2's maximum; tests use fewer). */
  pageSize?: number;
  /** Keys step 1 released (or would release, in a dry run): unreferenced. */
  released?: ReadonlySet<string>;
}

async function readCursor(
  kv: LogoCursorStore | undefined
): Promise<string | undefined> {
  try {
    return (await kv?.get(LOGO_CURSOR_KEY)) ?? undefined;
  } catch (error) {
    console.error("[sponsorships] Failed to read the logo cursor:", error);
  }
}

async function saveCursor(
  kv: LogoCursorStore | undefined,
  cursor: string | undefined
): Promise<void> {
  try {
    if (cursor) {
      await kv?.put(LOGO_CURSOR_KEY, cursor);
    } else {
      await kv?.delete(LOGO_CURSOR_KEY);
    }
  } catch (error) {
    console.error("[sponsorships] Failed to save the logo cursor:", error);
  }
}

/** One listing page, from `cursor`; a cursor R2 no longer takes restarts at the top. */
async function listPage(
  media: LogoBucket,
  cursor: string | undefined,
  limit: number
) {
  const options = { limit, prefix: LOGO_PREFIX };
  if (!cursor) {
    return await media.list(options);
  }
  try {
    return await media.list({ ...options, cursor });
  } catch (error) {
    console.warn(
      "[sponsorships] The logo cursor was refused; listing from the top:",
      error
    );
    return await media.list(options);
  }
}

/**
 * Deletes every `logos/*` object that no sponsorship references and that
 * was uploaded more than 24 h ago (R2's own `uploaded`, which the
 * presigned PUT sets too). Returns the number deleted (with `dryRun`, the
 * number that would be, and the cursor is left alone). One D1 read per
 * listing page (one `json_each` parameter for its keys) and one R2 delete
 * per page. At most 20 pages a run; the KV cursor continues from there
 * the next day, and is cleared when the listing ends.
 */
export async function orphanLogoSweep(
  db: Db,
  media: LogoBucket,
  now: Date,
  {
    dryRun = false,
    kv,
    maxPages = MAX_LIST_PAGES,
    pageSize = LIST_LIMIT,
    released = new Set(),
  }: OrphanSweepOptions = {}
): Promise<number> {
  const uploadedBefore = now.getTime() - ORPHAN_LOGO_MIN_AGE_MS;
  let deleted = 0;
  let cursor = await readCursor(kv);
  for (let page = 0; page < maxPages; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: listing pages follow the cursor.
    const listed = await listPage(media, cursor, pageSize);
    const old = listed.objects
      .filter((object) => object.uploaded.getTime() < uploadedBefore)
      .map((object) => object.key);
    if (old.length > 0) {
      const referenced = await db
        .select({ key: sponsorship.logoKey })
        .from(sponsorship)
        .where(inList(sponsorship.logoKey, old));
      const used = new Set(
        referenced
          .map((row) => row.key)
          .filter((key) => key !== null && !released.has(key))
      );
      const orphans = old.filter((key) => !used.has(key));
      if (orphans.length > 0 && !dryRun) {
        await media.delete(orphans);
      }
      deleted += orphans.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
    if (!cursor) {
      break;
    }
  }
  if (!dryRun) {
    await saveCursor(kv, cursor);
  }
  return deleted;
}
