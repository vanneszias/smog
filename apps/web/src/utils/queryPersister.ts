import type { Query } from "@tanstack/react-query";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

const STORAGE_KEY = "REACT_QUERY_OFFLINE_CACHE";
const CACHE_VERSION = "v1"; // Increment to invalidate all caches
const VERSION_KEY = "SMOG_CACHE_VERSION";
const MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

// Check version on load and clear old caches if version changed
const storedVersion = localStorage.getItem(VERSION_KEY);
if (storedVersion !== CACHE_VERSION) {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(VERSION_KEY, CACHE_VERSION);
}

// Create a persister that uses localStorage
const persister: Persister = {
  persistClient: async (client: PersistedClient) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(client));
  },
  restoreClient: async () => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) {
      return;
    }
    return JSON.parse(cached) as PersistedClient;
  },
  removeClient: async () => {
    localStorage.removeItem(STORAGE_KEY);
  },
};

export const persistOptions = {
  persister,
  maxAge: MAX_AGE,
  buster: CACHE_VERSION,
  // Only persist the gesture catalog query, not auth or user list state.
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.queryKey[0] === "gestures" && query.queryKey[1] === "list",
  },
};
