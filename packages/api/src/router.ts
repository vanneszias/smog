import { publicAuthConfig } from "@smog/config/env/worker";
import { createFavoritesRouter } from "@smog/favorites/server";
import { findGesturesByIds, gesturesRouter } from "@smog/gestures/server";
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
  // Favorites resolve summaries with the gestures query (a feature never
  // imports another feature's server; the api wires them).
  favorites: createFavoritesRouter({ findSummaries: findGesturesByIds }),
  gestures: gesturesRouter,
  system,
});

export type AppRouter = typeof appRouter;
