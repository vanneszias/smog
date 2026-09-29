/**
 * `@smog/favorites/schema`: the Zod schemas and limits shared by the
 * contract, the server and the hooks. Client-safe (no server imports).
 */
import { gestureSummarySchema } from "@smog/gestures/schema";
import { z } from "zod";

/** Favorites per `list` page when the caller does not say. */
export const FAVORITES_PAGE_DEFAULT = 50;
/** The largest `list` page (the global list bound). */
export const FAVORITES_PAGE_MAX = 100;
/**
 * `ids` returns at most this many (newest first). It is the heart state of
 * every card, so it is the whole set in practice: far above the catalogue.
 */
export const FAVORITE_IDS_MAX = 5000;

export const gestureIdSchema = z.string().min(1).max(64);

/** The input of `add`, `remove` and `toggle`. */
export const favoriteInputSchema = z.object({ gestureId: gestureIdSchema });

/** Whether the gesture is a favorite after the call. */
export const favoriteStateSchema = z.object({ favorite: z.boolean() });

export const favoritesPageInputSchema = z.object({
  /** `nextCursor` of the previous page. */
  cursor: z.string().min(1).max(1024).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(FAVORITES_PAGE_MAX)
    .default(FAVORITES_PAGE_DEFAULT),
});

export const favoritesPageSchema = z.object({
  items: z.array(gestureSummarySchema),
  nextCursor: z.string().nullable(),
});

export type FavoriteInput = z.infer<typeof favoriteInputSchema>;
export type FavoriteState = z.infer<typeof favoriteStateSchema>;
export type FavoritesPage = z.infer<typeof favoritesPageSchema>;
