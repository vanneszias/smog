import {
  type ApiClient,
  type ApiQueryUtils,
  createApiQueryUtils,
} from "@smog/api/client";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getGlobalStartContext } from "@tanstack/react-start";
import { createAppApiClient } from "@/lib/api";
import { routeTree } from "./routeTree.gen";

/** What every loader and component gets from the router. */
export interface RouterContext {
  api: ApiClient;
  queryClient: QueryClient;
  queryUtils: ApiQueryUtils;
}

/**
 * The request's CSP nonce, which `src/worker.ts` passes to Start as
 * request context. Undefined outside a request (the router is also built
 * for redirects and server functions, where no page is rendered).
 */
function requestNonce(): string | undefined {
  try {
    // Start types the request context from `Register`; ours only adds `nonce`.
    const context = getGlobalStartContext() as { nonce?: unknown } | undefined;
    return typeof context?.nonce === "string" ? context.nonce : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One router, QueryClient and oRPC client per request on the server (no
 * cross-request cache) and per document in the browser. Loaders prefetch
 * with the same query keys the feature hooks use; the SSR integration
 * dehydrates those queries and hydrates them before the first render.
 */
function createAppRouter() {
  const api = createAppApiClient();
  const queryClient = new QueryClient();
  const router = createRouter({
    context: { api, queryClient, queryUtils: createApiQueryUtils(api) },
    defaultPreload: "intent",
    // The loaders' data lives in the QueryClient, which has its own staleness.
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
    // Start's inline hydration scripts carry the CSP nonce (worker/headers.ts).
    ssr: { nonce: import.meta.env.SSR ? requestNonce() : undefined },
  });
  setupRouterSsrQueryIntegration({
    // Only settled data: errors are retried by the client, and pending
    // queries were never awaited by a loader.
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === "success",
    },
    queryClient,
    router,
    // The root document mounts the provider inside <html> (with the rpc one).
    wrapQueryClient: false,
  });
  return router;
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
