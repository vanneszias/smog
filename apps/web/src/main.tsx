import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";
import "./lib/i18n";
import Loader from "./components/loader";
import { AuthProvider } from "./lib/auth-context";
import {
  SecureAuthProvider,
  useAuthForConvex,
} from "./lib/secure-auth-provider";
import { routeTree } from "./routeTree.gen";
import { orpc, queryClient } from "./utils/orpc";
import { persistOptions } from "./utils/queryPersister";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

/**
 * Secure Auth Configuration
 *
 * Authentication is handled securely with:
 * - Refresh tokens stored in httpOnly cookies (not accessible to JavaScript)
 * - Access tokens stored in memory only (cleared on page close)
 * - Server-side token refresh (refresh token never exposed to client JS)
 *
 * This prevents XSS attacks from stealing authentication tokens.
 */
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => <Loader />,
  context: { orpc, queryClient },
  Wrap({ children }: { children: React.ReactNode }) {
    return (
      <SecureAuthProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
          <AuthProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={persistOptions}
            >
              {children}
            </PersistQueryClientProvider>
          </AuthProvider>
        </ConvexProviderWithAuth>
      </SecureAuthProvider>
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
