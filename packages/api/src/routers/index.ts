import type { RouterClient } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { categoriesRouter } from "./categories";
import { favoritesRouter } from "./favorites";
import { gesturesRouter } from "./gestures";
import { listsRouter } from "./lists";
import { sponsorshipsRouter } from "./sponsorships";
import { usersRouter } from "./users";

export const appRouter = {
  admin: adminRouter,
  categories: categoriesRouter,
  favorites: favoritesRouter,
  gestures: gesturesRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  lists: listsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    workosId: context.workosId,
  })),
  sponsorships: sponsorshipsRouter,
  users: usersRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
