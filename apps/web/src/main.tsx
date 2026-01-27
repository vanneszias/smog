import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";
import Loader from "./components/loader";
import { initializeAnalytics } from "./lib/analytics";
import { AuthProvider, useAuthForConvex } from "./lib/auth";
import { ConvexUserSync } from "./lib/convex-user-sync";
import { FavoritesProvider } from "./lib/favorites-context";
import i18n from "./lib/i18n";
import { routeTree } from "./routeTree.gen";
import { orpc, queryClient } from "./utils/orpc";
import { persistOptions } from "./utils/queryPersister";

/**
 * Keyboard Navigation Detection
 * Adds 'user-is-tabbing' class to body when user tabs for better focus indicators
 */
function handleFirstTab(e: KeyboardEvent) {
  if (e.key === "Tab") {
    document.body.classList.add("user-is-tabbing");
    window.removeEventListener("keydown", handleFirstTab);
    window.addEventListener("mousedown", handleMouseDownOnce);
  }
}

function handleMouseDownOnce() {
  document.body.classList.remove("user-is-tabbing");
  window.removeEventListener("mousedown", handleMouseDownOnce);
  window.addEventListener("keydown", handleFirstTab);
}

// Initialize keyboard navigation detection
window.addEventListener("keydown", handleFirstTab);

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
  throw new Error(
    i18n.t("common.errors.rootElementNotFound", "Root element not found")
  );
}

// Initialize analytics
initializeAnalytics();

// Update HTML lang attribute based on stored language
const storedLanguage = localStorage.getItem("smog_language");
if (storedLanguage) {
  document.documentElement.lang = storedLanguage;
}

// Listen for language changes
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
