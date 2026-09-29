/**
 * `@smog/favorites/contract`: a signed-in user's favorites (spec §5.2, §7).
 * Every procedure needs a session (`UNAUTHORIZED`); guests keep theirs in
 * `@smog/local-store`. Only published gestures count: `add` (and `toggle`
 * when it adds) answers `NOT_FOUND` for an unknown or unpublished gesture,
 * `remove` always succeeds, and the reads skip favorites whose gesture was
 * unpublished. Mounted as `favorites` in
 * `@smog/api`'s `appContract`.
 */
import { baseContract } from "@smog/rpc/contract";
import { z } from "zod";
import {
  favoriteInputSchema,
  favoriteStateSchema,
  favoritesPageInputSchema,
  favoritesPageSchema,
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

  /** Removes the favorite, whatever the gesture's state (idempotent). */
  remove: baseContract.input(favoriteInputSchema).output(favoriteStateSchema),

  /** Adds the favorite when missing, removes it when present. */
  toggle: baseContract.input(favoriteInputSchema).output(favoriteStateSchema),
};

export type FavoritesContract = typeof favoritesContract;
