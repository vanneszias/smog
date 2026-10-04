/**
 * When a rejected sponsorship was rejected (phase 8 ruling 13), in SQL, for
 * the bounded request for changes (`requestChangesStatements`) and the
 * daily purge of rejected videos (`runRetentionPurge`).
 *
 * - `rejectedEventAtSql`: the latest `rejected` event's `created_at`
 *   (epoch ms), or NULL. A seek on `sponsorship_event_sponsorship_created_idx`.
 *   The purge reads only this: a migrated row without a `rejected` event
 *   is never purged (controller ruling; the runbook lists those assets for
 *   the owner).
 * - `rejectedAtSql`: that, else a migrated row's `legacy` event's
 *   `data.legacy.reviewedAt` (Convex's epoch ms as a number or a string
 *   of digits, or an ISO 8601 string),
 *   else NULL: no bound applies.
 */
import {
  failWhen,
  ref,
  type Statement,
  sponsorshipEvent,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { type SQL, sql } from "drizzle-orm";
import { REJECTED_VIDEO_RETENTION_MS } from "../schema/retention";

/** The request for changes lost the race against the retention bound. */
const REJECTED_TOO_LONG_AGO_GUARD = "sponsorship-rejected-too-long-ago";

const EVENT = sql.raw("ev");

/** The latest `rejected` event of the sponsorship `id` names, epoch ms or NULL. */
export function rejectedEventAtSql(id: SQL | string): SQL {
  return sql`(SELECT max(${ref("ev", sponsorshipEvent.createdAt)}) FROM ${sponsorshipEvent} AS ${EVENT} WHERE ${ref("ev", sponsorshipEvent.sponsorshipId)} = ${id} AND ${ref("ev", sponsorshipEvent.type)} = 'rejected')`;
}

/** `data.legacy.reviewedAt` of the sponsorship's latest `legacy` event, epoch ms or NULL. */
function legacyReviewedAtSql(id: SQL | string): SQL {
  const data = ref("ev", sponsorshipEvent.data);
  const path = "$.legacy.reviewedAt";
  return sql`(SELECT CASE json_type(${data}, ${path}) WHEN 'integer' THEN json_extract(${data}, ${path}) WHEN 'real' THEN CAST(json_extract(${data}, ${path}) AS INTEGER) WHEN 'text' THEN CASE WHEN json_extract(${data}, ${path}) GLOB '[0-9]*' AND json_extract(${data}, ${path}) NOT GLOB '*[^0-9]*' THEN CAST(json_extract(${data}, ${path}) AS INTEGER) ELSE CAST(unixepoch(json_extract(${data}, ${path}), 'subsec') * 1000 AS INTEGER) END END FROM ${sponsorshipEvent} AS ${EVENT} WHERE ${ref("ev", sponsorshipEvent.sponsorshipId)} = ${id} AND ${ref("ev", sponsorshipEvent.type)} = 'legacy' ORDER BY ${ref("ev", sponsorshipEvent.createdAt)} DESC LIMIT 1)`;
}

/** When the sponsorship was rejected (ruling 13's order), epoch ms or NULL. */
function rejectedAtSql(id: SQL | string): SQL {
  return sql`coalesce(${rejectedEventAtSql(id)}, ${legacyReviewedAtSql(id)})`;
}

/** The rejections at or before this moment are past the bound. */
export function rejectedVideoCutoff(now: Date): number {
  return now.getTime() - REJECTED_VIDEO_RETENTION_MS;
}

/** When the sponsorship was rejected, epoch ms, or `null` (no bound). */
export async function readRejectedAt(
  db: Db,
  sponsorshipId: string
): Promise<number | null> {
  const [row] = await db
    .select({ at: sql<number | null>`${rejectedAtSql(sponsorshipId)}` })
    .from(sql`(SELECT 1)`);
  const at = row?.at;
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

/**
 * The in-batch bound of a request for changes from `rejected`: the batch
 * fails when the rejection is `REJECTED_VIDEO_RETENTION_DAYS` old or more
 * at `now`. Without a known rejection time the bound does not apply.
 */
export function rejectedBoundGuard(
  db: Db,
  sponsorshipId: string,
  now: Date
): Statement {
  return failWhen(
    db,
    REJECTED_TOO_LONG_AGO_GUARD,
    sql`${rejectedAtSql(sponsorshipId)} <= ${rejectedVideoCutoff(now)}`
  );
}

/** Whether a batch failed on `rejectedBoundGuard`. */
export function isRejectedTooLongAgo(error: unknown): boolean {
  return toGuardFailure(error)?.guard === REJECTED_TOO_LONG_AGO_GUARD;
}
