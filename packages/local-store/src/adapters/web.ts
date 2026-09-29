import type { StorageAdapter } from "../store";
import { createMemoryAdapter } from "./memory";

export interface SyncStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): SyncStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Access itself can throw (blocked site data).
    return undefined;
  }
}

/**
 * localStorage, falling back to memory when it is missing (SSR) or throws
 * (private mode, quota, blocked storage). A failed call switches to memory
 * for the rest of the session, so the data stays consistent.
 */
export function createWebAdapter(
  storage: SyncStorage | undefined = browserStorage()
): StorageAdapter {
  const memory = createMemoryAdapter();
  let useMemory = storage === undefined;

  const run = async <T>(
    onStorage: (s: SyncStorage) => T,
    onMemory: () => Promise<T>
  ): Promise<T> => {
    if (!(useMemory || storage === undefined)) {
      try {
        return onStorage(storage);
      } catch {
        useMemory = true;
      }
    }
    return await onMemory();
  };

  const canListen =
    storage !== undefined && typeof globalThis.addEventListener === "function";

  return {
    getItem: (key) =>
      run(
        (s) => s.getItem(key),
        () => memory.getItem(key)
      ),
    removeItem: (key) =>
      run(
        (s) => s.removeItem(key),
        () => memory.removeItem(key)
      ),
    setItem: (key, value) =>
      run(
        (s) => s.setItem(key, value),
        () => memory.setItem(key, value)
      ),
    subscribe: canListen
      ? (key, onChange) => {
          const handler = (event: Event): void => {
            const { key: changed, storageArea } = event as StorageEvent;
            if (
              (changed === null || changed === key) &&
              (storageArea === null || storageArea === storage)
            ) {
              onChange();
            }
          };
          globalThis.addEventListener("storage", handler);
          return () => globalThis.removeEventListener("storage", handler);
        }
      : undefined,
  };
}

export const webAdapter: StorageAdapter = createWebAdapter();
