import type { SecondaryStorage } from "better-auth";

/** KV rejects an `expirationTtl` below 60 seconds. */
const KV_MIN_TTL_SECONDS = 60;

function ttlOptions(ttl: number | undefined): KVNamespacePutOptions {
  return ttl && ttl > 0
    ? { expirationTtl: Math.max(Math.ceil(ttl), KV_MIN_TTL_SECONDS) }
    : {};
}

/**
 * Better Auth secondary storage on Workers KV (sessions cache and rate-limit
 * counters). KV is eventually consistent and has no atomic operations, so
 * `getAndDelete` and `increment` are best effort: that is why verification
 * values live in D1 (`verification.storeInDatabase`), and rate limits are
 * approximate. TTLs below 60 s are rounded up to KV's minimum.
 */
export function kvSecondaryStorage(kv: KVNamespace): SecondaryStorage {
  return {
    delete: async (key) => {
      await kv.delete(key);
    },
    get: async (key) => await kv.get(key),
    getAndDelete: async (key) => {
      const value = await kv.get(key);
      if (value !== null) {
        await kv.delete(key);
      }
      return value;
    },
    increment: async (key, ttl) => {
      const current = Number.parseInt((await kv.get(key)) ?? "0", 10);
      const next = (Number.isNaN(current) ? 0 : current) + 1;
      try {
        await kv.put(key, String(next), ttlOptions(ttl));
      } catch (error) {
        // KV allows one write per key per second; a failed counter write
        // must not fail the request it is counting.
        console.error("[auth] Failed to write a rate-limit counter:", error);
      }
      return next;
    },
    set: async (key, value, ttl) => {
      await kv.put(key, value, ttlOptions(ttl));
    },
  };
}
