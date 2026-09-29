/**
 * `@smog/favorites/contract`: a signed-in user's favorites (spec §5.2, §7).
 * Every procedure needs a session (`UNAUTHORIZED`); guests keep theirs in
 * `@smog/local-store`. Only published gestures count: the writes answer
 * `NOT_FOUND` for an unknown or unpublished gesture, and the reads skip
 * favorites whose gesture was unpublished. Mounted as `favorites` in
 * `@smog/api`'s `appContract`.
 */
import { gestureSummarySchema } from "@smog/gestures/schema";
import { baseContract } from "@smog/rpc/contract";
import { z } from "zod";
import {
  favoriteInputSchema,
  favoriteStateSchema,
  favoritesPageInputSchema,
  favoritesPageSchema,
  gestureIdSchema,
} from "./schema";

export const favoritesContract = {
  /** Makes the gesture a favorite (idempotent). */
  add: baseContract.input(favoriteInputSchema).output(favoriteStateSchema),

  /** Favorite gesture ids, newest first (at most `FAVORITE_IDS_MAX`). */
  ids: baseContract.output(z.array(z.string())),

  /** Favorite gestures, newest first, a keyset page at a time. */
  list: baseContract
    .input(favoritesPageInputSchema)
    .output(favoritesPageSchema),

  /** Removes the favorite (idempotent). */
  remove: baseContract.input(favoriteInputSchema).output(favoriteStateSchema),

  /** Adds the favorite when missing, removes it when present. */
  toggle: baseContract.input(favoriteInputSchema).output(favoriteStateSchema),
};

export type FavoritesContract = typeof favoritesContract;

/**
 * The one `gestures` procedure the favorites hooks call (a guest's
 * favorites, by id). A feature may import another feature's `./schema`
 * only (spec §4.1), so this mirrors `gesturesContract.byIds`; `@smog/api`'s
 * type tests fail when the two drift apart.
 */
export const gestureLookupContract = {
  byIds: baseContract
    .input(z.object({ ids: z.array(gestureIdSchema).max(100) }))
    .output(z.array(gestureSummarySchema)),
};

export type GestureLookupContract = typeof gestureLookupContract;
