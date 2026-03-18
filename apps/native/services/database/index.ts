/**
 * @fileoverview SQLite database management with offline-first architecture.
 *
 * This module is the primary data access layer for the SMOG mobile app.
 * It implements an offline-first strategy where:
 *
 * 1. All data is stored locally in SQLite (`gestures.db`).
 * 2. Operations complete immediately with the local copy.
 * 3. Changes are synced to Convex in the background (via `convexSyncService`).
 * 4. Schema migrations run automatically on app start.
 *
 * @architecture
 * ```
 * Component
 *   └─ gestureService (public API)
 *       └─ database (this module)
 *           ├─ schema.ts   — table creation & migrations
 *           ├─ operations.ts — CRUD & query functions
 *           └─ types.ts    — internal row types
 * ```
 *
 * @example
 * import databaseService from "@/services/database";
 *
 * await databaseService.initialize();
 * const gestures = await databaseService.getAllGestures();
 */

import * as SQLite from "expo-sqlite";
import type { Gesture } from "@/types";
import logger from "@/utils/logger";
import {
  clearAllCategories,
  clearAllGestures,
  getAllCategories,
  getAllGestures,
  getCategories,
  getCategoryByConvexId,
  getCategoryCount,
  getGestureByConvexId,
  getGestureCount,
  getGesturesByCategory,
  getGesturesByIds,
  getLastSyncTime,
  insertCategory,
  insertGesture,
  insertGestures,
  searchGestures,
  setLastSyncTime,
} from "./operations";
import {
  checkDatabaseVersion,
  createIndexesAndMetadata,
  ensureCorrectSchema,
} from "./schema";
import type { DatabaseCategory, DatabaseGesture } from "./types";

export type { DatabaseGesture, DatabaseCategory };

// ─── DatabaseService class ────────────────────────────────────────────────────

/**
 * Singleton service managing the local SQLite database connection and
 * delegating all schema/CRUD work to the schema and operations modules.
 *
 * @remarks
 * Always call `initialize()` before any other method. The service is safe to
 * call multiple times — subsequent calls to `initialize()` are no-ops.
 */
class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  /**
   * Open the SQLite database, run any required schema migrations, and create
   * tables and indexes. Must be called once at app startup before using any
   * other method.
   *
   * @throws {Error} If the database cannot be opened or migrations fail.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.db = await SQLite.openDatabaseAsync("gestures.db");
      await checkDatabaseVersion(this.db);
      await ensureCorrectSchema(this.db);
      await createIndexesAndMetadata(this.db);
      this.isInitialized = true;
      logger.log("[database] Initialised successfully");
    } catch (error) {
      logger.error("[database] Failed to initialise:", error);
      throw error;
    }
  }

  // ─── Gesture operations ─────────────────────────────────────────────────────

  /** @see operations.insertGesture */
  async insertGesture(gesture: Gesture, convexId?: string): Promise<void> {
    return insertGesture(this.db, gesture, convexId);
  }

  /** @see operations.insertGestures */
  async insertGestures(
    gestures: Array<{ gesture: Gesture; convexId?: string }>
  ): Promise<void> {
    return insertGestures(this.db, gestures);
  }

  /** @see operations.getAllGestures */
  async getAllGestures(): Promise<Gesture[]> {
    return getAllGestures(this.db);
  }

  /** @see operations.getGesturesByIds */
  async getGesturesByIds(ids: string[]): Promise<Gesture[]> {
    return getGesturesByIds(this.db, ids);
  }

  /** @see operations.searchGestures */
  async searchGestures(
    searchText: string,
    categories?: string[],
    limit?: number
  ): Promise<Gesture[]> {
    return searchGestures(this.db, searchText, categories, limit);
  }

  /** @see operations.getGesturesByCategory */
  async getGesturesByCategory(category: string): Promise<Gesture[]> {
    return getGesturesByCategory(this.db, category);
  }

  /** @see operations.getGestureByConvexId */
  async getGestureByConvexId(
    convexId: string
  ): Promise<DatabaseGesture | null> {
    return getGestureByConvexId(this.db, convexId);
  }

  /** @see operations.clearAllGestures */
  async clearAllGestures(): Promise<void> {
    return clearAllGestures(this.db);
  }

  /** @see operations.getGestureCount */
  async getGestureCount(): Promise<number> {
    return getGestureCount(this.db);
  }

  // ─── Category operations ────────────────────────────────────────────────────

  /** @see operations.insertCategory */
  async insertCategory(
    category: { id: string; name: string },
    convexId?: string
  ): Promise<void> {
    return insertCategory(this.db, category, convexId);
  }

  /** @see operations.getCategories */
  async getCategories(): Promise<string[]> {
    return getCategories(this.db);
  }

  /** @see operations.getAllCategories */
  async getAllCategories(): Promise<
    Array<{ id: string; name: string; description?: string; convexId?: string }>
  > {
    return getAllCategories(this.db);
  }

  /** @see operations.getCategoryByConvexId */
  async getCategoryByConvexId(
    convexId: string
  ): Promise<DatabaseCategory | null> {
    return getCategoryByConvexId(this.db, convexId);
  }

  /** @see operations.getCategoryCount */
  async getCategoryCount(): Promise<number> {
    return getCategoryCount(this.db);
  }

  /** @see operations.clearAllCategories */
  async clearAllCategories(): Promise<void> {
    return clearAllCategories(this.db);
  }

  // ─── Sync metadata ──────────────────────────────────────────────────────────

  /** @see operations.setLastSyncTime */
  async setLastSyncTime(time: Date): Promise<void> {
    return setLastSyncTime(this.db, time);
  }

  /** @see operations.getLastSyncTime */
  async getLastSyncTime(): Promise<Date | null> {
    return getLastSyncTime(this.db);
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  /**
   * Return high-level statistics about the local database.
   */
  async getDatabaseStats(): Promise<{
    gestureCount: number;
    lastSync: Date | null;
    databaseSize: string;
  }> {
    const gestureCount = await this.getGestureCount();
    const lastSync = await this.getLastSyncTime();
    return { gestureCount, lastSync, databaseSize: "N/A" };
  }
}

export const databaseService = new DatabaseService();
export default databaseService;
