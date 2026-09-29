import {
  addRecentSearch,
  clearRecentSearches,
  type GuestData,
} from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useCallback } from "react";

function selectRecentSearches(data: GuestData): string[] {
  return data.recentSearches;
}

export interface RecentSearches {
  /** Stores a submitted query (trimmed, deduped, newest first, at most 10). */
  add: (query: string) => Promise<void>;
  clear: () => Promise<void>;
  /** Newest first. */
  items: string[];
}

/**
 * Recent searches, always on the device (spec §11), for guests and signed-in
 * users alike: they never reach the server or analytics.
 */
export function useRecentSearches(): RecentSearches {
  const store = useLocalStoreInstance();
  const items = useLocalStore(selectRecentSearches);
  const add = useCallback(
    (query: string) => store.update(addRecentSearch(query)),
    [store]
  );
  const clear = useCallback(() => store.update(clearRecentSearches()), [store]);
  return { add, clear, items };
}
