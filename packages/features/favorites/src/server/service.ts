/**
 * Favorites of signed-in users (the `favorite` table, spec §5.2). Only
 * published gestures count: writes need one (`GestureNotFoundError`), and
 * reads skip favorites whose gesture is unpublished (the row stays, so
 * republishing brings it back). Reads are bounded and served by the
 * `(user_id, gesture_id)` primary key.
 */
import { favorite, gesture } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { GestureSummary } from "@smog/gestures/schema";
import { decodeCursor, encodeCursor } from "@smog/utils";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
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

/** A `cursor` that `list` did not issue. */
export class InvalidCursorError extends Error {
  constructor() {
    super("[favorites] Invalid list cursor");
    this.name = "InvalidCursorError";
  }
}

/** The last favorite of a page: the keyset position the next one starts after. */
interface Position {
  createdAt: Date;
  gestureId: string;
}

function parseCursor(cursor: string): Position {
  const key = decodeCursor(cursor);
  const [createdAt, gestureId] = key ?? [];
  if (
    key?.length !== 2 ||
    typeof createdAt !== "number" ||
    !Number.isSafeInteger(createdAt) ||
    typeof gestureId !== "string"
  ) {
    throw new InvalidCursorError();
  }
  return { createdAt: new Date(createdAt), gestureId };
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

/** The user's favorites whose gesture is published (join + filter). */
function favoritesOf(db: Db, userId: string, position?: Position) {
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
      db
        .insert(favorite)
        .select(
          db
            // biome-ignore assist/source/useSortedKeys: insert … select needs the table's column order.
            .select({
              userId: sql<string>`${userId}`.as("user_id"),
              gestureId: gesture.id,
              createdAt: sql<Date>`${now.getTime()}`.as("created_at"),
            })
            .from(gesture)
            .where(
              and(eq(gesture.id, gestureId), isNotNull(gesture.publishedAt))
            )
        )
        .onConflictDoNothing(),
    ]);
  } catch (error) {
    console.error("[favorites] Failed to add a favorite:", error);
    throw error;
  }
  if (found.length === 0) {
    throw new GestureNotFoundError();
  }
}

/**
 * Removes the favorite of a published gesture (a no-op when it is not
 * one). One D1 batch: the check and the guarded delete.
 */
export async function removeFavorite(
  db: Db,
  userId: string,
  gestureId: string
): Promise<void> {
  let found: { id: string }[];
  try {
    [found] = await db.batch([
      publishedGesture(db, gestureId),
      db
        .delete(favorite)
        .where(
          and(
            eq(favorite.userId, userId),
            eq(favorite.gestureId, gestureId),
            inArray(favorite.gestureId, publishedGesture(db, gestureId))
          )
        ),
    ]);
  } catch (error) {
    console.error("[favorites] Failed to remove a favorite:", error);
    throw error;
  }
  if (found.length === 0) {
    throw new GestureNotFoundError();
  }
}

/** Adds the favorite when missing, removes it when present; the new state. */
export async function toggleFavorite(
  db: Db,
  userId: string,
  gestureId: string,
  now: Date = new Date()
): Promise<boolean> {
  let existing: unknown[];
  try {
    existing = await db
      .select({ gestureId: favorite.gestureId })
      .from(favorite)
      .where(
        and(eq(favorite.userId, userId), eq(favorite.gestureId, gestureId))
      );
  } catch (error) {
    console.error("[favorites] Failed to toggle a favorite:", error);
    throw error;
  }
  if (existing.length > 0) {
    await removeFavorite(db, userId, gestureId);
    return false;
  }
  await addFavorite(db, userId, gestureId, now);
  return true;
}
