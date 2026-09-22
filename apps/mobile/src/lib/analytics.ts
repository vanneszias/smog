import { OpenPanel } from "@openpanel/react-native";
import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";
import { useSegments } from "expo-router";
import { useEffect } from "react";
import { readConsent, subscribeConsent, useConsent } from "@/lib/consent";

/**
 * Analytics, direct from the device to OpenPanel — as `apps/native` did, and
 * as the spec decided on 2026-09-22 — with two deliberate differences.
 *
 * **Nobody is identified.** `apps/native` called `identify` with the account
 * id. The privacy policy this app links to says events "are not linked to
 * your account, even when you are signed in", so there is no `identify`, no
 * `profileId`, and no account field in any property here.
 *
 * **The client is built lazily, only once consent is granted**, and every
 * send re-checks the store — the `filter` option too, so an event already
 * queued inside the SDK is dropped after a withdrawal. A client built at
 * module scope from an unset variable is dead on import (spec, same-named
 * section); built lazily, a missing variable is a silent no-op instead.
 *
 * **Once built, it is kept for the app's life.** A withdrawal calls
 * `clear()` (the SDK's device and session ids go) and the gate above does
 * the rest; a re-grant reuses the same client. Building a fresh one per
 * grant would leak: the SDK's constructor registers an `AppState` listener
 * it never removes (`@openpanel/react-native/dist/index.js`).
 *
 * The credentials are `EXPO_PUBLIC_*`, so they ship inside the bundle and
 * are extractable from any installed copy. That is why they belong to a
 * separate least-privileged native OpenPanel client, never the web pair.
 * They must be read as literal `process.env.EXPO_PUBLIC_…` expressions:
 * Expo inlines only those at build time.
 */
type Client = InstanceType<typeof OpenPanel>;

let client: Client | null = null;

function granted(): boolean {
  return readConsent() === "granted";
}

function getClient(): Client | null {
  if (!granted()) {
    return null;
  }
  if (client !== null) {
    return client;
  }
  const clientId = process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID;
  const clientSecret = process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    return null;
  }
  try {
    client = new OpenPanel({
      apiUrl:
        process.env.EXPO_PUBLIC_OPENPANEL_API_URL ??
        "https://analytics.zias.be/api",
      clientId,
      clientSecret,
      filter: () => granted(),
    });
  } catch (error) {
    console.error("[analytics] Failed to start OpenPanel:", error);
    client = null;
  }
  return client;
}

subscribeConsent(() => {
  if (!granted() && client !== null) {
    client.clear();
  }
});

export function trackEvent<E extends AnalyticsEventName>(
  name: E,
  properties: AnalyticsEventMap[E]
): void {
  try {
    getClient()?.track(name, { ...properties, platform: "native" });
  } catch (error) {
    console.error("[analytics] Failed to send event:", error);
  }
}

function trackScreenView(path: string): void {
  try {
    getClient()?.screenView(path, { platform: "native" });
  } catch (error) {
    console.error("[analytics] Failed to send screen view:", error);
  }
}

/**
 * The route's file-system pattern — `/lists/[id]`, never `/lists/<an id>`.
 *
 * Built from expo-router's `useSegments()`, not `usePathname()`. Segments
 * are route *names* (`routeInfo.js`'s `getRouteInfoFromState` splits each
 * navigator's route name on `/`), so a dynamic segment is always its
 * `[param]` name and a param's value can never appear in one; the concrete
 * pathname is what expo-router builds *from* them by filling the params
 * in. A pathname-side normaliser would need its own copy of the route
 * table to know which segments are dynamic, and would silently leak the
 * first new dynamic route nobody added to it.
 *
 * Group segments (`(tabs)`, `(auth)`) are dropped, exactly as expo-router
 * drops them when it builds the pathname: a static route is therefore sent
 * as the same string it always was (`/search`, `/settings/account`,
 * `/sign-in`), and only dynamic ones change. `index` never reaches here —
 * expo-router already pops a trailing `index` — so `(tabs)/index` is `/`.
 * A catch-all (`[...rest]`) or `+not-found` stays as that literal name,
 * which is equally free of whatever the URL held.
 */
function screenPattern(segments: readonly string[]): string {
  const visible = segments.filter(
    (segment) => !(segment.startsWith("(") && segment.endsWith(")"))
  );
  return `/${visible.join("/")}`;
}

/**
 * One screen view per route pattern the person lands on, while consent is
 * granted. Patterns, never concrete paths (Stage 8.6 final review,
 * Critical): a list has one owner and the lists tab is signed-in only, so
 * `/lists/<id>` identifies an account — and the SDK keeps the last
 * screen-view path as `lastPath` and attaches it as `__path` to *every*
 * later `track` (`@openpanel/react-native/dist/index.js`), so a concrete
 * path would ride along on each event sent from that screen too. This hook
 * is the only caller of `screenView`, which is the only thing that sets
 * `lastPath`.
 */
export function useScreenViews(): void {
  const pattern = screenPattern(useSegments());
  const { consent } = useConsent();
  useEffect(() => {
    if (consent === "granted") {
      trackScreenView(pattern);
    }
  }, [consent, pattern]);
}

/** Tests only. */
export function resetAnalyticsForTests(): void {
  client = null;
}
