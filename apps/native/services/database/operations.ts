/**
 * @fileoverview CRUD and query operations for the local SQLite database.
 *
 * Provides all read and write operations for `gestures`, `categories`, and
 * `sync_metadata` tables. All functions require an open, initialised database
 * connection passed as the first argument.
 *
 * @example
 * import { getAllGestures, insertGesture } from "./operations";
 * const gestures = await getAllGestures(db);
 */

import type * as SQLite from "expo-sqlite";
import type { Gesture } from "@/types";
import logger from "@/utils/logger";
import type { DatabaseCategory, DatabaseGesture } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertDb(
  db: SQLite.SQLiteDatabase | null
): asserts db is SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error("[database/operations] Database not initialised");
  }
}

/**
 * Map a raw SQLite row to the domain `Gesture` type by deserialising JSON fields.
 */
export function mapRowToGesture(row: DatabaseGesture): Gesture {
  return {
    id: row.id,
    name: row.name,
    category: JSON.parse(row.category) as string[],
    playbackId: row.playbackId,
    concept: JSON.parse(row.concept) as string[],
    info: row.info,
  };
}

// ─── Gesture CRUD ─────────────────────────────────────────────────────────────

/**
 * Insert or replace a single gesture in the database.
 *
 * @param db - Open database connection.
 * @param gesture - Domain gesture object to persist.
 * @param convexId - Optional Convex document ID for sync tracking.
 */
export async function insertGesture(
  db: SQLite.SQLiteDatabase | null,
  gesture: Gesture,
  convexId?: string
): Promise<void> {
  assertDb(db);

  const now = new Date().toISOString();
  const dbGesture: DatabaseGesture = {
    id: gesture.id,
    name: gesture.name,
    category: JSON.stringify(gesture.category),
    playbackId: gesture.playbackId,
    concept: JSON.stringify(gesture.concept),
    info: gesture.info,
    createdAt: now,
    updatedAt: now,
    lastSyncAt: now,
    convexId,
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO gestures
     (id, convexId, name, category, playbackId, concept, info, createdAt, updatedAt, lastSyncAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dbGesture.id,
      dbGesture.convexId ?? null,
      dbGesture.name,
      dbGesture.category,
      dbGesture.playbackId,
      dbGesture.concept,
      dbGesture.info,
      dbGesture.createdAt,
      dbGesture.updatedAt,
      dbGesture.lastSyncAt ?? null,
    ]
  );

  logger.log(`[database/operations] Inserted gesture: ${gesture.name}`);
}

/**
 * Insert or replace multiple gestures inside a single transaction for performance.
 *
 * @param db - Open database connection.
 * @param gestures - Array of `{ gesture, convexId? }` pairs.
 */
export async function insertGestures(
  db: SQLite.SQLiteDatabase | null,
  gestures: Array<{ gesture: Gesture; convexId?: string }>
): Promise<void> {
  assertDb(db);

  await db.execAsync("BEGIN TRANSACTION;");

  try {
    for (const { gesture, convexId } of gestures) {
      await insertGesture(db, gesture, convexId);
    }
    await db.execAsync("COMMIT;");
    logger.log(`[database/operations] Inserted ${gestures.length} gestures`);
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }
}

/**
 * Retrieve all gestures sorted alphabetically by name.
 */
export async function getAllGestures(
  db: SQLite.SQLiteDatabase | null
): Promise<Gesture[]> {
  assertDb(db);

  const rows = (await db.getAllAsync(
    "SELECT * FROM gestures ORDER BY name ASC"
  )) as DatabaseGesture[];

  return rows.map(mapRowToGesture);
}

/**
 * Retrieve multiple gestures by their local IDs.
 */
export async function getGesturesByIds(
  db: SQLite.SQLiteDatabase | null,
  ids: string[]
): Promise<Gesture[]> {
  assertDb(db);

  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = (await db.getAllAsync(
    `SELECT * FROM gestures WHERE id IN (${placeholders}) ORDER BY name ASC`,
    ids
  )) as DatabaseGesture[];

  return rows.map(mapRowToGesture);
}

/**
 * Full-text search across gesture name, concept, and category fields.
 *
 * @param db - Open database connection.
 * @param searchText - Text to search for (LIKE match).
 * @param categories - Optional category filter.
 * @param limit - Maximum number of results (default: 50).
 */
export async function searchGestures(
  db: SQLite.SQLiteDatabase | null,
  searchText: string,
  categories?: string[],
  limit = 50
): Promise<Gesture[]> {
  assertDb(db);

  let query = `
    SELECT * FROM gestures
    WHERE (name LIKE ? OR concept LIKE ? OR category LIKE ?)
  `;
  const params: string[] = [
    `%${searchText}%`,
    `%${searchText}%`,
    `%${searchText}%`,
  ];

  if (categories && categories.length > 0) {
    const categoryConditions = categories
      .map(() => "category LIKE ?")
      .join(" OR ");
    query += ` AND (${categoryConditions})`;
    for (const cat of categories) {
      params.push(`%"${cat}"%`);
    }
  }

  query += " ORDER BY name ASC LIMIT ?";
  params.push(limit.toString());

  const rows = (await db.getAllAsync(query, params)) as DatabaseGesture[];
  return rows.map(mapRowToGesture);
}

/**
 * Retrieve all gestures belonging to a specific category.
 */
export async function getGesturesByCategory(
  db: SQLite.SQLiteDatabase | null,
  category: string
): Promise<Gesture[]> {
  assertDb(db);

  const rows = (await db.getAllAsync(
    "SELECT * FROM gestures WHERE category LIKE ? ORDER BY name ASC",
    [`%"${category}"%`]
  )) as DatabaseGesture[];

  return rows.map(mapRowToGesture);
}

/**
 * Retrieve a gesture by its Convex document ID.
 */
export async function getGestureByConvexId(
  db: SQLite.SQLiteDatabase | null,
  convexId: string
): Promise<DatabaseGesture | null> {
  assertDb(db);

  return (await db.getFirstAsync("SELECT * FROM gestures WHERE convexId = ?", [
    convexId,
  ])) as DatabaseGesture | null;
}

/**
 * Delete all gestures from the database.
 */
export async function clearAllGestures(
  db: SQLite.SQLiteDatabase | null
): Promise<void> {
  assertDb(db);

  await db.runAsync("DELETE FROM gestures");
  logger.log("[database/operations] All gestures cleared");
}

/**
 * Count the total number of gestures in the database.
 */
export async function getGestureCount(
  db: SQLite.SQLiteDatabase | null
): Promise<number> {
  assertDb(db);

  const result = (await db.getFirstAsync(
    "SELECT COUNT(*) as count FROM gestures"
  )) as { count: number };

  return result?.count ?? 0;
}

// ─── Category CRUD ────────────────────────────────────────────────────────────

/**
 * Insert or replace a single category in the database.
 */
export async function insertCategory(
  db: SQLite.SQLiteDatabase | null,
  category: { id: string; name: string },
  convexId?: string
): Promise<void> {
  assertDb(db);

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO categories
     (id, convexId, name, description, isActive, createdAt, updatedAt, lastSyncAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [category.id, convexId ?? null, category.name, null, 1, now, now, now]
  );

  logger.log(`[database/operations] Inserted category: ${category.name}`);
}

/**
 * Retrieve all unique category names extracted from gesture category JSON fields.
 */
export async function getCategories(
  db: SQLite.SQLiteDatabase | null
): Promise<string[]> {
  assertDb(db);

  const rows = (await db.getAllAsync(
    "SELECT DISTINCT category FROM gestures"
  )) as Array<{ category: string }>;

  const allCategories = new Set<string>();

  for (const row of rows) {
    try {
      const cats = JSON.parse(row.category) as string[];
      for (const cat of cats) {
        allCategories.add(cat);
      }
    } catch (_error) {
      logger.error(
        "[database/operations] Failed to parse category JSON:",
        row.category
      );
    }
  }

  return Array.from(allCategories).sort();
}

/**
 * Retrieve all active categories from the `categories` table.
 */
export async function getAllCategories(
  db: SQLite.SQLiteDatabase | null
): Promise<
  Array<{ id: string; name: string; description?: string; convexId?: string }>
> {
  assertDb(db);

  const rows = (await db.getAllAsync(
    "SELECT * FROM categories WHERE isActive = 1 ORDER BY name ASC"
  )) as DatabaseCategory[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    convexId: row.convexId,
  }));
}

/**
 * Retrieve a category by its Convex document ID.
 */
export async function getCategoryByConvexId(
  db: SQLite.SQLiteDatabase | null,
  convexId: string
): Promise<DatabaseCategory | null> {
  assertDb(db);

  return (await db.getFirstAsync(
    "SELECT * FROM categories WHERE convexId = ? AND isActive = 1",
    [convexId]
  )) as DatabaseCategory | null;
}

/**
 * Count the total number of active categories.
 */
export async function getCategoryCount(
  db: SQLite.SQLiteDatabase | null
): Promise<number> {
  assertDb(db);

  const result = (await db.getFirstAsync(
    "SELECT COUNT(*) as count FROM categories WHERE isActive = 1"
  )) as { count: number };

  return result?.count ?? 0;
}

/**
 * Delete all categories from the database.
 */
export async function clearAllCategories(
  db: SQLite.SQLiteDatabase | null
): Promise<void> {
  assertDb(db);

  await db.runAsync("DELETE FROM categories");
  logger.log("[database/operations] All categories cleared");
}

// ─── Sync metadata ────────────────────────────────────────────────────────────

/**
 * Persist the timestamp of the most recent successful sync.
 */
export async function setLastSyncTime(
  db: SQLite.SQLiteDatabase | null,
  time: Date
): Promise<void> {
  assertDb(db);

  await db.runAsync(
    "INSERT OR REPLACE INTO sync_metadata (key, value, updatedAt) VALUES (?, ?, ?)",
    ["last_sync", time.toISOString(), new Date().toISOString()]
  );
}

/**
 * Retrieve the timestamp of the most recent successful sync, or `null` if
 * no sync has been performed yet.
 */
export async function getLastSyncTime(
  db: SQLite.SQLiteDatabase | null
): Promise<Date | null> {
  assertDb(db);

  const result = (await db.getFirstAsync(
    "SELECT value FROM sync_metadata WHERE key = ?",
    ["last_sync"]
  )) as { value: string } | null;

  return result ? new Date(result.value) : null;
}
