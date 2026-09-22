import type { CollectionConfig } from "payload";
import { denyAll } from "@/access";

/**
 * One row per (namespace, client, window). The unique index is the mechanism.
 *
 * Not reachable over the API at all — not even by an admin, and not for
 * reading. The `key` column is derived from a client address, so the table is
 * personal data with a retention period measured in minutes; `jobs/` prunes
 * it. Writes go through `lib/rateLimit.ts` on the local API, and the counter
 * itself goes one layer below that, through the adapter's drizzle instance —
 * see that module for why an `UPDATE` could not do the job.
 */
export const RateLimits: CollectionConfig = {
  slug: "rate-limits",
  access: {
    create: denyAll,
    delete: denyAll,
    read: denyAll,
    update: denyAll,
  },
  fields: [
    // `${namespace}:${clientKey}:${windowStart}` — namespaced for the same
    // reason `claims.key` is (see `lib/claims.ts`): two features must not be
    // able to collide in one keyspace.
    { name: "key", type: "text", required: true, unique: true, index: true },
    { name: "count", type: "number", required: true },
    // Epoch seconds. Indexed because the pruning job filters on it.
    { name: "windowStart", type: "number", required: true, index: true },
  ],
};
