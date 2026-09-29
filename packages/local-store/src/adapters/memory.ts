import type { StorageAdapter } from "../store";

/** In-memory storage: tests, SSR and the web fallback. */
export function createMemoryAdapter(
  initial: Record<string, string> = {}
): StorageAdapter {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => Promise.resolve(items.get(key) ?? null),
    removeItem: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
    setItem: (key, value) => {
      items.set(key, value);
      return Promise.resolve();
    },
  };
}
