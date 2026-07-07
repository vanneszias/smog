import { ORPCError } from "@orpc/server";
import { api } from "@smog/convex";
import type { Doc, Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { convexClient, withServiceAuth } from "../lib/convex";

type Gesture = Doc<"gestures">;
type Category = Doc<"categories">;

async function requireCurrentUserId(
  workosId: string,
  requestedUserId: string
): Promise<Id<"users">> {
  const user = await convexClient.query(
    api.users.getUserByWorkOSId,
    withServiceAuth({ workosId })
  );
  if (!user || user._id !== requestedUserId) {
    throw new ORPCError("FORBIDDEN");
  }
  return user._id;
}

export const favoritesRouter = {
  // Get user's favorite gesture IDs
  getUserFavorites: protectedProcedure
    .input(z.object({ convexUserId: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = await requireCurrentUserId(
        context.workosId,
        input.convexUserId
      );
      const favoriteIds = await convexClient.query(
        api.favorites.getUserFavorites,
        withServiceAuth({ userId })
      );
      return favoriteIds;
    }),

  // Get user's favorite gestures with full data
  getUserFavoriteGestures: protectedProcedure
    .input(z.object({ convexUserId: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = await requireCurrentUserId(
        context.workosId,
        input.convexUserId
      );
      const gestures = await convexClient.query(
        api.favorites.getUserFavoriteGestures,
        withServiceAuth({ userId })
      );

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

  // Toggle favorite
  toggleFavorite: protectedProcedure
    .input(
      z.object({
        convexUserId: z.string(),
        gestureId: z.string(),
      })
    )
    .handler(async ({ input, context }) => {
      const userId = await requireCurrentUserId(
        context.workosId,
        input.convexUserId
      );
      const result = await convexClient.mutation(
        api.favorites.toggleUserFavorite,
        withServiceAuth({
          userId,
          gestureId: input.gestureId as Id<"gestures">,
        })
      );
      return result; // true if added, false if removed
    }),

  // Check if gesture is favorited
  isFavorite: protectedProcedure
    .input(
      z.object({
        convexUserId: z.string(),
        gestureId: z.string(),
      })
    )
    .handler(async ({ input, context }) => {
      const userId = await requireCurrentUserId(
        context.workosId,
        input.convexUserId
      );
      const isFavorited = await convexClient.query(
        api.favorites.isFavorite,
        withServiceAuth({
          userId,
          gestureId: input.gestureId as Id<"gestures">,
        })
      );
      return isFavorited;
    }),
};
