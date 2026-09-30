import { expect } from "bun:test";
import { AnalyticsProvider } from "@smog/analytics/react";
import type { AnalyticsEvent } from "@smog/analytics/schema";
import { createRecordingAnalytics } from "@smog/analytics/testing";
import { createApiClient, createApiQueryUtils } from "@smog/api/client";
import { AuthStateProvider, type SessionHookResult } from "@smog/auth/react";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { createLocalStore, createMemoryAdapter } from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider } from "@smog/rpc/react";
import { ToastProvider, TooltipProvider } from "@smog/ui-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  type AnyRoute,
  type AnyRouter,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { RouterContext } from "@/router";

const GUEST: SessionHookResult = { data: null, error: null, isPending: false };

function useGuestSession(): SessionHookResult {
  return GUEST;
}

/** A procedure's answer (`gestures/search` → its output, or from its input). */
type ApiRoutes = Record<string, unknown>;

/** A fetch that answers `/api/rpc/<path>` from `routes` (404 otherwise). */
function fakeFetch(
  routes: ApiRoutes,
  calls: { input: unknown; path: string }[]
) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname.replace("/api/rpc/", "");
    const data =
      request.method === "GET"
        ? url.searchParams.get("data")
        : await request.text();
    const input = data ? (JSON.parse(data) as { json?: unknown }).json : null;
    calls.push({ input, path });
    const route = routes[path];
    if (route === undefined) {
      return Response.json(
        {
          json: {
            code: "NOT_FOUND",
            defined: true,
            message: "NOT_FOUND",
            status: 404,
          },
        },
        { status: 404 }
      );
    }
    const value =
      typeof route === "function"
        ? (route as (input: unknown) => unknown)(input)
        : route;
    return Response.json({ json: value ?? null, meta: [] });
  };
}

export interface RenderSiteOptions {
  /** Procedure answers for the API client; anything else is a 404. */
  api?: ApiRoutes;
  /** The URL to open. */
  path?: string;
  /**
   * The app's own file routes, mounted as the route tree mounts them
   * (`[Route, "/gestures/$slug"]`), instead of a test page.
   */
  routes?: (readonly [AnyRoute, string])[];
}

export interface RenderedSite {
  /** Every API call: the procedure path and its input. */
  calls: { input: unknown; path: string }[];
  /** Every analytics event the screen tracked. */
  events: AnalyticsEvent[];
  router: AnyRouter;
}

/**
 * Renders a page (English) inside the site's providers: a memory router
 * whose root has the shell's `siteUrl` and the router context the loaders
 * use, a guest session, a memory local store, recording analytics and an
 * API client answering from `api`. Either `ui` is the page at every path
 * (it must render `data-testid="page"`), or `routes` are the app's routes.
 */
export async function renderSite(
  ui: (() => ReactNode) | null,
  { api = {}, path = "/", routes = [] }: RenderSiteOptions = {}
): Promise<RenderedSite> {
  const recorder = createRecordingAnalytics();
  const calls: RenderedSite["calls"] = [];
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = createApiClient({
    baseUrl: "http://localhost:5173",
    fetch: fakeFetch(api, calls),
  });
  const queryUtils = createApiQueryUtils(client);
  const store = createLocalStore(createMemoryAdapter());
  const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
    loader: () => ({ locale: "en", siteUrl: "https://smog.test" }),
  });
  const children: AnyRoute[] = routes.map(([route, id]) =>
    route.update({ getParentRoute: () => rootRoute, id, path: id } as never)
  );
  if (ui) {
    children.push(
      createRoute({
        component: ui,
        getParentRoute: () => rootRoute,
        path: "$",
      })
    );
  }
  const router = createRouter({
    context: { api: client, queryClient, queryUtils } satisfies RouterContext,
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren(children),
  });
  render(
    <I18nextProvider i18n={createI18n("en")}>
      <QueryClientProvider client={queryClient}>
        <RpcProvider client={client} queryUtils={queryUtils}>
          <AuthStateProvider useSession={useGuestSession}>
            <LocalStoreProvider store={store}>
              <AnalyticsProvider analytics={recorder.analytics}>
                <TooltipProvider>
                  <ToastProvider>
                    {/* biome-ignore lint/suspicious/noExplicitAny: a test route tree, not the app's registered one */}
                    <RouterProvider router={router as any} />
                  </ToastProvider>
                </TooltipProvider>
              </AnalyticsProvider>
            </LocalStoreProvider>
          </AuthStateProvider>
        </RpcProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
  if (ui) {
    await screen.findByTestId("page");
  } else {
    await waitFor(() => expect(router.state.status).toBe("idle"));
  }
  return { calls, events: recorder.events, router: router as AnyRouter };
}
