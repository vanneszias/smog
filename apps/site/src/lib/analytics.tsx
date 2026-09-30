import { useConsent } from "@smog/account/client";
import { NOOP_ANALYTICS } from "@smog/analytics";
import {
  AnalyticsProvider,
  type ConsentFeed,
  createConsentSource,
  useAnalyticsIdentity,
  useScreenTracking,
  useSignInCompleted,
  useSyncConsent,
} from "@smog/analytics/react";
import { createWebAnalytics, webRouteTemplate } from "@smog/analytics/web";
import { useAuthState } from "@smog/auth/react";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

/** The deepest match's route template (`/lists/$token`), never the URL. */
function useRouteTemplate(): string | null {
  const fullPath = useRouterState({
    select: (state) => state.matches.at(-1)?.fullPath ?? null,
  });
  return fullPath === null ? null : webRouteTemplate(fullPath);
}

/**
 * The consent (`useConsent`: the account's log when signed in, the device
 * for guests), screen views, the identity and `sign_in_completed`.
 */
function AnalyticsBridge({ consent }: { consent: ConsentFeed }): null {
  const auth = useAuthState();
  const userId = auth.status === "signedIn" ? (auth.user?.id ?? null) : null;
  useSyncConsent(consent, useConsent().analytics);
  useScreenTracking(useRouteTemplate());
  useAnalyticsIdentity(userId);
  useSignInCompleted(userId);
  return null;
}

/**
 * The site's analytics: the relay transport behind the consent gate.
 * Nothing is sent on the server, or before `useConsent` says `true`.
 */
export function SiteAnalytics({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [clients] = useState(() => {
    const consent = createConsentSource();
    return {
      analytics:
        typeof window === "undefined"
          ? NOOP_ANALYTICS
          : createWebAnalytics(consent),
      consent,
    };
  });
  return (
    <AnalyticsProvider analytics={clients.analytics}>
      <AnalyticsBridge consent={clients.consent} />
      {children}
    </AnalyticsProvider>
  );
}
