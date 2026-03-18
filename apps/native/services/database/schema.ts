/**
 * @fileoverview SQLite schema definitions and migration logic.
 *
 * Responsible for:
 * - Determining whether schema migrations are needed
 * - Performing controlled table drops for incompatible migrations
 * - Creating all tables and indexes with the current schema
 *
 * The current schema version is `DATABASE_TARGET_VERSION` from `@smog/config`.
 * Increment this constant and add a corresponding migration whenever the
 * schema changes.
 *
 * @architecture
 * ```
 * DatabaseService.initialize()
 *   └─ checkDatabaseVersion()  (in schema.ts)
 *       └─ ensureCorrectSchema()
 *           ├─ checkGestureTableNeedsMigration()
 *           ├─ checkCategoryTableNeedsMigration()
 *           ├─ performMigrations()
 *           └─ createTablesWithCorrectSchema()
 * ```
 */

import { DATABASE_TARGET_VERSION } from "@smog/config/constants";
import type * as SQLite from "expo-sqlite";
import logger from "@/utils/logger";
import type { TableInfoRow } from "./types";

// ─── Version check ────────────────────────────────────────────────────────────

/**
 * Read the stored schema version from `sync_metadata` and drop all tables if
 * an upgrade is required. After this function returns the database is ready
 * for `createTablesWithCorrectSchema`.
 *
 * @param db - An open SQLite database connection.
 */
export async function checkDatabaseVersion(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  try {
    const tables = (await db.getAllAsync(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='sync_metadata';
    `)) as Array<{ name: string }>;

    let currentVersion = 1; // Default for pre-versioned installations

    if (tables.length > 0) {
      const versionResult = (await db.getFirstAsync(
        "SELECT value FROM sync_metadata WHERE key = 'db_version'"
      )) as { value: string } | null;

      if (versionResult) {
        currentVersion = Number.parseInt(versionResult.value, 10);
      }
    }

    if (currentVersion < DATABASE_TARGET_VERSION) {
      logger.log(
        `[database/schema] Version upgrade needed: ${currentVersion} → ${DATABASE_TARGET_VERSION}`
      );
      logger.log("[database/schema] Dropping all tables for clean migration");

      await db.execAsync("DROP TABLE IF EXISTS gestures;");
      await db.execAsync("DROP TABLE IF EXISTS categories;");
      await db.execAsync("DROP TABLE IF EXISTS sync_metadata;");

      logger.log(
        "[database/schema] All tables dropped — ready for fresh schema"
      );
    }
  } catch (_error) {
    // No existing database — this is a fresh install
    logger.log("[database/schema] No existing database — creating fresh");
  }
}

// ─── Migration helpers ────────────────────────────────────────────────────────

async function getTableInfo(
  db: SQLite.SQLiteDatabase,
  tableName: string
): Promise<TableInfoRow[]> {
  try {
    return (await db.getAllAsync(
      `PRAGMA table_info(${tableName});`
    )) as TableInfoRow[];
  } catch (_error) {
    return [];
  }
}

function checkGestureTableNeedsMigration(tableInfo: TableInfoRow[]): boolean {
  if (tableInfo.length === 0) {
    return false;
  }

  const hasVideoUrl = tableInfo.some((col) => col.name === "videoUrl");
  const hasPlaybackId = tableInfo.some((col) => col.name === "playbackId");
  const hasConvexId = tableInfo.some((col) => col.name === "convexId");

  const needsMigration = hasVideoUrl || !hasPlaybackId || !hasConvexId;
  if (needsMigration) {
    logger.log(
      "[database/schema] Gestures table needs migration — old schema detected"
    );
  }
  return needsMigration;
}

function checkCategoryTableNeedsMigration(tableInfo: TableInfoRow[]): boolean {
  if (tableInfo.length === 0) {
    return false;
  }

  const hasConvexId = tableInfo.some((col) => col.name === "convexId");
  const hasIsActive = tableInfo.some((col) => col.name === "isActive");

  const needsMigration = !(hasConvexId && hasIsActive);
  if (needsMigration) {
    logger.log(
      "[database/schema] Categories table needs migration — old schema detected"
    );
  }
  return needsMigration;
}

async function performMigrations(
  db: SQLite.SQLiteDatabase,
  needsGesturesMigration: boolean,
  needsCategoriesMigration: boolean
): Promise<void> {
  if (needsGesturesMigration) {
    logger.log("[database/schema] Dropping gestures table for schema update");
    await db.execAsync("DROP TABLE IF EXISTS gestures;");
  }
  if (needsCategoriesMigration) {
    logger.log("[database/schema] Dropping categories table for schema update");
    await db.execAsync("DROP TABLE IF EXISTS categories;");
  }
}

// ─── Table creation ───────────────────────────────────────────────────────────

async function createTablesWithCorrectSchema(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      convexId TEXT UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncAt TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS gestures (
      id TEXT PRIMARY KEY,
      convexId TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      playbackId TEXT NOT NULL,
      concept TEXT NOT NULL,
      info TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncAt TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      gesture_id TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      operation_id TEXT NOT NULL,
      UNIQUE(user_id, gesture_id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS favorites_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      gesture_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_retry_at TEXT,
      error_message TEXT
    );
  `);
}

/**
 * Inspect the current schema, run any necessary migrations, and (re)create
 * tables and indexes in the correct shape.
 *
 * @param db - An open SQLite database connection.
 */
export async function ensureCorrectSchema(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  try {
    const gestureTableInfo = await getTableInfo(db, "gestures");
    const categoryTableInfo = await getTableInfo(db, "categories");

    const needsGesturesMigration =
      checkGestureTableNeedsMigration(gestureTableInfo);
    const needsCategoriesMigration =
      checkCategoryTableNeedsMigration(categoryTableInfo);

    await performMigrations(
      db,
      needsGesturesMigration,
      needsCategoriesMigration
    );
    await createTablesWithCorrectSchema(db);

    logger.log("[database/schema] Schema validation and migration complete");
  } catch (error) {
    logger.error("[database/schema] Error during schema migration:", error);
    throw error;
  }
}

/**
 * Create all indexes and update the stored schema version in `sync_metadata`.
 *
 * @param db - An open SQLite database connection.
 */
export async function createIndexesAndMetadata(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  // Gesture indexes
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_gestures_name ON gestures(name);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_gestures_category ON gestures(category);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_gestures_convex_id ON gestures(convexId);"
  );

  // Category indexes
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_categories_convex_id ON categories(convexId);"
  );

  // Sync metadata table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  // Favorites indexes
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_user_favorites_gesture_id ON user_favorites(gesture_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_user_favorites_sync_status ON user_favorites(sync_status);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_favorites_sync_queue_created_at ON favorites_sync_queue(created_at);"
  );

  // Store current version
  await db.runAsync(
    "INSERT OR REPLACE INTO sync_metadata (key, value, updatedAt) VALUES (?, ?, ?)",
    ["db_version", String(DATABASE_TARGET_VERSION), new Date().toISOString()]
  );

  logger.log("[database/schema] Indexes and metadata updated");
}
