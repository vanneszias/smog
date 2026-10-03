/**
 * `sponsorships.availability` (S-02, S-26, L-17): one D1 read for up to
 * 100 gestures. The ids are one `json_each` parameter; each is joined to
 * its published gesture by primary key and to its blocking sponsorship
 * through the partial unique index (at most one per gesture). It only
 * informs the wizard: the checkout's insert against that index is what
 * decides (ruling 5).
 */
import {
  BLOCKING_SPONSORSHIP_STATUSES,
  gesture,
  jsonList,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { AvailabilityItem } from "../schema/availability";

/**
 * `status IN (<the blocking statuses>)` written out as constants, so
 * SQLite can match the partial index `sponsorship_gesture_blocking_uq`
 * (a bound list could not prove its predicate).
 */
const BLOCKING_SQL = sql.raw(
  `(${BLOCKING_SPONSORSHIP_STATUSES.map((status) => `'${status}'`).join(", ")})`
);

/** The one read behind `getAvailability` (exported for its plan test). */
export function availabilityQuery(db: Db, gestureIds: readonly string[]) {
  return db
    .select({
      displayName: sponsorship.displayName,
      endsAt: sponsorship.endsAt,
      gestureId: sql<string>`${sql.raw("ids")}.${sql.identifier("value")}`,
      publishedId: gesture.id,
      status: sponsorship.status,
    })
    .from(sql`json_each(${jsonList(gestureIds)}) AS ${sql.raw("ids")}`)
    .leftJoin(
      gesture,
      and(
        eq(gesture.id, sql`${sql.raw("ids")}.${sql.identifier("value")}`),
        isNotNull(gesture.publishedAt)
      )
    )
    .leftJoin(
      sponsorship,
      and(
        eq(sponsorship.gestureId, gesture.id),
        sql`${sponsorship.status} IN ${BLOCKING_SQL}`
      )
    );
}

/**
 * Each distinct id asked, in order: `available`, `pending` (any blocking
 * status but `live`/`expiring`, bug 17), `sponsored` (with the display
 * name and the end) or `unavailable` (unknown or unpublished, bug 39).
 */
export async function getAvailability(
  db: Db,
  gestureIds: readonly string[]
): Promise<AvailabilityItem[]> {
  const ids = [...new Set(gestureIds)];
  if (ids.length === 0) {
    return [];
  }
  const rows = await availabilityQuery(db, ids);
  // In the order asked (the read has no ORDER BY, so no temp B-tree).
  const byId = new Map(rows.map((row) => [row.gestureId, row]));
  return ids.map((id): AvailabilityItem => {
    const row = byId.get(id) ?? {
      displayName: null,
      endsAt: null,
      gestureId: id,
      publishedId: null,
      status: null,
    };
    if (row.publishedId === null) {
      return { gestureId: row.gestureId, state: "unavailable" };
    }
    if (row.status === null) {
      return { gestureId: row.gestureId, state: "available" };
    }
    if (row.status === "live" || row.status === "expiring") {
      return {
        gestureId: row.gestureId,
        state: "sponsored",
        ...(row.displayName === null ? {} : { sponsorName: row.displayName }),
        ...(row.endsAt === null ? {} : { endsAt: row.endsAt.getTime() }),
      };
    }
    return { gestureId: row.gestureId, state: "pending" };
  });
}
