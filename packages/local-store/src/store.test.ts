import { describe, expect, spyOn, test } from "bun:test";
import { createMemoryAdapter } from "./adapters/memory";
import { defaultGuestData, type GuestData } from "./schema";
import {
  createLocalStore,
  DEFAULT_STORAGE_KEY,
  type StorageAdapter,
} from "./store";

const KEY = DEFAULT_STORAGE_KEY;

function stored(data: Partial<GuestData>): string {
  return JSON.stringify({ ...defaultGuestData(), ...data });
}

describe("createLocalStore", () => {
  test("uses the documented default key", () => {
    expect(DEFAULT_STORAGE_KEY).toBe("smog:guest:v1");
  });

  test("starts with defaults and hydrates from the adapter", async () => {
    const adapter = createMemoryAdapter({
      [KEY]: stored({ favorites: ["a", "b"] }),
    });
    const store = createLocalStore(adapter);
    expect(store.getSnapshot()).toEqual(defaultGuestData());
    await store.ready;
    expect(store.getSnapshot().favorites).toEqual(["a", "b"]);
  });

  test("resets corrupt JSON to defaults and logs", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const adapter = createMemoryAdapter({ [KEY]: "{not json" });
    const store = createLocalStore(adapter);
    await store.ready;
    expect(store.getSnapshot()).toEqual(defaultGuestData());
    expect(error.mock.calls[0]?.[0]).toBe(
      "[localStore] Failed to parse stored data"
    );
    error.mockRestore();
  });

  test("resets data that fails the schema", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const adapter = createMemoryAdapter({
      [KEY]: JSON.stringify({ favorites: "nope", version: 1 }),
    });
    const store = createLocalStore(adapter);
    await store.ready;
    expect(store.getSnapshot()).toEqual(defaultGuestData());
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test("runs migrations from older versions", async () => {
    const legacy = { favorites: ["x"], version: 0 };
    const adapter = createMemoryAdapter({ [KEY]: JSON.stringify(legacy) });
    const store = createLocalStore(adapter, {
      migrations: {
        0: (old) => ({ ...defaultGuestData(), ...(old as object), version: 1 }),
      },
    });
    await store.ready;
    expect(store.getSnapshot().favorites).toEqual(["x"]);
    expect(store.getSnapshot().version).toBe(1);
  });

  test("persists updates and supports a custom key", async () => {
    const adapter = createMemoryAdapter();
    const store = createLocalStore(adapter, { key: "custom" });
    await store.update((d) => ({ ...d, favorites: ["z"] }));
    expect(
      JSON.parse((await adapter.getItem("custom")) ?? "{}").favorites
    ).toEqual(["z"]);
  });

  test("notifies subscribers once per update", async () => {
    const store = createLocalStore(createMemoryAdapter());
    await store.ready;
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    await store.update((d) => ({ ...d, favorites: ["a"] }));
    expect(calls).toBe(1);
    await store.update((d) => ({ ...d, favorites: ["a", "b"] }));
    expect(calls).toBe(2);
    unsubscribe();
    await store.update((d) => ({ ...d, favorites: [] }));
    expect(calls).toBe(2);
  });

  test("serialises concurrent updates so both persist", async () => {
    const slow: StorageAdapter = {
      ...createMemoryAdapter(),
    };
    const backing = new Map<string, string>();
    slow.getItem = async (k) => backing.get(k) ?? null;
    slow.setItem = async (k, v) => {
      await new Promise((r) => setTimeout(r, 5));
      backing.set(k, v);
    };
    const store = createLocalStore(slow);
    const first = store.update((d) => ({
      ...d,
      favorites: [...d.favorites, "a"],
    }));
    const second = store.update((d) => ({
      ...d,
      favorites: [...d.favorites, "b"],
    }));
    await Promise.all([first, second]);
    expect(store.getSnapshot().favorites).toEqual(["a", "b"]);
    expect(JSON.parse(backing.get(KEY) ?? "{}").favorites).toEqual(["a", "b"]);
  });

  test("a failing update rejects without breaking the queue", async () => {
    const store = createLocalStore(createMemoryAdapter());
    const bad = store.update(() => {
      throw new Error("boom");
    });
    const good = store.update((d) => ({ ...d, favorites: ["ok"] }));
    await expect(bad).rejects.toThrow("boom");
    await good;
    expect(store.getSnapshot().favorites).toEqual(["ok"]);
  });

  test("reset clears the given parts or everything", async () => {
    const store = createLocalStore(createMemoryAdapter());
    await store.update((d) => ({
      ...d,
      consent: { analytics: true, decidedAt: 1 },
      favorites: ["a"],
      recentSearches: ["hond"],
    }));
    await store.reset(["favorites"]);
    expect(store.getSnapshot().favorites).toEqual([]);
    expect(store.getSnapshot().recentSearches).toEqual(["hond"]);
    await store.reset();
    expect(store.getSnapshot()).toEqual(defaultGuestData());
  });

  test("keeps a stable snapshot reference between changes", async () => {
    const store = createLocalStore(createMemoryAdapter());
    await store.ready;
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});
