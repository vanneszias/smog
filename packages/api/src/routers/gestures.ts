import { api } from "@smog/convex";
import type { Doc } from "@smog/convex/dataModel";
import { z } from "zod";
import { publicProcedure } from "../index";
import { convexClient } from "../lib/convex";

// Use Convex-generated types
type Gesture = Doc<"gestures">;
type Category = Doc<"categories">;

export const gesturesRouter = {
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
  // List all gestures with pagination
  list: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        numItems: z.number().min(1).max(100).default(50),
      })
    )
    .handler(async ({ input }) => {
      const paginationOpts = {
        cursor: input.cursor ?? null,
        numItems: input.numItems,
      };

      // Get gestures from Convex
      const result = await convexClient.query(api.gestures.list, {
        paginationOpts,
      });

      // Get all unique category IDs
      const categoryIds = [
        ...new Set(result.page.flatMap((g: Gesture) => g.categoryIds)),
      ];

      // Fetch categories and sponsorships in parallel
      const gestureIds = result.page.map((g: Gesture) => g._id);
      const [categories, sponsorshipMap] = await Promise.all([
        convexClient.query(api.categories.getByIds, { ids: categoryIds }),
        convexClient.query(api.sponsorships.getActiveByGestures, {
          gestureIds,
        }),
      ]);

      // Create a map for quick lookup
      const categoryMap = new Map(
        categories.map((cat: Category) => [cat._id, cat])
      );

      // Enrich gestures with category names and sponsorship status
      const enrichedGestures = result.page.map((gesture: Gesture) => ({
        ...gesture,
        categories: gesture.categoryIds
          .map((id) => categoryMap.get(id))
          .filter(Boolean),
        sponsorship: sponsorshipMap[gesture._id] || null,
      }));

      return {
        continueCursor: result.continueCursor,
        gestures: enrichedGestures,
        isDone: result.isDone,
      };
    }),

  // Search gestures
  search: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        searchText: z.string(),
      })
    )
    .handler(async ({ input }) => {
      const gestures = await convexClient.query(api.gestures.search, {
        limit: input.limit,
        searchText: input.searchText,
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
