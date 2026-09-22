"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Fires `gesture_viewed` once, on mount, for the detail page.
 *
 * Renders nothing. It exists only because the page it sits on
 * (`app/(frontend)/[locale]/gestures/[id]/page.tsx`) is a Server Component,
 * and the consent gate this event goes through lives in `localStorage` —
 * unreadable on the server, and unreadable before hydration. A client
 * island is the only place this call can be made from.
 *
 * `source: "direct"` unconditionally, exactly as `apps/web/src/routes/
 * gestures_.$id.tsx:70-73` sends it: that route does not attempt to infer
 * how the visitor arrived (a referrer, a related-gesture click, a search
 * result) and neither does this one. Keeping the same constant keeps the
 * two stacks' data comparable while both are live — see Task 7's brief.
 *
 * `[gestureId]` is the effect's only dependency. The id is this page's own
 * route param, not state that changes under it, so in practice this fires
 * exactly once per navigation to a gesture — which is the same "one view,
 * one event" property the old route had via its own `useEffect`.
 */
export function GestureViewTracker({ gestureId }: { gestureId: string }) {
  useEffect(() => {
    trackEvent("gesture_viewed", { gesture_id: gestureId, source: "direct" });
  }, [gestureId]);

  return null;
}
