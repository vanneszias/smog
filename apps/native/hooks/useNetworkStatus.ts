import type { NetInfoState } from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";
import { networkService } from "@/services/networkService";

interface NetworkStatus {
  isConnected: boolean;
  isOffline: boolean;
  lastChecked: Date;
  type: string | null;
  isWifi: boolean;
  isCellular: boolean;
  isInternetReachable: boolean | null;
  isGoodConnection: boolean;
  offlineDuration: number;
}

export const useNetworkStatus = () => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isConnected: true,
    isOffline: false,
    lastChecked: new Date(),
    type: null,
    isWifi: false,
    isCellular: false,
    isInternetReachable: null,
    isGoodConnection: true,
    offlineDuration: 0,
  });

  const updateStatus = useCallback(() => {
    const state = networkService.getCurrentState();
    if (!state) {
      return;
    }

    setNetworkStatus({
      isConnected: networkService.isConnected(),
      isOffline: !networkService.isConnected(),
      lastChecked: new Date(),
      type: networkService.getConnectionType(),
      isWifi: networkService.isWiFi(),
      isCellular: networkService.isCellular(),
      isInternetReachable: state.isInternetReachable,
      isGoodConnection: networkService.isGoodConnection(),
      offlineDuration: networkService.getCurrentOfflineDuration(),
    });
  }, []);

  const handleNetworkChange = useCallback(
    (_state: NetInfoState) => {
      updateStatus();
    },
    [updateStatus]
  );

  useEffect(() => {
    // Initialize network service
    networkService.initialize().then(() => {
      updateStatus();
    });

    // Subscribe to network changes
    const unsubscribe = networkService.addListener(handleNetworkChange);

    return () => {
      unsubscribe();
    };
  }, [handleNetworkChange, updateStatus]);

  const checkConnectivity = useCallback(async () => {
    try {
      const state = await networkService.refresh();
      updateStatus();
      return state.isConnected && state.isInternetReachable;
    } catch (error) {
      console.error("Error checking connectivity:", error);
      return false;
    }
  }, [updateStatus]);

  const queueOfflineAction = useCallback(
    async (action: string, data: Record<string, unknown>) =>
      networkService.queueOfflineAction(action, data),
    []
  );

  const getNetworkMetrics = useCallback(
    async () => networkService.getNetworkMetrics(),
    []
  );

  const clearNetworkData = useCallback(
    async () => networkService.clearNetworkData(),
    []
  );

  return {
    ...networkStatus,
    checkConnectivity,
    queueOfflineAction,
    getNetworkMetrics,
    clearNetworkData,
    networkService, // Expose service for advanced usage
  };
};

// Hook for offline-aware data fetching with retry logic
export const useOfflineAware = <T>(
  fetchFunction: () => Promise<T>,
  dependencies: React.DependencyList = [],
  options: {
    retryOnReconnect?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
  } = {}
) => {
  const { isOffline, isGoodConnection, queueOfflineAction } =
    useNetworkStatus();

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, _setRetryCount] = useState(0);

  const {
    retryOnReconnect = true,
    retryAttempts = 3,
    retryDelay = 1000,
  } = options;

  // Helper function to handle offline state
  const handleOfflineState = useCallback(async () => {
    setError(
      new Error(
        "Network unavailable. Action queued for when connection is restored."
      )
    );
    if (queueOfflineAction) {
      await queueOfflineAction("fetch_data", {
        functionName: fetchFunction.name,
        dependencies,
      });
    }
  }, [queueOfflineAction, fetchFunction.name, dependencies]);

  // Helper function to handle retry logic
  const handleRetry = useCallback(
    (
      attempt: number,
      retryDelay: number,
      fetchFn: (attempt: number) => Promise<void>
    ) => {
      setTimeout(() => {
        fetchFn(attempt + 1);
      }, retryDelay);
    },
    []
  );

  const fetchData = useCallback(
    async (attempt = 1): Promise<void> => {
      if (isOffline) {
        await handleOfflineState();
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const result = await fetchFunction();
        setData(result);
      } catch (err) {
        if (attempt < retryAttempts && retryOnReconnect) {
          handleRetry(attempt, retryDelay, fetchData);
        } else {
          setError(
            err instanceof Error ? err : new Error("Failed to fetch data")
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      fetchFunction,
      isOffline,
      handleOfflineState,
      retryOnReconnect,
      retryAttempts,
      retryDelay,
      handleRetry,
    ]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData, ...dependencies]);

  // Retry when coming back online
  useEffect(() => {
    if (!isOffline && error && retryOnReconnect) {
      fetchData();
    }
  }, [isOffline, error, retryOnReconnect, fetchData]);

  return {
    data,
    isLoading,
    error,
    retryCount,
    refetch: () => fetchData(),
    isOffline,
    isGoodConnection,
  };
};

// Hook for monitoring network quality
export const useNetworkQuality = () => {
  const { networkService } = useNetworkStatus();
  const [quality, setQuality] = useState(networkService.getNetworkQuality());

  useEffect(() => {
    const updateQuality = () => {
      setQuality(networkService.getNetworkQuality());
    };

    const unsubscribe = networkService.addListener(updateQuality);
    return unsubscribe;
  }, [networkService]);

  return quality;
};
