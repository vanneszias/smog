import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

type NetworkMetrics = {
  lastConnected: Date | null;
  connectionEvents: number;
  disconnectionEvents: number;
  totalOfflineTime: number;
  averageConnectionQuality: number;
};

type NetworkQuality = {
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
  saveData: boolean | null;
};

class NetworkService {
  private static instance: NetworkService;
  private networkState: NetInfoState | null = null;
  private isInitialized = false;
  private readonly listeners: Array<(state: NetInfoState) => void> = [];
  private offlineStartTime: Date | null = null;

  // Cache keys
  private readonly NETWORK_METRICS_KEY = "network_metrics";
  private readonly OFFLINE_QUEUE_KEY = "offline_queue";

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Get initial network state
      this.networkState = await NetInfo.fetch();

      // Set up network state listener
      NetInfo.addEventListener(this.handleNetworkStateChange);

      // Initialize offline tracking
      if (!this.networkState.isConnected) {
        this.offlineStartTime = new Date();
      }

      this.isInitialized = true;
      console.log("✅ Network service initialized");
    } catch (error) {
      console.error("❌ Failed to initialize network service:", error);
    }
  }

  private readonly handleNetworkStateChange = async (state: NetInfoState) => {
    const wasOffline = this.networkState && !this.networkState.isConnected;
    const isNowOnline = state.isConnected ?? false;

    this.networkState = state;

    // Update metrics
    await this.updateNetworkMetrics(state, wasOffline ?? false, isNowOnline);

    // Process offline queue when coming back online
    if (wasOffline && isNowOnline) {
      await this.processOfflineQueue();
    }

    // Track offline duration
    if (!(isNowOnline || this.offlineStartTime)) {
      this.offlineStartTime = new Date();
    } else if (isNowOnline && this.offlineStartTime) {
      this.offlineStartTime = null;
    }

    // Notify listeners
    for (const listener of this.listeners) {
      listener(state);
    }
  };

  private async updateNetworkMetrics(
    _state: NetInfoState,
    wasOffline: boolean,
    isNowOnline: boolean
  ): Promise<void> {
    try {
      const metrics = await this.getNetworkMetrics();

      if (wasOffline && isNowOnline) {
        metrics.connectionEvents++;
        metrics.lastConnected = new Date();

        if (this.offlineStartTime) {
          const offlineDuration = Date.now() - this.offlineStartTime.getTime();
          metrics.totalOfflineTime += offlineDuration;
        }
      } else if (!(wasOffline || isNowOnline)) {
        metrics.disconnectionEvents++;
      }

      await this.saveNetworkMetrics(metrics);
    } catch (error) {
      console.error("Failed to update network metrics:", error);
    }
  }

  // Get current network state
  getCurrentState(): NetInfoState | null {
    return this.networkState;
  }

  // Check if device is connected to internet
  isConnected(): boolean {
    return !!(
      this.networkState?.isConnected && this.networkState?.isInternetReachable
    );
  }

  // Check if device is on WiFi
  isWiFi(): boolean {
    return this.networkState?.type === "wifi";
  }

  // Check if device is on cellular
  isCellular(): boolean {
    return this.networkState?.type === "cellular";
  }

  // Get connection type
  getConnectionType(): string | null {
    return this.networkState?.type || null;
  }

  // Get network quality information
  getNetworkQuality(): NetworkQuality {
    const details = this.networkState?.details as Record<string, unknown>;
    return {
      effectiveType: (details?.effectiveType as string) || null,
      downlink: (details?.downlink as number) || null,
      rtt: (details?.rtt as number) || null,
      saveData: (details?.saveData as boolean) || null,
    };
  }

  // Add network state change listener
  addListener(listener: (state: NetInfoState) => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Queue action for when network becomes available
  async queueOfflineAction(
    action: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const queue = await this.getOfflineQueue();
      queue.push({
        id: Date.now().toString(),
        action,
        data,
        timestamp: new Date().toISOString(),
      });
      await AsyncStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error("Failed to queue offline action:", error);
    }
  }

  // Process queued actions when network becomes available
  private async processOfflineQueue(): Promise<void> {
    try {
      const queue = await this.getOfflineQueue();
      if (queue.length === 0) {
        return;
      }

      console.log(`Processing ${queue.length} queued offline actions`);

      // Process each queued action
      for (const item of queue) {
        try {
          await this.processQueuedAction(item);
        } catch (error) {
          console.error("Failed to process queued action:", error);
        }
      }

      // Clear the queue
      await AsyncStorage.removeItem(this.OFFLINE_QUEUE_KEY);
    } catch (error) {
      console.error("Failed to process offline queue:", error);
    }
  }

  private async processQueuedAction(
    item: Record<string, unknown>
  ): Promise<void> {
    // This would be implemented based on your specific needs
    // For example, syncing favorites, uploading data, etc.
    console.log("Processing queued action:", item.action);
  }

  // Get network metrics
  async getNetworkMetrics(): Promise<NetworkMetrics> {
    try {
      const stored = await AsyncStorage.getItem(this.NETWORK_METRICS_KEY);
      if (stored) {
        const metrics = JSON.parse(stored);
        return {
          ...metrics,
          lastConnected: metrics.lastConnected
            ? new Date(metrics.lastConnected)
            : null,
        };
      }
    } catch (error) {
      console.error("Failed to get network metrics:", error);
    }

    return {
      lastConnected: null,
      connectionEvents: 0,
      disconnectionEvents: 0,
      totalOfflineTime: 0,
      averageConnectionQuality: 0,
    };
  }

  // Save network metrics
  private async saveNetworkMetrics(metrics: NetworkMetrics): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.NETWORK_METRICS_KEY,
        JSON.stringify(metrics)
      );
    } catch (error) {
      console.error("Failed to save network metrics:", error);
    }
  }

  // Get offline queue
  private async getOfflineQueue(): Promise<Record<string, unknown>[]> {
    try {
      const stored = await AsyncStorage.getItem(this.OFFLINE_QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Failed to get offline queue:", error);
      return [];
    }
  }

  // Clear all network data
  async clearNetworkData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.NETWORK_METRICS_KEY,
        this.OFFLINE_QUEUE_KEY,
      ]);
    } catch (error) {
      console.error("Failed to clear network data:", error);
    }
  }

  // Get current offline duration
  getCurrentOfflineDuration(): number {
    if (!this.offlineStartTime || this.isConnected()) {
      return 0;
    }
    return Date.now() - this.offlineStartTime.getTime();
  }

  // Check if connection is good for heavy operations
  isGoodConnection(): boolean {
    if (!this.isConnected()) {
      return false;
    }

    const quality = this.getNetworkQuality();

    // Consider WiFi as always good
    if (this.isWiFi()) {
      return true;
    }

    // For cellular, check effective type
    if (this.isCellular()) {
      const effectiveType = quality.effectiveType;
      return effectiveType === "4g" || effectiveType === "5g";
    }

    return true;
  }

  // Refresh network state
  async refresh(): Promise<NetInfoState> {
    try {
      this.networkState = await NetInfo.fetch();
      return this.networkState;
    } catch (error) {
      console.error("Failed to refresh network state:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const networkService = NetworkService.getInstance();
export { NetworkService };
export default networkService;
