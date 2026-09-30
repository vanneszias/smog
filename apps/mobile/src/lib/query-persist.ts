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
 * The largest cache written to AsyncStorage (UTF-8 bytes). Android reads a
 * row through a CursorWindow of about 2 MB, and a failed read drops the
 * whole cache, so a larger one is trimmed, oldest query first.
 */
const QUERY_CACHE_MAX_BYTES = 1024 * 1024;

/**
 * The procedures kept offline: public catalogue reads, plus the signed-in
 * user's favorites (the hearts and the favorites tab). Searches (one entry
 * per query) and lists stay online only. `gestures.byIds`/`related` fill
 * the guest favorites, lists and the gesture screen from the same
 * catalogue (the guest's `byIds` pages are guest-scoped: one variant is
 * kept by `useFavorites`, and a sign-in drops it).
 */
const PUBLIC_PROCEDURES = [
  "gestures.list",
  "gestures.categories",
  "gestures.bySlug",
  "gestures.byIds",
  "gestures.related",
] as const;
const USER_PROCEDURES = ["favorites.ids", "favorites.list"] as const;

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

/** What identifies the running JS bundle (`expo-constants`, `expo-updates`). */
export interface BundleIdentity {
  /** `expo-updates` `runtimeVersion` (the fingerprint), for the embedded bundle. */
  runtimeVersion?: string | null;
  /** `expo-updates` `updateId`: set when an OTA update is running. */
  updateId?: string | null;
  /** The app version (`expoConfig.version`). */
  version?: string | null;
}

/**
 * The cache buster: a cache written by another app version or another JS
 * bundle (an EAS Update keeps the app version) is dropped, so an old
 * output shape is never restored into new code.
 */
export function cacheBuster({
  runtimeVersion,
  updateId,
  version,
}: BundleIdentity): string {
  return `${version || "dev"}:${updateId || runtimeVersion || "embedded"}`;
}

/** UTF-8 bytes of `text` (what AsyncStorage stores). */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** `JSON.stringify`, refusing a cache above `maxBytes` (the retry trims it). */
function serializeWithin(
  maxBytes: number
): (client: PersistedClient) => string {
  return (client) => {
    const serialized = JSON.stringify(client);
    if (byteLength(serialized) > maxBytes) {
      throw new Error(
        `[query-persist] The cache is over ${maxBytes} bytes; trimming`
      );
    }
    return serialized;
  };
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
  /** The largest cache written (`QUERY_CACHE_MAX_BYTES` by default). */
  maxBytes?: number;
  storage: PersistStorage;
  /** Writes are throttled (1 s by default). */
  throttleTime?: number;
}

/**
 * `PersistQueryClientProvider`'s options: AsyncStorage, 24 h, the bundle
 * as buster, and only `shouldPersistQuery` queries. When the cache is over
 * `maxBytes` or the storage refuses a write (full), the oldest query is
 * dropped and the write retried.
 */
export function createPersistOptions({
  buster,
  maxBytes = QUERY_CACHE_MAX_BYTES,
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
      serialize: serializeWithin(maxBytes),
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
