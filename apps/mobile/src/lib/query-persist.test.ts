import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createApiClient, createApiQueryUtils } from "@smog/api/client";
import { purgeOtherUsers, userScopedKey } from "@smog/rpc/react";
import { QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import {
  cacheBuster,
  createPersistOptions,
  keepPersistedQueries,
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

/**
 * Waits for the throttled write against a deadline (not a count of short
 * sleeps, which a loaded machine outruns). A missing write still fails.
 */
async function waitForWrite(
  storage: ReturnType<typeof memoryStorage>,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!storage.map.has(QUERY_CACHE_KEY)) {
    if (Date.now() > deadline) {
      throw new Error(`The cache was not written within ${timeoutMs} ms`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling for the throttled write
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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
    publishedAt: 0,
    sponsor: null,
    updatedAt: 0,
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
  it("restores the catalogue and the user's favorites (ids and pages)", async () => {
    const restored = await persistAndRestore(memoryStorage());
    expect(restored.getQueryData(keys.list)).toEqual({
      pageParams: [undefined],
      pages: [{ items: [HOND], nextCursor: null }],
    });
    expect(restored.getQueryData(keys.categories)).toHaveLength(1);
    expect(restored.getQueryData(keys.bySlug)).toMatchObject({ slug: "hond" });
    expect(restored.getQueryData(keys.favoritesIds)).toEqual(["g1"]);
    // The signed-in favorites tab renders offline too (the null cursor is
    // put back, so the refetch sends a valid first page).
    expect(restored.getQueryData(keys.favoritesList)).toEqual({
      pageParams: [undefined],
      pages: [{ items: [HOND], nextCursor: null }],
    });
  });

  it("never persists searches, lists or unscoped ids", async () => {
    const storage = memoryStorage();
    const restored = await persistAndRestore(storage);
    expect(restored.getQueryData(keys.search)).toBeUndefined();
    expect(restored.getQueryData(keys.mine)).toBeUndefined();
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

  it("keeps 24 hours and busts on the app version and the OTA update", () => {
    expect(QUERY_CACHE_MAX_AGE).toBe(24 * 60 * 60 * 1000);
    expect(cacheBuster({ updateId: "u1", version: "3.0.0" })).toBe("3.0.0:u1");
    expect(cacheBuster({ updateId: "u1", version: "3.0.1" })).not.toBe(
      cacheBuster({ updateId: "u1", version: "3.0.0" })
    );
    // An EAS Update ships new JS under the same app version.
    expect(cacheBuster({ updateId: "u2", version: "3.0.0" })).not.toBe(
      cacheBuster({ updateId: "u1", version: "3.0.0" })
    );
    // The embedded bundle: its runtime version, else "embedded".
    expect(
      cacheBuster({ runtimeVersion: "fp1", updateId: null, version: "3.0.0" })
    ).toBe("3.0.0:fp1");
    expect(cacheBuster({})).toBe("dev:embedded");
  });

  it("drops the cache written by another OTA update", async () => {
    const storage = memoryStorage();
    const source = newClient();
    fillCache(source);
    await persistQueryClientSave({
      queryClient: source,
      ...createPersistOptions({
        buster: cacheBuster({ updateId: "u1", version: "3.0.0" }),
        storage,
        throttleTime: 0,
      }),
    });
    await waitForWrite(storage);
    const restored = newClient();
    await persistQueryClientRestore({
      queryClient: restored,
      ...createPersistOptions({
        buster: cacheBuster({ updateId: "u2", version: "3.0.0" }),
        storage,
        throttleTime: 0,
      }),
    });
    expect(restored.getQueryData(keys.bySlug)).toBeUndefined();
    expect(storage.map.has(QUERY_CACHE_KEY)).toBe(false);
  });

  it("after an account switch, the next write leaves the previous user out", async () => {
    const storage = memoryStorage();
    // User u1 persisted their favorites; u2 signs in on the same device.
    const restored = await persistAndRestore(storage);
    expect(restored.getQueryData(keys.favoritesIds)).toEqual(["g1"]);
    purgeOtherUsers(restored, "u2");
    const u2Ids = userScopedKey(rpc.favorites.ids.key({ type: "query" }), "u2");
    restored.setQueryData(u2Ids, ["g7"]);
    storage.map.clear();
    await persistQueryClientSave({
      queryClient: restored,
      ...createPersistOptions({ buster: "v1", storage, throttleTime: 0 }),
    });
    await waitForWrite(storage);
    const stored = storage.map.get(QUERY_CACHE_KEY) ?? "";
    expect(stored).not.toContain('"u1"');
    expect(stored).toContain('"u2"');
    expect(stored).toContain("g7");
    // The catalogue is nobody's and stays.
    expect(stored).toContain("hond");
  });

  it("drops a guest's favorites pages once a user signs in", async () => {
    const storage = memoryStorage();
    const source = newClient();
    fillCache(source);
    const guestPages = userScopedKey(
      [...rpc.gestures.byIds.key({ type: "infinite" }), { ids: ["g9"] }],
      undefined
    );
    source.setQueryData(guestPages, {
      pageParams: [0],
      pages: [[{ ...HOND, id: "g9", slug: "guest-only" }]],
    });
    const options = createPersistOptions({
      buster: "v1",
      storage,
      throttleTime: 0,
    });
    await persistQueryClientSave({ queryClient: source, ...options });
    await waitForWrite(storage);
    const restored = newClient();
    await persistQueryClientRestore({ queryClient: restored, ...options });
    expect(restored.getQueryData(guestPages)).toBeDefined();

    purgeOtherUsers(restored, "u1");
    expect(restored.getQueryData(guestPages)).toBeUndefined();
  });

  it("trims the oldest queries when the cache grows past the size limit", async () => {
    const storage = memoryStorage();
    const source = newClient();
    fillCache(source);
    // A large catalogue page, older than the rest.
    const big = rpc.gestures.bySlug.queryKey({ input: { slug: "groot" } });
    source.setQueryData(
      big,
      {
        ...HOND,
        canonicalSlug: "groot",
        description: "x".repeat(5000),
        keywords: [],
        publishedAt: 0,
        slug: "groot",
        sponsor: null,
        updatedAt: 0,
      },
      { updatedAt: 1 }
    );
    await persistQueryClientSave({
      queryClient: source,
      ...createPersistOptions({
        buster: "v1",
        maxBytes: 4000,
        storage,
        throttleTime: 0,
      }),
    });
    await waitForWrite(storage);
    const stored = storage.map.get(QUERY_CACHE_KEY) ?? "";
    expect(stored.length).toBeLessThanOrEqual(4000);
    expect(stored).not.toContain("groot");
    expect(stored).toContain('"hond"');
  });

  it("trims an oversized cache in one pass, not one full serialization per query", async () => {
    const storage = memoryStorage();
    const source = newClient();
    fillCache(source);
    // A day of browsing: 60 old gesture pages, 1 kB each.
    for (let index = 0; index < 60; index += 1) {
      const slug = `oud-${index}`;
      source.setQueryData(
        rpc.gestures.bySlug.queryKey({ input: { slug } }),
        {
          ...HOND,
          canonicalSlug: slug,
          description: "x".repeat(1000),
          keywords: [],
          publishedAt: 0,
          slug,
          sponsor: null,
          updatedAt: 0,
        },
        { updatedAt: index + 1 }
      );
    }
    const stringify = jest.spyOn(JSON, "stringify");
    try {
      await persistQueryClientSave({
        queryClient: source,
        ...createPersistOptions({
          buster: "v1",
          maxBytes: 8000,
          storage,
          throttleTime: 0,
        }),
      });
      await waitForWrite(storage);
      // Full-cache serializations only (the one-pass trim sizes each query once).
      const whole = stringify.mock.calls.filter(
        ([value]) =>
          typeof value === "object" && value !== null && "clientState" in value
      );
      expect(whole.length).toBeLessThanOrEqual(3);
    } finally {
      stringify.mockRestore();
    }
    const stored = storage.map.get(QUERY_CACHE_KEY) ?? "";
    expect(new TextEncoder().encode(stored).length).toBeLessThanOrEqual(8000);
    // The newest are kept, the oldest go.
    expect(stored).toContain('"hond"');
    expect(stored).toContain("oud-59");
    expect(stored).not.toContain('"oud-0"');
  });

  it("keeps the persisted procedures in memory for as long as on disk", () => {
    const client = newClient();
    keepPersistedQueries(client);
    for (const key of [keys.favoritesList, keys.favoritesIds, keys.list]) {
      expect(client.getQueryDefaults(key).gcTime).toBe(QUERY_CACHE_MAX_AGE);
    }
    expect(client.getQueryDefaults(keys.search).gcTime).toBeUndefined();
  });
});
