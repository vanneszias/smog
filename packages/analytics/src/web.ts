import {
  type Analytics,
  type AnalyticsTransport,
  type ConsentSource,
  createAnalytics,
} from "./gate";
import type { AnalyticsPlatform, RelayBody, TrackedEvent } from "./schema";

/** The site's same-origin relay route (`apps/site/src/routes/api/analytics.ts`). */
export const ANALYTICS_RELAY_PATH = "/api/analytics";

/** The relay transport; its calls resolve once the relay answered. */
export interface WebTransport extends AnalyticsTransport {
  identify: (userId: string, platform: AnalyticsPlatform) => Promise<void>;
  reset: () => void;
  screen: (path: string, platform: AnalyticsPlatform) => Promise<void>;
  track: (event: TrackedEvent) => Promise<void>;
}

export interface WebTransportOptions {
  /** Tests inject one; the browser's `fetch` otherwise. */
  fetch?: typeof fetch;
}

/**
 * The browser transport: no OpenPanel SDK and no credentials in the page.
 * Each call is a same-origin `POST /api/analytics` with `keepalive`, so an
 * event sent while navigating away still arrives. The relay adds the
 * OpenPanel credentials (spec §12). A non-2xx answer rejects, and the gate
 * logs it.
 */
export function createWebTransport(
  options: WebTransportOptions = {}
): WebTransport {
  let profileId: string | undefined;

  const send = async (body: RelayBody): Promise<void> => {
    const doFetch = options.fetch ?? globalThis.fetch;
    const response = await doFetch(ANALYTICS_RELAY_PATH, {
      body: JSON.stringify(body),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`The relay answered ${response.status}`);
    }
  };

  const withProfile = <T extends object>(payload: T) =>
    profileId === undefined ? payload : { ...payload, profileId };

  return {
    identify: (userId, platform) => {
      profileId = userId;
      return send({
        payload: {
          profileId: userId,
          properties: { auth_mode: "authenticated", platform },
        },
        type: "identify",
      });
    },
    reset: () => {
      profileId = undefined;
    },
    screen: (path, platform) =>
      send({
        payload: withProfile({
          name: "screen_view" as const,
          properties: { path, platform },
        }),
        type: "track",
      }),
    track: (event) =>
      send({ payload: withProfile(event), type: "track" } as RelayBody),
  };
}

const TRAILING_SLASH = /(.)\/$/;

/**
 * The screen path for a TanStack Router match's `fullPath`: the route
 * template (`/lists/$token`), never the URL, so ids, share tokens and
 * search params stay out of analytics.
 */
export function webRouteTemplate(fullPath: string): string {
  return fullPath.replace(TRAILING_SLASH, "$1");
}

export interface WebAnalyticsOptions
  extends ConsentSource,
    WebTransportOptions {}

/** The site's analytics: the consent gate over the relay transport. */
export function createWebAnalytics(options: WebAnalyticsOptions): Analytics {
  const { fetch, ...consent } = options;
  return createAnalytics({
    ...consent,
    platform: "web",
    transport: createWebTransport({ fetch }),
  });
}
