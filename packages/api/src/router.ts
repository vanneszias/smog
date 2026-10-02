import { createAccountRouter } from "@smog/account/server";
import { createAdminRouter } from "@smog/admin/server";
import { publicAuthConfig } from "@smog/config/env/worker";
import {
  createFavoritesRouter,
  insertFavoritesStmt,
} from "@smog/favorites/server";
import {
  bumpCatalogVersion,
  findGesturesByIds,
  gesturesRouter,
} from "@smog/gestures/server";
import {
  appendItemsStmt,
  createListsRouter,
  insertListsStmt,
  shareUrl,
  touchListsWithNewItemsStmt,
  unplacedItemsStmt,
} from "@smog/lists/server";
import { implementRpc } from "@smog/rpc";
import { roleSchema } from "@smog/rpc/contract";
import { appContract } from "./contract";

const os = implementRpc(appContract);

const system = os.system.router({
  authConfig: os.system.authConfig.handler(({ context }) =>
    publicAuthConfig(context.env)
  ),
  health: os.system.health.handler(({ context }) => ({
    environment: context.env.ENVIRONMENT,
    ok: true as const,
  })),
  whoami: os.system.whoami.handler(({ context }) => {
    const user = context.session?.user;
    return {
      user: user
        ? {
            email: user.email,
            id: user.id,
            image: user.image ?? null,
            name: user.name,
            role: roleSchema.parse(user.role),
          }
        : null,
    };
  }),
});

/** The app router: implements `appContract` (feature routers join here). */
export const appRouter = os.router({
  // The guest import writes through the favorites and lists builders; the
  // export builds share links with the lists' URL.
  account: createAccountRouter({
    appendItems: appendItemsStmt,
    insertFavorites: insertFavoritesStmt,
    insertLists: insertListsStmt,
    shareUrl,
    touchLists: touchListsWithNewItemsStmt,
    unplacedItems: unplacedItemsStmt,
  }),
  // Admin catalogue writes start a new catalogue version (the gestures
  // cache); every admin procedure is `requireAdmin`.
  admin: createAdminRouter({ bumpCatalogVersion }),
  // Favorites and lists resolve summaries with the gestures query (a
  // feature never imports another feature's server; the api wires them).
  favorites: createFavoritesRouter({ findSummaries: findGesturesByIds }),
  gestures: gesturesRouter,
  lists: createListsRouter({ findSummaries: findGesturesByIds }),
  system,
});

export type AppRouter = typeof appRouter;
