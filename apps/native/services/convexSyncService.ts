import type { ConvexReactClient } from "convex/react";
import { convexService } from "@/services/convexService";
import { databaseService } from "@/services/databaseService";
import { NetworkService } from "@/services/networkService";

type SyncResult = {
  success: boolean;
  synced: number;
  errors: string[];
  timestamp: Date;
};

class ConvexSyncService {
  private static instance: ConvexSyncService;
  private isSyncing = false;
  private isInitializing = false;
  private isInitialized = false;
  private lastSyncAttempt: Date | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  // Sync configuration
  private readonly SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly SYNC_RETRY_DELAY = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_SYNC_RETRIES = 3;

  static getInstance(): ConvexSyncService {
    if (!ConvexSyncService.instance) {
      ConvexSyncService.instance = new ConvexSyncService();
    }
    return ConvexSyncService.instance;
  }

  async initialize(convexClient: ConvexReactClient): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.isInitializing) {
      await this.waitForInitialization();
      return;
    }

    await this.performInitialization(convexClient);
  }

  private async waitForInitialization(): Promise<void> {
    while (this.isInitializing && !this.isInitialized) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async performInitialization(
    convexClient: ConvexReactClient
  ): Promise<void> {
    this.isInitializing = true;

    try {
      await databaseService.initialize();
      await convexService.initialize(convexClient);
      await this.checkAndPerformInitialSync();
      this.startPeriodicSync();
      this.isInitialized = true;

      if (__DEV__) {
        console.log("[convexSyncService] Sync service initialized");
      }
    } catch (error) {
      console.error("[convexSyncService] Failed to initialize:", error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  private async checkAndPerformInitialSync(): Promise<void> {
    const lastSync = await databaseService.getLastSyncTime();
    const gestureCount = await databaseService.getGestureCount();
    const categoryCount = await databaseService.getCategoryCount();

    if (__DEV__) {
      console.log(
        `[convexSyncService] Initialization check - lastSync: ${lastSync?.toISOString() || "null"}, gestureCount: ${gestureCount}, categoryCount: ${categoryCount}`
      );
    }

    // Check network status before attempting sync
    const networkService = NetworkService.getInstance();
    const isOnline = networkService.isConnected();

    if (!isOnline) {
      if (gestureCount > 0) {
        if (__DEV__) {
          console.log(
            "[convexSyncService] Offline mode - skipping initial sync, using cached data"
          );
        }
        return;
      }
      if (__DEV__) {
        console.log(
          "[convexSyncService] Offline mode - no cached data available, app will have limited functionality"
        );
      }
      return;
    }

    if (this.shouldPerformInitialSync(gestureCount, categoryCount, lastSync)) {
      await this.performSync(true);
    } else if (__DEV__) {
      console.log("[convexSyncService] Initial sync not needed - data exists");
    }
  }

  private shouldPerformInitialSync(
    gestureCount: number,
    categoryCount: number,
    lastSync: Date | null
  ): boolean {
    if (gestureCount === 0) {
      if (__DEV__) {
        console.log(
          "[convexSyncService] Initial sync needed - no gestures in database"
        );
      }
      return true;
    }

    if (categoryCount === 0) {
      if (__DEV__) {
        console.log(
          "[convexSyncService] Initial sync needed - no categories in database"
        );
      }
      return true;
    }

    if (!lastSync) {
      if (__DEV__) {
        console.log(
          "[convexSyncService] Initial sync needed - no sync timestamp"
        );
      }
      return true;
    }

    return false;
  }

  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.syncIfNeeded();
    }, this.SYNC_INTERVAL_MS);

    if (__DEV__) {
      console.log("[convexSyncService] Periodic sync started");
    }
  }

  async syncIfNeeded(force = false): Promise<SyncResult | null> {
    if (!this.isNetworkSuitable()) {
      return null;
    }

    if (force) {
      return this.performSync(force);
    }

    const shouldSync = await this.checkIfSyncRequired();
    if (!shouldSync) {
      return null;
    }

    return this.performSync(force);
  }

  private isNetworkSuitable(): boolean {
    const networkService = NetworkService.getInstance();
    if (!(networkService.isConnected() && networkService.isGoodConnection())) {
      if (__DEV__) {
        console.log(
          "[convexSyncService] Skipping sync - poor network connection"
        );
      }
      return false;
    }
    return true;
  }

  private async checkIfSyncRequired(): Promise<boolean> {
    try {
      const remoteLastUpdated = await convexService.getLastUpdated();
      if (!remoteLastUpdated) {
        return true; // No remote data, sync anyway
      }

      const localLastSync = await databaseService.getLastSyncTime();
      if (!localLastSync) {
        return true; // No local sync time, need to sync
      }

      // Check if remote data is newer than local sync
      const shouldSync = remoteLastUpdated > localLastSync.getTime();

      if (shouldSync) {
        if (__DEV__) {
          console.log(
            "[convexSyncService] Sync needed - remote data has been updated"
          );
        }
        return true;
      }

      return this.checkTimeBasedSync();
    } catch (error) {
      if (__DEV__) {
        console.log(
          "[convexSyncService] Failed to check remote version, falling back to time-based sync:",
          error
        );
      }
      return this.checkTimeBasedSync();
    }
  }

  private async checkTimeBasedSync(): Promise<boolean> {
    const lastSync = await databaseService.getLastSyncTime();
    if (!lastSync) {
      return true;
    }

    const now = new Date();
    const timeSinceLastSync = now.getTime() - lastSync.getTime();

    if (timeSinceLastSync < this.SYNC_INTERVAL_MS) {
      if (__DEV__) {
        console.log(
          "[convexSyncService] Sync not needed - within time interval"
        );
      }
      return false;
    }

    return true;
  }

  async performSync(isInitialSync = false): Promise<SyncResult> {
    this.validateSyncPreconditions();

    this.isSyncing = true;
    this.lastSyncAttempt = new Date();

    const result = this.createEmptySyncResult();

    try {
      await this.executeSyncProcess(isInitialSync, result);
    } catch (error) {
      this.handleSyncError(error, result);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  private validateSyncPreconditions(): void {
    if (this.isSyncing) {
      if (__DEV__) {
        console.log("[convexSyncService] Sync already in progress");
      }
      throw new Error("Sync already in progress");
    }
  }

  private createEmptySyncResult(): SyncResult {
    return {
      success: false,
      synced: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  private async executeSyncProcess(
    isInitialSync: boolean,
    result: SyncResult
  ): Promise<void> {
    if (__DEV__) {
      console.log(
        `[convexSyncService] Starting ${isInitialSync ? "initial" : "incremental"} sync`
      );
    }

    // Sync categories first
    const categories = await convexService.getAllCategories();

    if (isInitialSync) {
      await databaseService.clearAllCategories();
    }

    for (const category of categories) {
      await databaseService.insertCategory(
        {
          id: category.id,
          name: category.name,
        },
        category.convexId
      );
    }

    // Sync gestures (categories are already resolved by convexService)
    const gesturesData = await convexService.getAllGestures();

    if (isInitialSync) {
      await databaseService.clearAllGestures();
    }

    // Gestures already have resolved categories from convexService
    for (const { gesture, convexId } of gesturesData) {
      await databaseService.insertGesture(gesture, convexId);
    }

    await databaseService.setLastSyncTime(new Date());

    result.success = true;
    result.synced = gesturesData.length;

    if (__DEV__) {
      console.log(
        `[convexSyncService] Sync completed successfully - ${gesturesData.length} gestures, ${categories.length} categories`
      );
    }
  }

  private handleSyncError(error: unknown, result: SyncResult): void {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    result.errors.push(errorMessage);
    console.error("[convexSyncService] Sync failed:", error);

    this.scheduleRetryIfPossible();
  }

  private scheduleRetryIfPossible(): void {
    const networkService = NetworkService.getInstance();
    if (networkService.isConnected()) {
      setTimeout(() => {
        this.retrySync();
      }, this.SYNC_RETRY_DELAY);
    }
  }

  private async retrySync(attempt = 1): Promise<void> {
    if (attempt > this.MAX_SYNC_RETRIES) {
      console.error("[convexSyncService] Max sync retries exceeded");
      return;
    }

    try {
      await this.performSync();
    } catch (_error) {
      if (__DEV__) {
        console.log(
          `[convexSyncService] Retry ${attempt} failed, attempting again...`
        );
      }
      setTimeout(() => {
        this.retrySync(attempt + 1);
      }, this.SYNC_RETRY_DELAY * attempt); // Exponential backoff
    }
  }

  async forceSyncNow(): Promise<SyncResult> {
    return this.performSync(true);
  }

  async checkForUpdates(): Promise<SyncResult | null> {
    if (__DEV__) {
      console.log("[convexSyncService] Checking for updates...");
    }
    return this.syncIfNeeded(false);
  }

  async getSyncStatus(): Promise<{
    isSyncing: boolean;
    lastSync: Date | null;
    lastAttempt: Date | null;
    nextSync: Date | null;
  }> {
    const lastSync = await databaseService.getLastSyncTime();
    const nextSync = lastSync
      ? new Date(lastSync.getTime() + this.SYNC_INTERVAL_MS)
      : null;

    return {
      isSyncing: this.isSyncing,
      lastSync,
      lastAttempt: this.lastSyncAttempt,
      nextSync,
    };
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  destroy(): void {
    this.stopPeriodicSync();
    this.isSyncing = false;
    this.isInitialized = false;
    this.isInitializing = false;
  }
}

export const convexSyncService = ConvexSyncService.getInstance();
export default convexSyncService;
