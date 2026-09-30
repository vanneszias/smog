import { useConsent } from "@smog/account/client";
import {
  type Analytics,
  createNativeAnalytics,
  nativeRouteTemplate,
} from "@smog/analytics/native";
import {
  AnalyticsProvider,
  type ConsentFeed,
  createConsentSource,
  useAnalyticsIdentity,
  useScreenTracking,
  useSignInCompleted,
  useSyncConsent,
} from "@smog/analytics/react";
import { useAuthState } from "@smog/auth/react";
import { useSegments } from "expo-router";
import type { ReactElement } from "react";
import { mobileEnv } from "@/lib/env";

export interface MobileAnalytics {
  analytics: Analytics;
  /** Fed by `useConsent` (the account's log signed in, the device for guests). */
  consent: ConsentFeed;
}

/**
 * The app's analytics: the OpenPanel client behind the consent gate,
 * created on the first consented event.
 */
export function createMobileAnalytics(): MobileAnalytics {
  const env = mobileEnv();
  const consent = createConsentSource();
  return {
    analytics: createNativeAnalytics({
      apiUrl: env.EXPO_PUBLIC_OPENPANEL_API_URL,
      clientId: env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID,
      clientSecret: env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET,
      getConsent: consent.getConsent,
      subscribe: consent.subscribe,
    }),
    consent,
  };
}

function ConsentSync({ consent }: { consent: ConsentFeed }): null {
  useSyncConsent(consent, useConsent().analytics);
  return null;
}

/**
 * Provides analytics and keeps its consent in step with `useConsent`.
 * Without an instance (tests) the hooks are no-ops.
 */
export function MobileAnalyticsProvider({
  children,
  value,
}: {
  children: ReactElement;
  value: MobileAnalytics | undefined;
}): ReactElement {
  if (!value) {
    return children;
  }
  return (
    <AnalyticsProvider analytics={value.analytics}>
      <ConsentSync consent={value.consent} />
      {children}
    </AnalyticsProvider>
  );
}

/**
 * Screen views (the Expo Router template, `/lists/[token]`), the identity
 * and `sign_in_completed`. Mounted once in the app shell.
 */
export function AnalyticsBridge(): null {
  const auth = useAuthState();
  const segments = useSegments();
  const userId = auth.status === "signedIn" ? (auth.user?.id ?? null) : null;
  useScreenTracking(nativeRouteTemplate(segments));
  useAnalyticsIdentity(userId);
  useSignInCompleted(userId);
  return null;
}
