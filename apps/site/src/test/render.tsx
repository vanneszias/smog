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
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const GUEST: SessionHookResult = { data: null, error: null, isPending: false };

function useGuestSession(): SessionHookResult {
  return GUEST;
}

export interface RenderedSite {
  /** Every analytics event the screen tracked. */
  events: AnalyticsEvent[];
}

/**
 * Renders `ui` as the page at `path` (English), inside the site's providers:
 * a memory router whose root has the shell's `siteUrl`, a guest session, a
 * memory local store, recording analytics and an API client that is never
 * reached (every request fails).
 */
export async function renderSite(
  ui: () => ReactNode,
  { path = "/" }: { path?: string } = {}
): Promise<RenderedSite> {
  const recorder = createRecordingAnalytics();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const api = createApiClient({
    baseUrl: "http://localhost:5173",
    fetch: () => Promise.reject(new TypeError("No network in tests")),
  });
  const store = createLocalStore(createMemoryAdapter());
  const rootRoute = createRootRoute({
    component: Outlet,
    loader: () => ({ siteUrl: "https://smog.test" }),
  });
  const pageRoute = createRoute({
    component: ui,
    getParentRoute: () => rootRoute,
    path: "$",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([pageRoute]),
  });
  render(
    <I18nextProvider i18n={createI18n("en")}>
      <QueryClientProvider client={queryClient}>
        <RpcProvider client={api} queryUtils={createApiQueryUtils(api)}>
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
  await screen.findByTestId("page");
  return { events: recorder.events };
}
