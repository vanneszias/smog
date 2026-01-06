import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";
import "./lib/i18n";
import Loader from "./components/loader";
import { AuthProvider, useAuthForConvex } from "./lib/auth";
import { ConvexUserSync } from "./lib/convex-user-sync";
import { FavoritesProvider } from "./lib/favorites-context";
import { routeTree } from "./routeTree.gen";
import { orpc, queryClient } from "./utils/orpc";
import { persistOptions } from "./utils/queryPersister";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

/**
 * Application Root
 *
 * Authentication flow:
 * 1. AuthProvider handles WorkOS OAuth flow via server
 * 2. ConvexProviderWithAuth receives tokens via useAuthForConvex
 * 3. Convex validates the JWT using auth.config.ts
 * 4. ConvexUserSync creates/syncs user records in Convex database
 *
 * Security:
 * - Refresh tokens stored in httpOnly cookies (XSS protection)
 * - Access tokens stored in memory only (cleared on page close)
 */
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => <Loader />,
  context: { orpc, queryClient },
  Wrap({ children }: { children: React.ReactNode }) {
    return (
      <AuthProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
          <ConvexUserSync>
            <FavoritesProvider>
              <PersistQueryClientProvider
                client={queryClient}
                persistOptions={persistOptions}
              >
                {children}
              </PersistQueryClientProvider>
            </FavoritesProvider>
          </ConvexUserSync>
        </ConvexProviderWithAuth>
      </AuthProvider>
    );
  },
});

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
