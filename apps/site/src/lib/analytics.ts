import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";
import { readConsent } from "@/lib/consentStore";

/**
 * The browser's one way to reach OpenPanel: the relay from Task 6.
 *
 * `POST /api/analytics/track` (`endpoints/analytics.ts`), mounted on this
 * same origin, so no rewrite and no `VITE_SERVER_URL`-style base URL are
 * needed — unlike `apps/web`, which posted cross-origin to a separate
 * server.
 */
const TRACK_URL = "/api/analytics/track";

/**
 * The gate. Everything past this line assumes consent, so nothing above it
 * may run first — see the module note below for why the check has to be
 * this shape and not `if (!consent)`.
 *
 * `readConsent()` comes from `@/lib/consentStore`, the one copy of this
 * decision (Task 2); this module keeps no state of its own.
 */
function hasConsent(): boolean {
  return readConsent() === "granted";
}

/**
 * Posts one event to the relay, or does nothing at all.
 *
 * ## The gate is positive, not falsy
 *
 * `readConsent() !== "granted"` — not `!readConsent()`. `ConsentState` is
 * `"granted" | "denied" | null`, and both `"denied"` and `null` (undecided)
 * must drop the payload. `if (!consent)` reads as the same check today only
 * because both refusal states happen to be falsy strings/`null`; the moment
 * a fourth state is added it silently starts sending on it. Positive checks
 * do not have that failure mode. Ported from `apps/web/src/lib/
 * openpanel.ts:37`, whose `getAnalyticsConsent() !== true` is the same
 * property against that stack's own boolean-shaped store.
 *
 * ## Never throws, never blocks
 *
 * The `fetch` is fire-and-forget: no `await` in the caller, and a rejection
 * (offline, an aborted navigation, a blocked request) is caught and logged,
 * never rethrown. A gesture card, a search box or a favorite button firing
 * this must complete its own job — saving a favorite, updating the URL —
 * whether or not the beacon ever lands. Transcribed from the same
 * reasoning in `openpanel.ts`'s `sendAnalyticsPayload`.
 *
 * `keepalive: true` lets the request outlive a navigation that starts right
 * after — the common case, since every call site here fires from a click or
 * a mount that is often followed immediately by a route change.
 */
export function trackEvent<EventName extends AnalyticsEventName>(
  name: EventName,
  properties: AnalyticsEventMap[EventName]
): void {
  if (!hasConsent()) {
    return;
  }

  fetch(TRACK_URL, {
    body: JSON.stringify({
      payload: {
        name,
        properties: {
          ...properties,
          platform: "web",
        },
      },
      type: "track",
    }),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch((error) => {
    console.warn("[analytics] Failed to send event:", error);
  });
}
