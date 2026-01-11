import * as SQLite from "expo-sqlite";
import type { Gesture } from "@/types";
import logger from "@/utils/logger";

type DatabaseGesture = {
  id: string;
  name: string;
  category: string; // JSON string of array
  playbackId: string;
  concept: string; // JSON string of array
  info: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  convexId?: string;
};

type DatabaseCategory = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  convexId?: string;
};

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.db = await SQLite.openDatabaseAsync("gestures.db");

      // Check database version and force clean migration if needed
      await this.checkDatabaseVersion();

      await this.createTables();
      this.isInitialized = true;

      logger.log("[databaseService] Database initialized successfully");
    } catch (error) {
      console.error("[databaseService] Failed to initialize database:", error);
      throw error;
    }
  }

  private async checkDatabaseVersion(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    try {
      // Check if we have a version metadata table
      const tables = (await this.db.getAllAsync(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='sync_metadata';
      `)) as Array<{ name: string }>;

      let currentVersion = 1; // Default for old installations

      if (tables.length > 0) {
        // Check stored version
        const versionResult = (await this.db.getFirstAsync(
          "SELECT value FROM sync_metadata WHERE key = 'db_version'"
        )) as { value: string } | null;

        if (versionResult) {
          currentVersion = Number.parseInt(versionResult.value, 10);
        }
      }

      const targetVersion = 3; // New version with favorites tables

      if (currentVersion < targetVersion) {
        logger.log(
          `[databaseService] Database version upgrade needed: ${currentVersion} -> ${targetVersion}`
        );
        logger.log(
          "[databaseService] Performing complete database reset for schema migration"
        );

        // Force complete reset for major schema changes
        await this.db.execAsync("DROP TABLE IF EXISTS gestures;");
        await this.db.execAsync("DROP TABLE IF EXISTS categories;");
        await this.db.execAsync("DROP TABLE IF EXISTS sync_metadata;");

        logger.log("[databaseService] All tables dropped for clean migration");
      }
    } catch (_error) {
      logger.log(
        "[databaseService] No existing database found, creating fresh"
      );
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    // Force migration - always check and fix schema
    await this.ensureCorrectSchema();

    // Create indexes for gestures
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_gestures_name ON gestures(name);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_gestures_category ON gestures(category);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_gestures_convex_id ON gestures(convexId);
    `);

    // Create indexes for categories
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_categories_convex_id ON categories(convexId);
    `);

    // Create sync metadata table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // Store current database version
    await this.db.runAsync(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updatedAt) VALUES (?, ?, ?)",
      ["db_version", "3", new Date().toISOString()]
    );

    logger.log("[databaseService] Database tables created successfully");
  }

  private async ensureCorrectSchema(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    try {
      const gestureTableInfo = await this.getTableInfo("gestures");
      const categoryTableInfo = await this.getTableInfo("categories");

      const needsGesturesMigration =
        this.checkGestureTableNeedsMigration(gestureTableInfo);
      const needsCategoriesMigration =
        this.checkCategoryTableNeedsMigration(categoryTableInfo);

      await this.performMigrations(
        needsGesturesMigration,
        needsCategoriesMigration
      );
      await this.createTablesWithCorrectSchema();

      logger.log("[databaseService] Schema validation and migration completed");
    } catch (error) {
      logger.error("[databaseService] Error during schema migration:", error);
      throw error;
    }
  }

  private checkGestureTableNeedsMigration(
    tableInfo: Array<{ name: string }>
  ): boolean {
    if (tableInfo.length === 0) {
      return false;
    }

    const hasVideoUrl = tableInfo.some((col) => col.name === "videoUrl");
    const hasPlaybackId = tableInfo.some((col) => col.name === "playbackId");
    const hasConvexId = tableInfo.some((col) => col.name === "convexId");

    const needsMigration = hasVideoUrl || !hasPlaybackId || !hasConvexId;
    if (needsMigration) {
      logger.log(
        "[databaseService] Gestures table needs migration - old schema detected"
      );
    }
    return needsMigration;
  }

  private checkCategoryTableNeedsMigration(
    tableInfo: Array<{ name: string }>
  ): boolean {
    if (tableInfo.length === 0) {
      return false;
    }

    const hasConvexId = tableInfo.some((col) => col.name === "convexId");
    const hasIsActive = tableInfo.some((col) => col.name === "isActive");

    const needsMigration = !(hasConvexId && hasIsActive);
    if (needsMigration) {
      logger.log(
        "[databaseService] Categories table needs migration - old schema detected"
      );
    }
    return needsMigration;
  }

  private async performMigrations(
    needsGesturesMigration: boolean,
    needsCategoriesMigration: boolean
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    if (needsGesturesMigration) {
      logger.log(
        "[databaseService] Dropping and recreating gestures table with new schema"
      );
      await this.db.execAsync("DROP TABLE IF EXISTS gestures;");
    }

    if (needsCategoriesMigration) {
      logger.log(
        "[databaseService] Dropping and recreating categories table with new schema"
      );
      await this.db.execAsync("DROP TABLE IF EXISTS categories;");
    }
  }

  private async createTablesWithCorrectSchema(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.db.execAsync(`
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

    await this.db.execAsync(`
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

    // Create favorites tables
    await this.db.execAsync(`
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

    await this.db.execAsync(`
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

    // Create indexes for favorites
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_user_favorites_gesture_id ON user_favorites(gesture_id);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_user_favorites_sync_status ON user_favorites(sync_status);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_favorites_sync_queue_created_at ON favorites_sync_queue(created_at);
    `);
  }

  private async getTableInfo(tableName: string): Promise<
    Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | number | null;
      pk: number;
    }>
  > {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    try {
      const result = (await this.db.getAllAsync(
        `PRAGMA table_info(${tableName});`
      )) as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | number | null;
        pk: number;
      }>;
      return result;
    } catch (_error) {
      // Table doesn't exist
      return [];
    }
  }

  async insertGesture(gesture: Gesture, convexId?: string): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

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

    await this.db.runAsync(
      `INSERT OR REPLACE INTO gestures
       (id, convexId, name, category, playbackId, concept, info, createdAt, updatedAt, lastSyncAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbGesture.id,
        dbGesture.convexId || null,
        dbGesture.name,
        dbGesture.category,
        dbGesture.playbackId,
        dbGesture.concept,
        dbGesture.info,
        dbGesture.createdAt,
        dbGesture.updatedAt,
        dbGesture.lastSyncAt || null,
      ]
    );

    logger.log(`[databaseService] Inserted gesture: ${gesture.name}`);
  }

  async insertGestures(
    gestures: Array<{ gesture: Gesture; convexId?: string }>
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    // Begin transaction
    await this.db.execAsync("BEGIN TRANSACTION;");

    try {
      for (const { gesture, convexId } of gestures) {
        await this.insertGesture(gesture, convexId);
      }

      await this.db.execAsync("COMMIT;");

      logger.log(
        `[databaseService] Inserted ${gestures.length} gestures successfully`
      );
    } catch (error) {
      await this.db.execAsync("ROLLBACK;");
      throw error;
    }
  }

  async insertCategory(
    category: { id: string; name: string },
    convexId?: string
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO categories
       (id, convexId, name, description, isActive, createdAt, updatedAt, lastSyncAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        convexId || null,
        category.name,
        null, // description is always null
        1, // isActive = true
        now,
        now,
        now,
      ]
    );

    logger.log(`[databaseService] Inserted category: ${category.name}`);
  }

  async getAllGestures(): Promise<Gesture[]> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const rows = (await this.db.getAllAsync(
      "SELECT * FROM gestures ORDER BY name ASC"
    )) as DatabaseGesture[];

    return rows.map((row) => this.mapRowToGesture(row));
  }

  async getGesturesByIds(ids: string[]): Promise<Gesture[]> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(",");
    const query = `
      SELECT * FROM gestures
      WHERE id IN (${placeholders})
      ORDER BY name ASC
    `;

    const rows = (await this.db.getAllAsync(query, ids)) as DatabaseGesture[];
    return rows.map((row) => this.mapRowToGesture(row));
  }

  async searchGestures(
    searchText: string,
    categories?: string[],
    limit = 50
  ): Promise<Gesture[]> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

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
      categories.forEach((category) => {
        params.push(`%"${category}"%`);
      });
    }

    query += " ORDER BY name ASC LIMIT ?";
    params.push(limit.toString());

    const rows = (await this.db.getAllAsync(
      query,
      params
    )) as DatabaseGesture[];
    return rows.map((row) => this.mapRowToGesture(row));
  }

  async getGesturesByCategory(category: string): Promise<Gesture[]> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const query = `
      SELECT * FROM gestures
      WHERE category LIKE ?
      ORDER BY name ASC
    `;

    const rows = (await this.db.getAllAsync(query, [
      `%"${category}"%`,
    ])) as DatabaseGesture[];
    return rows.map((row) => this.mapRowToGesture(row));
  }

  async getCategories(): Promise<string[]> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const rows = (await this.db.getAllAsync(
      "SELECT DISTINCT category FROM gestures"
    )) as {
      category: string;
    }[];

    const allCategories = new Set<string>();
    rows.forEach((row) => {
      try {
        const categories = JSON.parse(row.category) as string[];
        for (const cat of categories) {
          allCategories.add(cat);
        }
      } catch (_error) {
        console.error(
          "[databaseService] Failed to parse category:",
          row.category
        );
      }
    });

    return Array.from(allCategories).sort();
  }

  async getAllCategories(): Promise<
    Array<{ id: string; name: string; description?: string; convexId?: string }>
  > {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const rows = (await this.db.getAllAsync(
      "SELECT * FROM categories WHERE isActive = 1 ORDER BY name ASC"
    )) as DatabaseCategory[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      convexId: row.convexId,
    }));
  }

  async clearAllGestures(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.db.runAsync("DELETE FROM gestures");

    logger.log("[databaseService] All gestures cleared");
  }

  async clearAllCategories(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.db.runAsync("DELETE FROM categories");

    logger.log("[databaseService] All categories cleared");
  }

  async getGestureCount(): Promise<number> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const result = (await this.db.getFirstAsync(
      "SELECT COUNT(*) as count FROM gestures"
    )) as {
      count: number;
    };
    return result?.count || 0;
  }

  async getCategoryCount(): Promise<number> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const result = (await this.db.getFirstAsync(
      "SELECT COUNT(*) as count FROM categories WHERE isActive = 1"
    )) as {
      count: number;
    };
    return result?.count || 0;
  }

  async getDatabaseStats(): Promise<{
    gestureCount: number;
    lastSync: Date | null;
    databaseSize: string;
  }> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const gestureCount = await this.getGestureCount();
    const lastSync = await this.getLastSyncTime();

    return {
      gestureCount,
      lastSync,
      databaseSize: "N/A", // SQLite doesn't easily provide size info
    };
  }

  // Sync metadata methods
  async setLastSyncTime(time: Date): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.db.runAsync(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updatedAt) VALUES (?, ?, ?)",
      ["last_sync", time.toISOString(), new Date().toISOString()]
    );
  }

  async getLastSyncTime(): Promise<Date | null> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const result = (await this.db.getFirstAsync(
      "SELECT value FROM sync_metadata WHERE key = ?",
      ["last_sync"]
    )) as { value: string } | null;

    return result ? new Date(result.value) : null;
  }

  async getCategoryByConvexId(
    convexId: string
  ): Promise<DatabaseCategory | null> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const result = (await this.db.getFirstAsync(
      "SELECT * FROM categories WHERE convexId = ? AND isActive = 1",
      [convexId]
    )) as DatabaseCategory | null;

    return result;
  }

  async getGestureByConvexId(
    convexId: string
  ): Promise<DatabaseGesture | null> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const result = (await this.db.getFirstAsync(
      "SELECT * FROM gestures WHERE convexId = ?",
      [convexId]
    )) as DatabaseGesture | null;

    return result;
  }

  private mapRowToGesture(row: DatabaseGesture): Gesture {
    return {
      id: row.id,
      name: row.name,
      category: JSON.parse(row.category),
      playbackId: row.playbackId,
      concept: JSON.parse(row.concept),
      info: row.info,
    };
  }
}

export const databaseService = new DatabaseService();
export default databaseService;
