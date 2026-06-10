import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@smog/api/routers/index";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import Header from "@/components/header";
import { AppStoreBanner } from "@/components/home/AppStoreBanner";
import { NotFoundComponent } from "@/components/NotFoundPage";
import { PrivacyConsentBanner } from "@/components/privacy-consent-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/lib/auth";
import {
  clearAnalyticsIdentity,
  getAnalyticsConsent,
  identifyAnalyticsUser,
  subscribeAnalyticsConsent,
  trackScreenView,
} from "@/lib/openpanel";
import { link, type orpc } from "@/utils/orpc";
import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const [client] = useState<AppRouterClient>(() => createORPCClient(link));
  const [_orpcUtils] = useState(() => createTanstackQueryUtils(client));
  const location = useLocation();
  const { isLoading: isAuthLoading, user } = useAuth();
  const identifiedProfileId = useRef<string | null>(null);
  const analyticsConsent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsent,
    getAnalyticsConsent
  );

  // Update document language attribute based on i18n
  const { i18n: i18nInstance } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18nInstance.language;
  }, [i18nInstance.language]);

  useEffect(() => {
    if (analyticsConsent !== true) {
      identifiedProfileId.current = null;
      return;
    }
    if (isAuthLoading) {
      return;
    }

    const nextProfileId = user?.id ?? null;
    if (identifiedProfileId.current === nextProfileId) {
      return;
    }
    if (identifiedProfileId.current) {
      clearAnalyticsIdentity();
    }

    // Signed-out web visitors remain anonymous OpenPanel device profiles.
    if (user) {
      identifyAnalyticsUser(user);
    }
    identifiedProfileId.current = nextProfileId;
  }, [analyticsConsent, isAuthLoading, user]);

  useEffect(() => {
    if (analyticsConsent === true && !isAuthLoading) {
      trackScreenView(location.href);
    }
  }, [analyticsConsent, isAuthLoading, location.href]);

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="grid h-svh grid-rows-[auto_auto_1fr] overflow-hidden">
          <Header />
          {location.pathname === "/" && <AppStoreBanner />}
          <main className="min-h-0 overflow-y-auto" id="main-content">
            <Outlet />
          </main>
        </div>
        <Toaster richColors />
        <PrivacyConsentBanner />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
    </>
  );
}
