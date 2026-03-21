import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { publicProcedure } from "../index";
import { categoriesCache, logCacheOperation } from "../lib/categoriesCache";
import { convexClient } from "../lib/convex";

export const categoriesRouter = {
  list: publicProcedure.handler(async () => {
    // Check cache first
    const cached = categoriesCache.getAllActive();
    if (cached) {
      logCacheOperation("list", "cache hit");
      return cached;
    }

    // Cache miss - fetch from Convex
    logCacheOperation("list", "cache miss, fetching from Convex");
    const categories = await convexClient.query(api.categories.list);

    // Store in cache for future requests
    categoriesCache.setAllActive(categories);

    return categories;
  }),

  getByIds: publicProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
      })
    )
    .handler(async ({ input }) => {
      // Normalize input (empty array case)
      if (input.ids.length === 0) {
        return [];
      }

      // Check cache first
      const cached = categoriesCache.getByIds(input.ids);
      if (cached) {
        logCacheOperation("getByIds", `cache hit for ${input.ids.length} IDs`);
        return cached;
      }

      // Cache miss - fetch from Convex
      logCacheOperation(
        "getByIds",
        `cache miss for ${input.ids.length} IDs, fetching from Convex`
      );
      const categories = await convexClient.query(api.categories.getByIds, {
        ids: input.ids as Id<"categories">[],
      });

      // Store in cache for future requests
      categoriesCache.setByIds(input.ids, categories);

      return categories;
    }),
};
