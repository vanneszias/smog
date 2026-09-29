import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  defaultShouldDehydrateQuery,
  type OmitKeyof,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  type PersistedClient,
  type PersistQueryClientOptions,
  removeOldestQuery,
} from "@tanstack/react-query-persist-client";

/** The AsyncStorage key of the persisted query cache. */
export const QUERY_CACHE_KEY = "smog:query-cache:v1";

/** Persisted queries are restored for a day (spec §10). */
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * The procedures kept offline: public catalogue reads, plus the signed-in
 * user's favorite ids (the hearts). Searches (one entry per query), lists
 * and favorite pages stay online only. `gestures.byIds`/`related` fill the
 * favorites, lists and the gesture screen from the same catalogue.
 */
const PUBLIC_PROCEDURES = [
  "gestures.list",
  "gestures.categories",
  "gestures.bySlug",
  "gestures.byIds",
  "gestures.related",
] as const;
const USER_PROCEDURES = ["favorites.ids"] as const;

/** `["gestures","list"]` from an oRPC key (`[path, { input, type }]`). */
function procedureOf(queryKey: QueryKey): string | undefined {
  const [path] = queryKey;
  return Array.isArray(path) ? path.join(".") : undefined;
}

/** The `userScopedKey` user, when the key has one and it is a user id. */
function scopedUser(queryKey: QueryKey): string | undefined {
  const scope = queryKey.at(-1);
  if (typeof scope === "object" && scope !== null && "user" in scope) {
    const { user } = scope as { user: unknown };
    return typeof user === "string" ? user : undefined;
  }
}

/**
 * Whether a query goes to disk: a successful public catalogue read, or a
 * user's favorite ids (scoped to that user; `<PurgeOtherUsers />` drops
 * another user's from the cache, and so from the next write).
 */
function shouldPersistQuery(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) {
    return false;
  }
  const procedure = procedureOf(query.queryKey);
  if (
    (PUBLIC_PROCEDURES as readonly (string | undefined)[]).includes(procedure)
  ) {
    return true;
  }
  return (
    (USER_PROCEDURES as readonly (string | undefined)[]).includes(procedure) &&
    scopedUser(query.queryKey) !== undefined
  );
}

/** The cache buster: a cache written by another app version is dropped. */
export function cacheBuster(appVersion: string | null | undefined): string {
  return appVersion || "dev";
}

function isInfiniteData(
  data: unknown
): data is { pageParams: unknown[]; pages: unknown[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { pageParams?: unknown }).pageParams) &&
    Array.isArray((data as { pages?: unknown }).pages)
  );
}

/**
 * JSON turns the first page's `undefined` cursor into `null`, which the
 * refetch would send (`cursor: null` fails the contract). The persisted
 * infinite queries take `string | undefined` cursors, so `null` is put back.
 */
function deserializeCache(cached: string): PersistedClient {
  const client = JSON.parse(cached) as PersistedClient;
  for (const query of client.clientState?.queries ?? []) {
    const { data } = query.state;
    if (isInfiniteData(data)) {
      data.pageParams = data.pageParams.map((param) => param ?? undefined);
    }
  }
  return client;
}

/** AsyncStorage's shape (the persister needs only these). */
export interface PersistStorage {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface CreatePersistOptions {
  buster: string;
  storage: PersistStorage;
  /** Writes are throttled (1 s by default). */
  throttleTime?: number;
}

/**
 * `PersistQueryClientProvider`'s options: AsyncStorage, 24 h, the app
 * version as buster, and only `shouldPersistQuery` queries. When the
 * storage refuses a write (full), the oldest query is dropped and retried.
 */
export function createPersistOptions({
  buster,
  storage,
  throttleTime,
}: CreatePersistOptions): OmitKeyof<PersistQueryClientOptions, "queryClient"> {
  return {
    buster,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
    maxAge: QUERY_CACHE_MAX_AGE,
    persister: createAsyncStoragePersister({
      deserialize: deserializeCache,
      key: QUERY_CACHE_KEY,
      retry: removeOldestQuery,
      storage,
      ...(throttleTime === undefined ? {} : { throttleTime }),
    }),
  };
}

/**
 * Persisted queries stay in memory as long as they are kept on disk
 * (TanStack: `gcTime` ≥ `maxAge`), or a restored entry nobody is showing
 * would be collected after 5 minutes and dropped from the next write.
 */
export function keepPersistedQueries(queryClient: QueryClient): void {
  for (const procedure of [...PUBLIC_PROCEDURES, ...USER_PROCEDURES]) {
    queryClient.setQueryDefaults([procedure.split(".")], {
      gcTime: QUERY_CACHE_MAX_AGE,
    });
  }
}
