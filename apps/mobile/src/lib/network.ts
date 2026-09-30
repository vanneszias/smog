import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";

/**
 * NetInfo reports `isConnected: null` until it knows; that counts as
 * online, so nothing waits (or shows the offline banner) on launch.
 */
function isOnline(isConnected: boolean | null): boolean {
  return isConnected !== false;
}

/**
 * TanStack Query on React Native (its docs): queries pause while offline
 * and refetch on reconnect (NetInfo), and stale queries refetch when the
 * app comes back to the foreground (AppState). Called once by the root.
 */
export function connectQueryToDevice(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(isOnline(state.isConnected));
    })
  );
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        setFocused(status === "active");
      }
    );
    return () => subscription.remove();
  });
  return () => {
    onlineManager.setEventListener(() => undefined);
    focusManager.setEventListener(() => undefined);
  };
}

/** Whether the device is online (for the OfflineBanner). */
export function useOnline(): boolean {
  return isOnline(useNetInfo().isConnected);
}
