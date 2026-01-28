import { convexSyncService } from "@/services/convexSyncService";
import { databaseService } from "@/services/databaseService";
import type { Gesture } from "@/types";
import logger from "@/utils/logger";

// Search index for fast text search (kept in memory for performance)
interface SearchIndex {
  [key: string]: string[]; // word -> gesture IDs
}

class GestureService {
  private searchIndex: SearchIndex = {};
  private isIndexBuilt = false;
  private isInitialized = false;
  private isInitializing = false;
  private hasLocalData = false;
  private ensuringDataPromise: Promise<void> | null = null;
  private readonly DATA_POLL_INTERVAL_MS = 250;
  private readonly DATA_WAIT_TIMEOUT_MS = 15 * 1000;

  async initialize(): Promise<void> {
    // Prevent concurrent initialization
    if (this.isInitialized) {
      return;
    }

    if (this.isInitializing) {
      // Wait for existing initialization to complete
      while (this.isInitializing && !this.isInitialized) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;

    try {
      // Initialize database
      await databaseService.initialize();
      await this.ensureLocalDataAvailable();

      // Note: ConvexSyncService initialization will be handled by app startup
      // The convex client is initialized in AppProviders

      // Build search index - call database directly to avoid circular dependency
      const gestures = await databaseService.getAllGestures();
      this.buildSearchIndex(gestures);

      this.isInitialized = true;

      logger.log("[gestureService] Service initialized successfully");
    } catch (error) {
      console.error("[gestureService] Failed to initialize:", error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  // Build search index for fast text search
  private buildSearchIndex(gestures: Gesture[]): void {
    this.searchIndex = {};

    gestures.forEach((gesture) => {
      const words = [
        ...gesture.name.toLowerCase().split(/\s+/),
        ...gesture.category.flatMap((cat) => cat.toLowerCase().split(/\s+/)),
        ...(gesture.concept || []).flatMap((concept) =>
          concept.toLowerCase().split(/\s+/)
        ),
      ];

      words.forEach((word) => {
        if (word.length >= 2) {
          // Only index words with 2+ characters
          if (!this.searchIndex[word]) {
            this.searchIndex[word] = [];
          }
          if (!this.searchIndex[word].includes(gesture.id)) {
            this.searchIndex[word].push(gesture.id);
          }
        }
      });
    });

    this.isIndexBuilt = true;

    logger.log("[gestureService] Search index built successfully");
  }

  // Get all gestures from local database
  async getAllGestures(): Promise<Gesture[]> {
    try {
      await this.ensureInitialized();
      await this.ensureLocalDataAvailable();

      logger.log("[gestureService] Fetching all gestures from local database");

      const gestures = await databaseService.getAllGestures();

      // Rebuild search index if needed
      if (!this.isIndexBuilt) {
        this.buildSearchIndex(gestures);
      }

      return gestures;
    } catch (error) {
      console.error("[gestureService] Failed to get all gestures:", error);
      throw error;
    }
  }

  // Get categories from local database
  async getCategories(): Promise<string[]> {
    try {
      await this.ensureInitialized();
      await this.ensureLocalDataAvailable();

      logger.log("[gestureService] Fetching categories from local database");

      return await databaseService.getCategories();
    } catch (error) {
      console.error("[gestureService] Failed to get categories:", error);
      throw error;
    }
  }

  // Search gestures using local database and in-memory index
  async searchGestures(
    searchText: string,
    categories?: string[],
    limitCount = 50
  ): Promise<{ results: Gesture[]; cacheHit: boolean }> {
    try {
      await this.ensureInitialized();
      await this.ensureLocalDataAvailable();

      logger.log(
        `[gestureService] Searching gestures for: "${searchText}" categories: ${categories?.join(",") || "all"}`
      );

      // Use database search for efficiency
      const results = await databaseService.searchGestures(
        searchText,
        categories,
        limitCount
      );

      return { results, cacheHit: false }; // Always fresh from database
    } catch (error) {
      console.error("[gestureService] Failed to search gestures:", error);
      throw error;
    }
  }

  // Get gestures by category from local database
  async getGesturesByCategory(category: string): Promise<Gesture[]> {
    try {
      await this.ensureInitialized();
      await this.ensureLocalDataAvailable();

      logger.log(
        `[gestureService] Fetching gestures by category "${category}" from local database`
      );

      return await databaseService.getGesturesByCategory(category);
    } catch (error) {
      console.error(
        "[gestureService] Failed to get gestures by category:",
        error
      );
      throw error;
    }
  }

  // Get gestures by IDs from local database
  async getGesturesByIds(ids: string[]): Promise<Gesture[]> {
    try {
      await this.ensureInitialized();

      if (!ids.length) {
        return [];
      }

      await this.ensureLocalDataAvailable();

      logger.log(
        `[gestureService] Fetching gestures by IDs from local database: ${ids.join(", ")}`
      );

      return await databaseService.getGesturesByIds(ids);
    } catch (error) {
      console.error("[gestureService] Failed to get gestures by IDs:", error);
      throw error;
    }
  }

  // Get single gesture by ID from local database
  async getGestureById(id: string): Promise<Gesture | null> {
    try {
      await this.ensureInitialized();
      await this.ensureLocalDataAvailable();

      logger.log(
        `[gestureService] Fetching gesture by ID from local database: ${id}`
      );

      const gestures = await databaseService.getGesturesByIds([id]);
      return gestures.length > 0 ? gestures[0] : null;
    } catch (error) {
      console.error("[gestureService] Failed to get gesture by ID:", error);
      throw error;
    }
  }

  // Pagination support using local database
  async getGesturesPaginated(
    pageSize = 20,
    offset = 0
  ): Promise<{
    gestures: Gesture[];
    hasMore: boolean;
    total: number;
  }> {
    try {
      await this.ensureInitialized();
      await this.ensureLocalDataAvailable();

      logger.log(
        "[gestureService] getGesturesPaginated called with pageSize:",
        pageSize,
        "offset:",
        offset
      );

      const allGestures = await databaseService.getAllGestures();
      const total = allGestures.length;
      const start = offset;
      const end = start + pageSize;
      const gestures = allGestures.slice(start, end);
      const hasMore = end < total;

      logger.log(
        "[gestureService] Retrieved",
        total,
        "total gestures, returning",
        gestures.length,
        "gestures for this page, hasMore:",
        hasMore
      );

      return {
        gestures,
        hasMore,
        total,
      };
    } catch (error) {
      console.error(
        "[gestureService] Failed to get paginated gestures:",
        error
      );
      throw error;
    }
  }

  // Force sync with server
  async refreshData(): Promise<void> {
    try {
      await this.ensureInitialized();

      logger.log("[gestureService] Forcing data refresh from server");

      const result = await convexSyncService.forceSyncNow();

      if (result.success) {
        this.hasLocalData = true;
        // Rebuild search index with new data
        const gestures = await databaseService.getAllGestures();
        this.buildSearchIndex(gestures);
      }

      logger.log(
        `[gestureService] Data refresh completed - synced ${result.synced} gestures`
      );
    } catch (error) {
      console.error("[gestureService] Failed to refresh data:", error);
      throw error;
    }
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    isSyncing: boolean;
    lastSync: Date | null;
    nextSync: Date | null;
    gestureCount: number;
  }> {
    try {
      await this.ensureInitialized();

      const syncStatus = await convexSyncService.getSyncStatus();
      const gestureCount = await databaseService.getGestureCount();

      return {
        isSyncing: syncStatus.isSyncing,
        lastSync: syncStatus.lastSync,
        nextSync: syncStatus.nextSync,
        gestureCount,
      };
    } catch (error) {
      console.error("[gestureService] Failed to get sync status:", error);
      throw error;
    }
  }

  // Get statistics about the local database
  async getDatabaseStats(): Promise<{
    gestureCount: number;
    lastSync: Date | null;
    databaseSize: string;
  }> {
    try {
      await this.ensureInitialized();
      return await databaseService.getDatabaseStats();
    } catch (error) {
      console.error("[gestureService] Failed to get database stats:", error);
      throw error;
    }
  }

  // Clear all local data and re-sync
  async clearAllCaches(): Promise<void> {
    try {
      await this.ensureInitialized();

      logger.log("[gestureService] Clearing all local data");

      this.hasLocalData = false;
      this.ensuringDataPromise = null;

      await databaseService.clearAllGestures();
      this.searchIndex = {};
      this.isIndexBuilt = false;

      // Force a fresh sync
      const result = await convexSyncService.forceSyncNow();
      if (result.success) {
        this.hasLocalData = true;
      }
    } catch (error) {
      console.error("[gestureService] Failed to clear caches:", error);
      throw error;
    }
  }

  // Get cache statistics (for compatibility with old interface)
  async getCacheStats(): Promise<{ size: number; keys: string[] }> {
    try {
      const stats = await this.getDatabaseStats();
      return {
        size: stats.gestureCount,
        keys: ["sqlite_database"], // Simplified for compatibility
      };
    } catch (error) {
      console.error("[gestureService] Failed to get cache stats:", error);
      return { size: 0, keys: [] };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async ensureLocalDataAvailable(): Promise<void> {
    if (this.hasLocalData) {
      return;
    }

    if (await this.hasLocalGestures()) {
      this.hasLocalData = true;
      return;
    }

    if (!this.ensuringDataPromise) {
      this.ensuringDataPromise = this.waitForLocalDataPopulation();
    }

    try {
      await this.ensuringDataPromise;
    } finally {
      this.ensuringDataPromise = null;
    }
  }

  private async waitForLocalDataPopulation(): Promise<void> {
    logger.log(
      "[gestureService] Local database empty - waiting for Convex sync to populate gestures"
    );

    const startTime = Date.now();

    while (Date.now() - startTime < this.DATA_WAIT_TIMEOUT_MS) {
      await this.delay(this.DATA_POLL_INTERVAL_MS);
      if (await this.hasLocalGestures()) {
        this.hasLocalData = true;
        logger.log(
          `[gestureService] Local database populated after ${Date.now() - startTime}ms`
        );
        return;
      }
    }

    logger.warn(
      "[gestureService] Timed out waiting for gestures to populate locally"
    );
  }

  private async hasLocalGestures(): Promise<boolean> {
    try {
      const count = await databaseService.getGestureCount();
      return count > 0;
    } catch (error) {
      logger.error("[gestureService] Failed to read gesture count:", error);
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export const gestureService = new GestureService();
export default gestureService;
