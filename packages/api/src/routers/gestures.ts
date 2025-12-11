import { api } from "@smog/convex";
import type { Doc } from "@smog/convex/dataModel";
import { z } from "zod";
import { publicProcedure } from "../index";
import { convexClient } from "../lib/convex";

// Use Convex-generated types
type Gesture = Doc<"gestures">;
type Category = Doc<"categories">;

export const gesturesRouter = {
  // List all gestures with pagination
  list: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        numItems: z.number().min(1).max(100).default(20),
      })
    )
    .handler(async ({ input }) => {
      const paginationOpts = {
        numItems: input.numItems,
        cursor: input.cursor ?? null,
      };

      // Get gestures from Convex
      const result = await convexClient.query(api.gestures.list, {
        paginationOpts,
      });

      // Get all unique category IDs
      const categoryIds = [
        ...new Set(result.page.flatMap((g: Gesture) => g.categoryIds)),
      ];

      // Fetch categories
      const categories = await convexClient.query(api.categories.getByIds, {
        ids: categoryIds,
      });

      // Create a map for quick lookup
      const categoryMap = new Map(
        categories.map((cat: Category) => [cat._id, cat])
      );

      // Enrich gestures with category names
      const enrichedGestures = result.page.map((gesture: Gesture) => ({
        ...gesture,
        categories: gesture.categoryIds
          .map((id) => categoryMap.get(id))
          .filter(Boolean),
      }));

      return {
        gestures: enrichedGestures,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      };
    }),

  // Get gesture by ID
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const gesture = await convexClient.query(api.gestures.getById, {
        id: input.id as never,
      });

      if (!gesture) {
        return null;
      }

      // Fetch categories for this gesture
      const categories = await convexClient.query(api.categories.getByIds, {
        ids: gesture.categoryIds,
      });

      return {
        ...gesture,
        categories,
      };
    }),

  // Search gestures
  search: publicProcedure
    .input(
      z.object({
        searchText: z.string(),
        limit: z.number().min(1).max(100).optional(),
      })
    )
    .handler(async ({ input }) => {
      const gestures = await convexClient.query(api.gestures.search, {
        searchText: input.searchText,
        limit: input.limit,
      });

      // Get all unique category IDs
      const categoryIds = [
        ...new Set(gestures.flatMap((g: Gesture) => g.categoryIds)),
      ];

      // Fetch categories
      const categories = await convexClient.query(api.categories.getByIds, {
        ids: categoryIds,
      });

      // Create a map for quick lookup
      const categoryMap = new Map(
        categories.map((cat: Category) => [cat._id, cat])
      );

      // Enrich gestures with category names
      return gestures.map((gesture: Gesture) => ({
        ...gesture,
        categories: gesture.categoryIds
          .map((id) => categoryMap.get(id))
          .filter(Boolean),
      }));
    }),
};
