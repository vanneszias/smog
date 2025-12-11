import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { convexSyncService } from "@/services/convexSyncService";

/**
 * Hook to automatically check for updates when the app comes to foreground
 * This ensures users get fresh data when they open the app
 */
export const useAutoSync = () => {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const isAppComingToForeground = (
      currentState: string,
      nextState: AppStateStatus
    ) => currentState.match(/inactive|background/) && nextState === "active";

    const performSyncCheck = async () => {
      if (__DEV__) {
        console.log(
          "[useAutoSync] App came to foreground, checking for updates"
        );
      }

      try {
        await convexSyncService.checkForUpdates();
      } catch (error) {
        if (__DEV__) {
          console.log("[useAutoSync] Failed to check for updates:", error);
        }
      }
    };

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (isAppComingToForeground(appState.current, nextAppState)) {
        await performSyncCheck();
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription?.remove();
    };
  }, []);
};
