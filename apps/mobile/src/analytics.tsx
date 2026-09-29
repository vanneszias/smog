import {
  type Analytics,
  createNativeAnalytics,
  nativeRouteTemplate,
} from "@smog/analytics/native";
import {
  useAnalyticsIdentity,
  useScreenTracking,
  useSignInCompleted,
} from "@smog/analytics/react";
import { useAuthState } from "@smog/auth/react";
import type { LocalStore } from "@smog/local-store";
import { useSegments } from "expo-router";
import { mobileEnv } from "@/lib/env";

/**
 * The app's analytics: the OpenPanel client behind the consent gate,
 * created on the first consented event. For now the consent comes from the
 * local store (`consent.analytics`); the account task makes `useConsent`
 * the source.
 */
export function createMobileAnalytics(store: LocalStore): Analytics {
  const env = mobileEnv();
  return createNativeAnalytics({
    apiUrl: env.EXPO_PUBLIC_OPENPANEL_API_URL,
    clientId: env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID,
    clientSecret: env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET,
    getConsent: () => store.getSnapshot().consent.analytics,
    subscribe: store.subscribe,
  });
}

/**
 * Screen views (the Expo Router template, `/lists/[token]`), the identity
 * and `sign_in_completed`. Mounted once in the root layout.
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
