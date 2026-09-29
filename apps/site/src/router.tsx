import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function createAppRouter() {
  return createRouter({
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });
}

type AppRouter = ReturnType<typeof createAppRouter>;

export function getRouter(): AppRouter {
  return createAppRouter();
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
