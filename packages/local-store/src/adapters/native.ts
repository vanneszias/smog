import type { StorageAdapter } from "../store";

/** The part of AsyncStorage the store uses. */
export interface AsyncStorageLike {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
}

export function createAsyncStorageAdapter(
  storage: AsyncStorageLike
): StorageAdapter {
  return {
    getItem: (key) => storage.getItem(key),
    removeItem: (key) => storage.removeItem(key),
    setItem: (key, value) => storage.setItem(key, value),
  };
}

/**
 * AsyncStorage from `@react-native-async-storage/async-storage`, an optional
 * peer dependency. It is loaded on first use, so importing this module never
 * fails where the package is missing (web, tests).
 */
export const nativeAdapter: StorageAdapter = (() => {
  let storage: Promise<AsyncStorageLike> | undefined;
  const load = (): Promise<AsyncStorageLike> => {
    storage ??= import("@react-native-async-storage/async-storage").then(
      (module) => module.default
    );
    return storage;
  };
  return {
    getItem: async (key) => (await load()).getItem(key),
    removeItem: async (key) => (await load()).removeItem(key),
    setItem: async (key, value) => (await load()).setItem(key, value),
  };
})();
