import { implementRpc, requireUser } from "@smog/rpc";
import { favoritesContract } from "../contract";
import {
  addFavorite,
  type FindGestureSummaries,
  GestureNotFoundError,
  InvalidCursorError,
  listFavoriteIds,
  listFavorites,
  removeFavorite,
  toggleFavorite,
} from "./service";

export interface FavoritesRouterDeps {
  /** `@smog/gestures/server` `findGesturesByIds`, wired by `@smog/api`. */
  findSummaries: FindGestureSummaries;
}

/**
 * The `favorites` slice of the app router. Every procedure needs a session
 * (`UNAUTHORIZED`) and acts on `context.user` only.
 */
export function createFavoritesRouter({ findSummaries }: FavoritesRouterDeps) {
  const os = implementRpc(favoritesContract).use(requireUser);

  /** Maps the service's errors to the contract's codes. */
  async function guarded<T>(
    errors: {
      NOT_FOUND: () => Error;
      VALIDATION: (options: {
        data: { fieldErrors: Record<string, string[]>; formErrors: string[] };
      }) => Error;
    },
    run: () => Promise<T>
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof GestureNotFoundError) {
        throw errors.NOT_FOUND();
      }
      if (error instanceof InvalidCursorError) {
        throw errors.VALIDATION({
          data: { fieldErrors: { cursor: ["invalid"] }, formErrors: [] },
        });
      }
      throw error;
    }
  }

  return os.router({
    add: os.add.handler(async ({ context, errors, input }) => {
      await guarded(errors, () =>
        addFavorite(context.db, context.user.id, input.gestureId)
      );
      return { favorite: true };
    }),

    ids: os.ids.handler(
      async ({ context }) => await listFavoriteIds(context.db, context.user.id)
    ),

    list: os.list.handler(
      async ({ context, errors, input }) =>
        await guarded(errors, () =>
          listFavorites(
            { db: context.db, findSummaries },
            context.user.id,
            input
          )
        )
    ),

    remove: os.remove.handler(async ({ context, errors, input }) => {
      await guarded(errors, () =>
        removeFavorite(context.db, context.user.id, input.gestureId)
      );
      return { favorite: false };
    }),

    toggle: os.toggle.handler(async ({ context, errors, input }) => ({
      favorite: await guarded(errors, () =>
        toggleFavorite(context.db, context.user.id, input.gestureId)
      ),
    })),
  });
}
