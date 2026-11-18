import {
  browserTracingIntegration,
  captureException,
  init,
  setUser,
  tanstackRouterBrowserTracingIntegration,
  withScope,
} from "@sentry/react";
import {
  monitoringRelease,
  scrubMonitoringBreadcrumb,
  scrubMonitoringEvent,
  tracesSampleRate,
} from "@smog/utils";
import type { AnyRouter } from "@tanstack/react-router";

/**
 * The browser's Sentry SDK, pointed at Rustrak through the Worker's tunnel
 * (`/api/monitoring`). A lazy chunk: only `./monitoring.ts` imports it,
 * with `import()`, so it never joins a route's initial JavaScript.
 */

/** The browser's tunnel (`routes/api/monitoring.ts`). */
const TUNNEL = "/api/monitoring";

/**
 * A fetch that failed for the network (offline, a dropped connection): no
 * issue to fix. A failed chunk load ("Failed to fetch dynamically imported
 * module") is not matched and still reported.
 */
const NETWORK_FAILURES = [
  /^(TypeError: )?Failed to fetch$/,
  /^(TypeError: )?Load failed$/,
  /^(TypeError: )?NetworkError when attempting to fetch resource\.$/,
];

export interface CaptureContext {
  componentStack?: string;
  feature?: string;
  handled: boolean;
}

export interface MonitoringSdk {
  capture: (error: Error, context: CaptureContext) => void;
  setUser: (id: string | null) => void;
}

export interface MonitoringConfig {
  dsn: string;
  environment: string;
  router: AnyRouter | null;
  userId: string | null;
}

export function initMonitoring({
  dsn,
  environment,
  router,
  userId,
}: MonitoringConfig): MonitoringSdk {
  init({
    beforeBreadcrumb: scrubMonitoringBreadcrumb,
    beforeSend: scrubMonitoringEvent,
    beforeSendTransaction: scrubMonitoringEvent,
    dataCollection: {
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: false, response: false },
      urlQueryParams: false,
      userInfo: false,
    },
    dsn,
    environment,
    ignoreErrors: NETWORK_FAILURES,
    initialScope: { tags: { service: "web" } },
    integrations: [
      router
        ? tanstackRouterBrowserTracingIntegration(router)
        : browserTracingIntegration(),
    ],
    release: monitoringRelease("web", __SMOG_RELEASE__),
    // Rustrak takes classic transactions, not v11's streamed spans.
    traceLifecycle: "static",
    tracesSampleRate: tracesSampleRate(environment),
    tunnel: TUNNEL,
  });
  if (userId) {
    setUser({ id: userId });
  }
  return {
    capture(error, { componentStack, feature, handled }) {
      withScope((scope) => {
        if (componentStack) {
          scope.setContext("react", { componentStack });
        }
        if (feature) {
          scope.setTag("feature", feature);
        }
        captureException(error, {
          mechanism: { handled, type: "auto.function.react" },
        });
      });
    },
    setUser(id) {
      setUser(id ? { id } : null);
    },
  };
}
