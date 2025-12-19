import type { RouterClient } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { categoriesRouter } from "./categories";
import { favoritesRouter } from "./favorites";
import { gesturesRouter } from "./gestures";
import { sponsorshipsRouter } from "./sponsorships";
import { usersRouter } from "./users";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    workosId: context.workosId,
  })),
  gestures: gesturesRouter,
  categories: categoriesRouter,
  favorites: favoritesRouter,
  users: usersRouter,
  sponsorships: sponsorshipsRouter,
  admin: adminRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
