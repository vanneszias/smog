import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";
import "./lib/i18n";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { orpc, queryClient } from "./utils/orpc";
import { persistOptions } from "./utils/queryPersister";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => <Loader />,
  context: { orpc, queryClient },
  Wrap({ children }: { children: React.ReactNode }) {
    return (
      <AuthKitProvider
        clientId={import.meta.env.VITE_WORKOS_CLIENT_ID}
        redirectUri={import.meta.env.VITE_WORKOS_REDIRECT_URI}
      >
        <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistOptions}
          >
            {children}
          </PersistQueryClientProvider>
        </ConvexProviderWithAuthKit>
      </AuthKitProvider>
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
