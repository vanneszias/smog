import { rebuildGestureFtsSql } from "@smog/db";
import type { Db } from "@smog/db/client";

/**
 * The `gesture_fts` rebuild for one gesture as batch items. Put them after
 * the writes in the same `db.batch([...writes, ...reindexGestureStatements(db, id)])`
 * (spec §5.2): they read the tables, so they index what the batch wrote.
 */
export function reindexGestureStatements(db: Db, gestureId: string) {
  const [remove, insert] = rebuildGestureFtsSql(gestureId);
  return [db.run(remove), db.run(insert)] as const;
}

/**
 * Rebuilds one gesture's `gesture_fts` row from its name, keywords,
 * published category names and description (a deleted gesture loses it).
 * Admin (phase 5) batches `reindexGestureStatements` with its writes instead.
 */
export async function reindexGesture(db: Db, gestureId: string): Promise<void> {
  try {
    await db.batch(reindexGestureStatements(db, gestureId));
  } catch (error) {
    console.error(`[gestures] Failed to reindex gesture ${gestureId}:`, error);
    throw error;
  }
}
