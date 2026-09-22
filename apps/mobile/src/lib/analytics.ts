import { OpenPanel } from "@openpanel/react-native";
import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";
import { readConsent, subscribeConsent } from "@/lib/consent";

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
    client = null;
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

export function trackScreenView(path: string): void {
  try {
    getClient()?.screenView(path, { platform: "native" });
  } catch (error) {
    console.error("[analytics] Failed to send screen view:", error);
  }
}

/** Tests only. */
export function resetAnalyticsForTests(): void {
  client = null;
}
