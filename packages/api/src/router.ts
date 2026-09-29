import { findGesturesByIds, gesturesRouter } from "@smog/gestures/server";
import { createListsRouter } from "@smog/lists/server";
import { implementRpc } from "@smog/rpc";
import { roleSchema } from "@smog/rpc/contract";
import { appContract } from "./contract";

const os = implementRpc(appContract);

const system = os.system.router({
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
  gestures: gesturesRouter,
  // Lists hydrate their items with the gestures service (features never
  // import each other's server).
  lists: createListsRouter({ gestureSummaries: findGesturesByIds }),
  system,
});

export type AppRouter = typeof appRouter;
