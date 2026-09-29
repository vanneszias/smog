import { NOOP_ANALYTICS } from "@smog/analytics";
import {
  AnalyticsProvider,
  useAnalyticsIdentity,
  useScreenTracking,
  useSignInCompleted,
} from "@smog/analytics/react";
import { createWebAnalytics, webRouteTemplate } from "@smog/analytics/web";
import { useAuthState } from "@smog/auth/react";
import type { LocalStore } from "@smog/local-store";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

/** The deepest match's route template (`/lists/$token`), never the URL. */
function useRouteTemplate(): string | null {
  const fullPath = useRouterState({
    select: (state) => state.matches.at(-1)?.fullPath ?? null,
  });
  return fullPath === null ? null : webRouteTemplate(fullPath);
}

/** Screen views, the identity and `sign_in_completed`, from the router and the session. */
function AnalyticsBridge(): null {
  const auth = useAuthState();
  const userId = auth.status === "signedIn" ? (auth.user?.id ?? null) : null;
  useScreenTracking(useRouteTemplate());
  useAnalyticsIdentity(userId);
  useSignInCompleted(userId);
  return null;
}

/**
 * The site's analytics: the relay transport behind the consent gate. For
 * now the consent comes from the local store (`consent.analytics`); the
 * account task makes `useConsent` the source. Nothing is sent on the
 * server, or before the store says `true`.
 */
export function SiteAnalytics({
  children,
  store,
}: {
  children: ReactNode;
  store: LocalStore;
}): ReactNode {
  const [analytics] = useState(() =>
    typeof window === "undefined"
      ? NOOP_ANALYTICS
      : createWebAnalytics({
          getConsent: () => store.getSnapshot().consent.analytics,
          subscribe: store.subscribe,
        })
  );
  return (
    <AnalyticsProvider analytics={analytics}>
      <AnalyticsBridge />
      {children}
    </AnalyticsProvider>
  );
}
