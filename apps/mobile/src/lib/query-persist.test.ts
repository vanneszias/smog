import { afterEach, describe, expect, it } from "@jest/globals";
import { createApiClient, createApiQueryUtils } from "@smog/api/client";
import { userScopedKey } from "@smog/rpc/react";
import { QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import {
  cacheBuster,
  createPersistOptions,
  QUERY_CACHE_KEY,
  QUERY_CACHE_MAX_AGE,
} from "./query-persist";

const rpc = createApiQueryUtils(createApiClient({ baseUrl: "https://t.test" }));

const clients: QueryClient[] = [];

/** No garbage-collection timers, so Jest can exit; cleared after each test. */
function newClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear();
  }
});

const HOND = {
  categories: [{ name: "Dieren", slug: "dieren" }],
  id: "g1",
  name: "Hond",
  playbackId: "pb1",
  slug: "hond",
};

/** AsyncStorage's API over a Map, so the test sees what was written. */
function memoryStorage(): {
  getItem: (key: string) => Promise<string | null>;
  map: Map<string, string>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
} {
  const map = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    map,
    removeItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

async function waitForWrite(storage: ReturnType<typeof memoryStorage>) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (storage.map.has(QUERY_CACHE_KEY)) {
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling for the throttled write
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The cache was never written");
}

const keys = {
  bySlug: rpc.gestures.bySlug.queryKey({ input: { slug: "hond" } }),
  categories: rpc.gestures.categories.queryKey(),
  favoritesIds: userScopedKey(rpc.favorites.ids.key({ type: "query" }), "u1"),
  favoritesList: userScopedKey(
    rpc.favorites.list.key({ type: "infinite" }),
    "u1"
  ),
  guestIds: userScopedKey(rpc.favorites.ids.key({ type: "query" }), undefined),
  list: rpc.gestures.list.infiniteKey({
    initialPageParam: undefined,
    input: (cursor: string | undefined) => ({ cursor }),
  }),
  mine: userScopedKey(rpc.lists.mine.queryKey(), "u1"),
  search: rpc.gestures.search.queryKey({ input: { q: "hond" } }),
};

function fillCache(queryClient: QueryClient): void {
  queryClient.setQueryData(keys.list, {
    pageParams: [undefined],
    pages: [{ items: [HOND], nextCursor: null }],
  });
  queryClient.setQueryData(keys.categories, [
    { gestureCount: 1, name: "Dieren", slug: "dieren" },
  ]);
  queryClient.setQueryData(keys.bySlug, {
    ...HOND,
    canonicalSlug: "hond",
    description: "",
    keywords: [],
    sponsor: null,
  });
  queryClient.setQueryData(keys.favoritesIds, ["g1"]);
  queryClient.setQueryData(keys.guestIds, ["g9"]);
  queryClient.setQueryData(keys.favoritesList, {
    pageParams: [undefined],
    pages: [{ items: [HOND], nextCursor: null }],
  });
  queryClient.setQueryData(keys.mine, [{ id: "l1", name: "Les 1" }]);
  queryClient.setQueryData(keys.search, {
    items: [{ ...HOND, matchedField: "name", matchType: "exact", score: 1 }],
    total: 1,
  });
}

async function persistAndRestore(
  storage: ReturnType<typeof memoryStorage>,
  { restoreBuster = "v1" }: { restoreBuster?: string } = {}
): Promise<QueryClient> {
  const source = newClient();
  fillCache(source);
  await persistQueryClientSave({
    queryClient: source,
    ...createPersistOptions({ buster: "v1", storage, throttleTime: 0 }),
  });
  await waitForWrite(storage);
  const restored = newClient();
  await persistQueryClientRestore({
    queryClient: restored,
    ...createPersistOptions({
      buster: restoreBuster,
      storage,
      throttleTime: 0,
    }),
  });
  return restored;
}

describe("the offline query cache", () => {
  it("restores the catalogue and the user's favorite ids", async () => {
    const restored = await persistAndRestore(memoryStorage());
    expect(restored.getQueryData(keys.list)).toEqual({
      pageParams: [undefined],
      pages: [{ items: [HOND], nextCursor: null }],
    });
    expect(restored.getQueryData(keys.categories)).toHaveLength(1);
    expect(restored.getQueryData(keys.bySlug)).toMatchObject({ slug: "hond" });
    expect(restored.getQueryData(keys.favoritesIds)).toEqual(["g1"]);
  });

  it("never persists searches, lists, favorite pages or unscoped ids", async () => {
    const storage = memoryStorage();
    const restored = await persistAndRestore(storage);
    expect(restored.getQueryData(keys.search)).toBeUndefined();
    expect(restored.getQueryData(keys.mine)).toBeUndefined();
    expect(restored.getQueryData(keys.favoritesList)).toBeUndefined();
    expect(restored.getQueryData(keys.guestIds)).toBeUndefined();
    const stored = storage.map.get(QUERY_CACHE_KEY) ?? "";
    expect(stored).not.toContain("Les 1");
    expect(stored).not.toContain("g9");
  });

  it("drops the cache of another app version (the buster)", async () => {
    const storage = memoryStorage();
    const restored = await persistAndRestore(storage, { restoreBuster: "v2" });
    expect(restored.getQueryData(keys.list)).toBeUndefined();
    expect(restored.getQueryData(keys.favoritesIds)).toBeUndefined();
    expect(storage.map.has(QUERY_CACHE_KEY)).toBe(false);
  });

  it("drops a cache older than 24 hours", async () => {
    const storage = memoryStorage();
    const source = newClient();
    fillCache(source);
    const options = createPersistOptions({
      buster: "v1",
      storage,
      throttleTime: 0,
    });
    await persistQueryClientSave({ queryClient: source, ...options });
    await waitForWrite(storage);
    const saved = JSON.parse(storage.map.get(QUERY_CACHE_KEY) ?? "{}") as {
      timestamp: number;
    };
    storage.map.set(
      QUERY_CACHE_KEY,
      JSON.stringify({
        ...saved,
        timestamp: Date.now() - QUERY_CACHE_MAX_AGE - 1,
      })
    );
    const restored = newClient();
    await persistQueryClientRestore({ queryClient: restored, ...options });
    expect(restored.getQueryData(keys.list)).toBeUndefined();
  });

  it("keeps 24 hours and busts on the app version", () => {
    expect(QUERY_CACHE_MAX_AGE).toBe(24 * 60 * 60 * 1000);
    expect(cacheBuster("3.0.0")).toBe("3.0.0");
    expect(cacheBuster("3.0.1")).not.toBe(cacheBuster("3.0.0"));
    expect(cacheBuster(undefined)).toBe("dev");
  });
});
