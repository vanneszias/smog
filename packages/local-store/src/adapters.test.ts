import { describe, expect, test } from "bun:test";
import { createMemoryAdapter } from "./adapters/memory";
import { createAsyncStorageAdapter } from "./adapters/native";
import { createWebAdapter } from "./adapters/web";
import type { StorageAdapter } from "./store";

async function roundTrip(adapter: StorageAdapter): Promise<void> {
  expect(await adapter.getItem("k")).toBeNull();
  await adapter.setItem("k", "v");
  expect(await adapter.getItem("k")).toBe("v");
  await adapter.removeItem("k");
  expect(await adapter.getItem("k")).toBeNull();
}

function denied(): never {
  throw new Error("denied");
}

describe("adapters", () => {
  test("memory adapter round-trips and can be seeded", async () => {
    await roundTrip(createMemoryAdapter());
    expect(await createMemoryAdapter({ a: "1" }).getItem("a")).toBe("1");
  });

  test("web adapter uses localStorage when available", async () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      removeItem: (k: string) => {
        backing.delete(k);
      },
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
    };
    await roundTrip(createWebAdapter(storage));
    await createWebAdapter(storage).setItem("x", "y");
    expect(backing.get("x")).toBe("y");
  });

  test("web adapter falls back to memory when localStorage throws", async () => {
    await roundTrip(
      createWebAdapter({
        getItem: denied,
        removeItem: denied,
        setItem: denied,
      })
    );
  });

  test("web adapter falls back to memory without localStorage", async () => {
    await roundTrip(createWebAdapter(undefined));
  });

  test("native adapter wraps an AsyncStorage-like object", async () => {
    const backing = new Map<string, string>();
    const fake = {
      getItem: (k: string) => Promise.resolve(backing.get(k) ?? null),
      removeItem: (k: string) => {
        backing.delete(k);
        return Promise.resolve();
      },
      setItem: (k: string, v: string) => {
        backing.set(k, v);
        return Promise.resolve();
      },
    };
    await roundTrip(createAsyncStorageAdapter(fake));
    await createAsyncStorageAdapter(fake).setItem("n", "1");
    expect(backing.get("n")).toBe("1");
  });
});
