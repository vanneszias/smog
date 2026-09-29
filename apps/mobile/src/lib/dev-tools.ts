import { useSyncExternalStore } from "react";

/**
 * Developer tools (component gallery, logs) exist in dev and staging builds
 * only (spec §10). Expo inlines `EXPO_PUBLIC_ENVIRONMENT` at build time; a
 * build without it is a local one, which counts as dev.
 */
export function devToolsAvailable(): boolean {
  return process.env.EXPO_PUBLIC_ENVIRONMENT !== "production";
}

/** Taps on Settings → Version that reveal the developer tools. */
export const DEV_TOOLS_TAPS = 5;

export interface DevToolsUnlock {
  isUnlocked: () => boolean;
  subscribe: (listener: () => void) => () => void;
  /** Counts a tap; returns the taps still needed (0 once unlocked). */
  tap: () => number;
}

/** The unlock counter; `available` is false in production builds. */
export function createDevToolsUnlock(available: boolean): DevToolsUnlock {
  let taps = 0;
  const listeners = new Set<() => void>();
  const isUnlocked = (): boolean => available && taps >= DEV_TOOLS_TAPS;
  return {
    isUnlocked,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tap: () => {
      if (!available) {
        return DEV_TOOLS_TAPS;
      }
      if (isUnlocked()) {
        return 0;
      }
      taps += 1;
      if (isUnlocked()) {
        for (const listener of listeners) {
          listener();
        }
      }
      return DEV_TOOLS_TAPS - taps;
    },
  };
}

/** One counter per app run: the tools stay unlocked until the app restarts. */
const appUnlock = createDevToolsUnlock(devToolsAvailable());

export function useDevToolsUnlock(): { tap: () => number; unlocked: boolean } {
  const unlocked = useSyncExternalStore(
    appUnlock.subscribe,
    appUnlock.isUnlocked,
    appUnlock.isUnlocked
  );
  return { tap: appUnlock.tap, unlocked };
}
