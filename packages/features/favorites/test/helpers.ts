import { env } from "cloudflare:workers";
import { gesture } from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, inArray, isNotNull } from "drizzle-orm";
import type { FindGestureSummaries } from "../src/server";

/**
 * Stands in for `@smog/gestures/server` `findGesturesByIds` (which
 * `@smog/api` injects; a feature cannot import another feature's server):
 * published gestures, in the order asked, without categories.
 */
export const findSummaries: FindGestureSummaries = async (
  db: Db,
  ids: readonly string[]
) => {
  const rows = await db
    .select({
      id: gesture.id,
      name: gesture.name,
      playbackId: gesture.playbackId,
      slug: gesture.slug,
    })
    .from(gesture)
    .where(and(isNotNull(gesture.publishedAt), inArray(gesture.id, [...ids])));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ ...row, categories: [] }] : [];
  });
};

/** Empties the tables these tests write (storage is shared within a file). */
export async function resetTables(): Promise<void> {
  await env.DB.batch(
    ["DELETE FROM favorite", "DELETE FROM gesture", "DELETE FROM user"].map(
      (statement) => env.DB.prepare(statement)
    )
  );
}
