import type { NetInfoState } from "@react-native-community/netinfo";
import * as SQLite from "expo-sqlite";
import logger from "@/utils/logger";
import { networkService } from "./networkService";

interface LocalFavorite {
  id: number;
  user_id: string;
  gesture_id: string;
  is_favorite: number;
  created_at: string;
  updated_at: string;
  sync_status: "pending" | "synced" | "conflict";
  operation_id: string;
}

export interface SyncOperation {
  id: number;
  operation_id: string;
  user_id: string;
  gesture_id: string;
  operation: "add" | "remove";
  created_at: string;
  retry_count: number;
  last_retry_at?: string;
  error_message?: string;
}

class OfflineFavoritesService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;
  private syncInProgress = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.db = await SQLite.openDatabaseAsync("gestures.db");
      this.isInitialized = true;

      // Listen for network changes to trigger sync
      networkService.addListener(this.handleNetworkChange.bind(this));

      logger.log(
        "[offlineFavoritesService] Service initialized - offline cache mode"
      );
    } catch (error) {
      console.error("[offlineFavoritesService] Failed to initialize:", error);
      throw error;
    }
  }

  private handleNetworkChange(networkState: NetInfoState): void {
    if (networkState.isConnected && !this.syncInProgress) {
      // Debounce sync calls
      setTimeout(() => this.syncPendingOperations(), 1000);
    }
  }

  private generateOperationId(): string {
    return `fav_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Updates the local cache to match Convex state (Convex is source of truth)
   * This is used to keep offline cache in sync
   */
  async updateLocalCache(
    userId: string,
    gestureId: string,
    isFavorite: boolean
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Service not initialized");
    }

    const now = new Date().toISOString();

    try {
      await this.db.runAsync(
        `
        INSERT OR REPLACE INTO user_favorites
        (user_id, gesture_id, is_favorite, created_at, updated_at, sync_status, operation_id)
        VALUES (?, ?, ?, ?, ?, 'synced', 'cache')
      `,
        [userId, gestureId, isFavorite ? 1 : 0, now, now]
      );

      logger.log(
        `[offlineFavoritesService] Updated local cache: ${gestureId} = ${isFavorite}`
      );
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to update local cache:",
        error
      );
      throw error;
    }
  }

  /**
   * Syncs all favorites from Convex to local cache (overwrites local state)
   */
  async syncFromConvex(
    userId: string,
    convexFavorites: string[]
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Service not initialized");
    }

    const now = new Date().toISOString();

    try {
      // Clear all existing favorites for this user
      await this.db.runAsync(
        "DELETE FROM user_favorites WHERE user_id = ? AND sync_status = 'synced'",
        [userId]
      );

      // Insert all favorites from Convex
      for (const gestureId of convexFavorites) {
        await this.db.runAsync(
          `
          INSERT OR REPLACE INTO user_favorites
          (user_id, gesture_id, is_favorite, created_at, updated_at, sync_status, operation_id)
          VALUES (?, ?, 1, ?, ?, 'synced', 'cache')
        `,
          [userId, gestureId, now, now]
        );
      }

      logger.log(
        `[offlineFavoritesService] Synced ${convexFavorites.length} favorites from Convex to local cache`
      );
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to sync from Convex:",
        error
      );
      throw error;
    }
  }

  /**
   * Toggles favorite in OFFLINE mode only (queues for sync when online)
   * When online, use Convex directly instead
   */
  async toggleFavoriteOffline(
    userId: string,
    gestureId: string
  ): Promise<boolean> {
    if (!this.db) {
      throw new Error("Service not initialized");
    }

    const now = new Date().toISOString();
    const operationId = this.generateOperationId();

    try {
      // Check current state
      const currentFavorite = (await this.db.getFirstAsync(
        `
        SELECT * FROM user_favorites
        WHERE user_id = ? AND gesture_id = ?
      `,
        [userId, gestureId]
      )) as LocalFavorite | null;

      const isNewFavorite =
        !currentFavorite || currentFavorite.is_favorite === 0;
      const operation = isNewFavorite ? "add" : "remove";

      // Update/insert favorite locally
      await this.db.runAsync(
        `
        INSERT OR REPLACE INTO user_favorites
        (user_id, gesture_id, is_favorite, created_at, updated_at, sync_status, operation_id)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `,
        [userId, gestureId, isNewFavorite ? 1 : 0, now, now, operationId]
      );

      // Add to sync queue
      await this.db.runAsync(
        `
        INSERT OR REPLACE INTO favorites_sync_queue
        (operation_id, user_id, gesture_id, operation, created_at, retry_count)
        VALUES (?, ?, ?, ?, ?, 0)
      `,
        [operationId, userId, gestureId, operation, now]
      );

      logger.log(
        `[offlineFavoritesService] Favorite ${operation}ed offline (queued for sync): ${gestureId}`
      );

      return isNewFavorite;
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to toggle favorite offline:",
        error
      );
      throw error;
    }
  }

  async getFavorites(userId: string): Promise<string[]> {
    if (!this.db) {
      throw new Error("Service not initialized");
    }

    try {
      const favorites = (await this.db.getAllAsync(
        `
        SELECT gesture_id FROM user_favorites
        WHERE user_id = ? AND is_favorite = 1
        ORDER BY updated_at DESC
      `,
        [userId]
      )) as Array<{ gesture_id: string }>;

      return favorites.map((f) => f.gesture_id);
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to get favorites:",
        error
      );
      return [];
    }
  }

  async isFavorite(userId: string, gestureId: string): Promise<boolean> {
    if (!this.db) {
      throw new Error("Service not initialized");
    }

    try {
      const favorite = (await this.db.getFirstAsync(
        `
        SELECT is_favorite FROM user_favorites
        WHERE user_id = ? AND gesture_id = ?
      `,
        [userId, gestureId]
      )) as { is_favorite: number } | null;

      return favorite ? favorite.is_favorite === 1 : false;
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to check favorite:",
        error
      );
      return false;
    }
  }

  async syncPendingOperations(): Promise<void> {
    if (!this.db || this.syncInProgress || !networkService.isConnected()) {
      return;
    }

    this.syncInProgress = true;

    try {
      const pendingOps = (await this.db.getAllAsync(`
        SELECT * FROM favorites_sync_queue
        WHERE retry_count < 3
        ORDER BY created_at ASC
        LIMIT 10
      `)) as SyncOperation[];

      if (pendingOps.length === 0) {
        return;
      }

      logger.log(
        `[offlineFavoritesService] Syncing ${pendingOps.length} pending operations to Convex`
      );

      for (const op of pendingOps) {
        try {
          await this.syncSingleOperation(op);

          // Remove from sync queue on success
          await this.db.runAsync(
            `
            DELETE FROM favorites_sync_queue WHERE operation_id = ?
          `,
            [op.operation_id]
          );

          // Update local cache to 'synced' status (no longer pending)
          // The Convex data will be the source of truth
          await this.db.runAsync(
            `
            UPDATE user_favorites
            SET sync_status = 'synced', operation_id = 'cache'
            WHERE user_id = ? AND gesture_id = ? AND operation_id = ?
          `,
            [op.user_id, op.gesture_id, op.operation_id]
          );

          logger.log(
            `[offlineFavoritesService] Successfully synced operation: ${op.operation_id}`
          );
        } catch (error) {
          // Update retry count
          await this.db.runAsync(
            `
            UPDATE favorites_sync_queue
            SET retry_count = retry_count + 1,
                last_retry_at = ?,
                error_message = ?
            WHERE operation_id = ?
          `,
            [new Date().toISOString(), String(error), op.operation_id]
          );

          console.error(
            `[offlineFavoritesService] Failed to sync operation ${op.operation_id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error("[offlineFavoritesService] Sync process failed:", error);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncSingleOperation(op: SyncOperation): Promise<void> {
    // This callback syncs the operation to Convex
    if (this.onSyncOperation) {
      try {
        await this.onSyncOperation(op);

        logger.log(
          `[offlineFavoritesService] Operation synced to Convex: ${op.operation} ${op.gesture_id}`
        );
      } catch (error) {
        // Handle conflicts - Convex is source of truth, so we don't retry conflicts
        if (
          String(error).includes("conflict") ||
          String(error).includes("version")
        ) {
          logger.warn(
            `[offlineFavoritesService] Conflict detected for ${op.operation_id}, Convex state will override`
          );
          // Don't throw - let the operation complete and Convex will sync back the correct state
          return;
        }
        throw error;
      }
    } else {
      throw new Error("No sync callback registered");
    }
  }

  // Callback for syncing operations (to be set by the context)
  public onSyncOperation: ((op: SyncOperation) => Promise<void>) | null = null;

  async migrateLegacyFavorites(
    userId: string,
    legacyFavorites: string[]
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Service not initialized");
    }

    const now = new Date().toISOString();

    try {
      // Queue legacy favorites for sync to Convex (don't add to cache directly)
      for (const gestureId of legacyFavorites) {
        const operationId = this.generateOperationId();

        await this.db.runAsync(
          `
          INSERT OR IGNORE INTO favorites_sync_queue
          (operation_id, user_id, gesture_id, operation, created_at, retry_count)
          VALUES (?, ?, ?, 'add', ?, 0)
        `,
          [operationId, userId, gestureId, now]
        );
      }

      logger.log(
        `[offlineFavoritesService] Migrated ${legacyFavorites.length} legacy favorites (queued for sync to Convex)`
      );
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to migrate legacy favorites:",
        error
      );
      throw error;
    }
  }

  async clearUserFavorites(userId: string): Promise<void> {
    if (!this.db) {
      throw new Error("Service not initialized");
    }

    try {
      // Clear cache and pending operations
      await this.db.runAsync("DELETE FROM user_favorites WHERE user_id = ?", [
        userId,
      ]);
      await this.db.runAsync(
        "DELETE FROM favorites_sync_queue WHERE user_id = ?",
        [userId]
      );

      logger.log(
        `[offlineFavoritesService] Cleared local cache for user: ${userId}`
      );
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to clear user favorites:",
        error
      );
      throw error;
    }
  }

  async getPendingOperationsCount(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    try {
      const result = (await this.db.getFirstAsync(`
        SELECT COUNT(*) as count FROM favorites_sync_queue WHERE retry_count < 3
      `)) as { count: number };

      return result.count;
    } catch (error) {
      console.error(
        "[offlineFavoritesService] Failed to get pending operations count:",
        error
      );
      return 0;
    }
  }
}

export const offlineFavoritesService = new OfflineFavoritesService();
export default offlineFavoritesService;
