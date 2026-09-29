import { env } from "cloudflare:workers";
import { newId } from "@smog/utils";
import { describe, expect, it } from "vitest";
import { kvSecondaryStorage } from "../src/kv-storage";

describe("kvSecondaryStorage", () => {
  const storage = kvSecondaryStorage(env.KV);

  it("sets, gets and deletes values", async () => {
    const key = newId();
    await storage.set(key, "value");
    expect(await storage.get(key)).toBe("value");
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("accepts TTLs below KV's 60 s minimum", async () => {
    const key = newId();
    await storage.set(key, "short", 10);
    expect(await storage.get(key)).toBe("short");
  });

  it("gets and deletes in one call", async () => {
    const key = newId();
    await storage.set(key, "once");
    expect(await storage.getAndDelete(key)).toBe("once");
    expect(await storage.get(key)).toBeNull();
  });

  it("increments a counter from 1", async () => {
    const key = newId();
    expect(await storage.increment(key, 10)).toBe(1);
    expect(await storage.increment(key, 10)).toBe(2);
  });
});
