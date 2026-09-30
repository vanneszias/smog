import type { Analytics } from "./gate";
import type { AnalyticsEvent } from "./schema";

/**
 * An `Analytics` that records every call (tests only): wrap the hook
 * under test in `<AnalyticsProvider analytics={recorder.analytics}>`.
 */
export function createRecordingAnalytics(): {
  analytics: Analytics;
  events: AnalyticsEvent[];
} {
  const events: AnalyticsEvent[] = [];
  return {
    analytics: {
      identify: () => undefined,
      isAllowed: () => true,
      reset: () => undefined,
      screen: () => undefined,
      track: (event) => {
        events.push(event);
      },
    },
    events,
  };
}
