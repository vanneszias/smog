/**
 * Favorites of signed-in users (the `favorite` table, spec §5.2). Only
 * published gestures count: adding needs one (`GestureNotFoundError`),
 * removing always succeeds, and reads skip favorites whose gesture is
 * unpublished (the row stays, so republishing brings it back). Reads are
 * bounded and served by `favorite_user_created_idx`.
 */
import { favorite, gesture } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { GestureSummary } from "@smog/gestures/schema";
import { decodeCursorAs, encodeCursor } from "@smog/utils";
import { and, desc, eq, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { FAVORITE_IDS_MAX, type FavoritesPage } from "../schema";

/**
 * Published gesture summaries by id, in the order given, unknown ids
 * dropped: `@smog/gestures/server` `findGesturesByIds`, which `@smog/api`
 * injects (a feature never imports another feature's server).
 */
export type FindGestureSummaries = (
  db: Db,
  ids: readonly string[]
) => Promise<GestureSummary[]>;

export interface FavoritesDeps {
  db: Db;
  findSummaries: FindGestureSummaries;
}

/** The gesture is unknown or unpublished. */
export class GestureNotFoundError extends Error {
  constructor() {
    super("[favorites] Gesture not found");
    this.name = "GestureNotFoundError";
  }
}

/** The last favorite of a page: the keyset position the next one starts after. */
interface Position {
  createdAt: Date;
  gestureId: string;
}

/** `InvalidCursorError` (`@smog/utils`) for a cursor `list` did not issue. */
function parseCursor(cursor: string): Position {
  return decodeCursorAs(cursor, (key) => {
    const [createdAt, gestureId] = key;
    return key.length === 2 &&
      typeof createdAt === "number" &&
      Number.isSafeInteger(createdAt) &&
      typeof gestureId === "string"
      ? { createdAt: new Date(createdAt), gestureId }
      : null;
  });
}

/**
 * After `position` in the newest-first order (`created_at DESC,
 * gesture_id DESC`), as a range on the first key.
 */
function after(position: Position) {
  return and(
    lte(favorite.createdAt, position.createdAt),
    or(
      lt(favorite.createdAt, position.createdAt),
      lt(favorite.gestureId, position.gestureId)
    )
  );
}

const newestFirst = [desc(favorite.createdAt), desc(favorite.gestureId)];

/**
 * The user's favorites whose gesture is published (join + filter), newest
 * first; `favorite_user_created_idx` serves it.
 */
export function favoritesOf(db: Db, userId: string, position?: Position) {
  return db
    .select({ createdAt: favorite.createdAt, gestureId: favorite.gestureId })
    .from(favorite)
    .innerJoin(gesture, eq(gesture.id, favorite.gestureId))
    .where(
      and(
        eq(favorite.userId, userId),
        isNotNull(gesture.publishedAt),
        position ? after(position) : undefined
      )
    )
    .orderBy(...newestFirst);
}

/** The published gesture `gestureId`, as a select (empty when not). */
function publishedGesture(db: Db, gestureId: string) {
  return db
    .select({ id: gesture.id })
    .from(gesture)
    .where(and(eq(gesture.id, gestureId), isNotNull(gesture.publishedAt)));
}

/** Favorite gesture ids, newest first (at most `FAVORITE_IDS_MAX`). */
export async function listFavoriteIds(
  db: Db,
  userId: string
): Promise<string[]> {
  try {
    const rows = await favoritesOf(db, userId).limit(FAVORITE_IDS_MAX);
    return rows.map((row) => row.gestureId);
  } catch (error) {
    console.error("[favorites] Failed to list favorite ids:", error);
    throw error;
  }
}

/**
 * A page of favorite gestures, newest first (`InvalidCursorError` for a bad
 * cursor). Two D1 queries: the page of ids, then their summaries.
 */
export async function listFavorites(
  { db, findSummaries }: FavoritesDeps,
  userId: string,
  input: { cursor?: string | undefined; limit: number }
): Promise<FavoritesPage> {
  const position =
    input.cursor === undefined ? undefined : parseCursor(input.cursor);
  try {
    const rows = await favoritesOf(db, userId, position).limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    const items = await findSummaries(
      db,
      page.map((row) => row.gestureId)
    );
    return {
      items,
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor([last.createdAt.getTime(), last.gestureId])
          : null,
    };
  } catch (error) {
    console.error("[favorites] Failed to list favorites:", error);
    throw error;
  }
}

/**
 * Makes the published ones of `gestureIds` favorites (unknown and
 * unpublished ids are skipped; an existing favorite keeps its row). The
 * given order is oldest first: `created_at` ends at `at`, one millisecond
 * apart. Returns the inserted gesture ids; a statement, not run, so a
 * caller (the guest import) can put it in its own batch.
 */
export function insertFavoritesStmt(
  db: Db,
  userId: string,
  gestureIds: readonly string[],
  at: Date
) {
  const last = at.getTime();
  const count = gestureIds.length;
  // Columns in table order: user_id, gesture_id, created_at.
  return db
    .insert(favorite)
    .select(
      sql`SELECT ${userId}, j.value, ${last} - (${count} - 1 - j.key) FROM json_each(${JSON.stringify(gestureIds)}) AS j WHERE EXISTS (SELECT 1 FROM ${gesture} AS g WHERE g.${sql.identifier(gesture.id.name)} = j.value AND g.${sql.identifier(gesture.publishedAt.name)} IS NOT NULL)`
    )
    .onConflictDoNothing()
    .returning({ gestureId: favorite.gestureId });
}

/**
 * Makes a published gesture a favorite; a second add keeps the first row.
 * One D1 batch (a transaction): the check and the guarded insert.
 */
export async function addFavorite(
  db: Db,
  userId: string,
  gestureId: string,
  now: Date = new Date()
): Promise<void> {
  let found: { id: string }[];
  try {
    [found] = await db.batch([
      publishedGesture(db, gestureId),
      insertFavoritesStmt(db, userId, [gestureId], now),
    ]);
  } catch (error) {
    console.error("[favorites] Failed to add a favorite:", error);
    throw error;
  }
  if (found.length === 0) {
    throw new GestureNotFoundError();
  }
}

/** Deletes the favorite row; whether there was one. */
async function deleteFavorite(
  db: Db,
  userId: string,
  gestureId: string
): Promise<boolean> {
  const deleted = await db
    .delete(favorite)
    .where(and(eq(favorite.userId, userId), eq(favorite.gestureId, gestureId)))
    .returning({ gestureId: favorite.gestureId });
  return deleted.length > 0;
}

/**
 * Removes the favorite, whatever the gesture's state (unknown, unpublished
 * or published): idempotent, and it always succeeds, so a stale heart can
 * always be cleared.
 */
export async function removeFavorite(
  db: Db,
  userId: string,
  gestureId: string
): Promise<void> {
  try {
    await deleteFavorite(db, userId, gestureId);
  } catch (error) {
    console.error("[favorites] Failed to remove a favorite:", error);
    throw error;
  }
}

/**
 * Removes the favorite when present, else adds it (`GestureNotFoundError`
 * for an unknown or unpublished gesture); the new state. Not atomic: two
 * concurrent toggles of one favorite can both add. The hooks send `add` /
 * `remove` instead, which are idempotent.
 */
export async function toggleFavorite(
  db: Db,
  userId: string,
  gestureId: string,
  now: Date = new Date()
): Promise<boolean> {
  let removed: boolean;
  try {
    removed = await deleteFavorite(db, userId, gestureId);
  } catch (error) {
    console.error("[favorites] Failed to toggle a favorite:", error);
    throw error;
  }
  if (removed) {
    return false;
  }
  await addFavorite(db, userId, gestureId, now);
  return true;
}
