import {
  captureException,
  captureMessage,
  expoRouterIntegration,
  init,
  setUser,
  withScope,
  wrap,
} from "@sentry/react-native";
import { useAuthState } from "@smog/auth/react";
import {
  featureOf,
  redactMessage,
  scrubMonitoringBreadcrumb,
  scrubMonitoringEvent,
  tracesSampleRate,
} from "@smog/utils";
import { isRunningInExpoGo } from "expo";
import { type ComponentType, useEffect } from "react";
import { mobileEnv } from "@/lib/env";

/**
 * Error monitoring of the app (docs/ERROR_MONITORING.md): the Sentry React
 * Native SDK, pointed at Rustrak with `EXPO_PUBLIC_SENTRY_DSN`. Without the
 * DSN (local runs, the tests) nothing starts and the root layout is not
 * wrapped.
 *
 * What it reports: JS errors and unhandled rejections, native crashes and
 * app hangs, release health (sessions), screen transactions named by
 * Expo Router route (10 % in production), and every
 * `console.error("[feature] Failed to ...", error)` line, tagged with its
 * `feature`. A fetch that failed for the network is not an issue. Every
 * event goes through the `@smog/utils` scrubbers; the user is the account
 * id only (`MonitoringUser`).
 */

/** The fetch failure of an offline device: a normal state, not a bug. */
const NETWORK_FAILURES = [/^(TypeError: )?Network request failed$/];

let enabled = false;

/**
 * Reports a `console.error` line: its Error when it carries one, else the
 * line itself when it has a `[feature]` prefix. The original console still
 * prints it first.
 */
function reportConsoleError(args: unknown[]): void {
  const error = args.find((arg) => arg instanceof Error);
  const feature = featureOf(args[0]);
  if (!(error || feature)) {
    return;
  }
  withScope((scope) => {
    if (feature) {
      scope.setTag("feature", feature);
    }
    const text = args
      .filter((arg) => !(arg instanceof Error))
      .map((arg) => (typeof arg === "string" ? arg : String(arg)))
      .join(" ");
    if (error) {
      scope.setExtra("arguments", [redactMessage(text)]);
      captureException(error, {
        mechanism: { handled: true, type: "auto.console" },
      });
    } else {
      captureMessage(text, "error");
    }
  });
}

function captureConsoleErrors(): void {
  const original = console.error;
  let reporting = false;
  console.error = (...args: unknown[]) => {
    original(...args);
    if (reporting) {
      return;
    }
    reporting = true;
    try {
      reportConsoleError(args);
    } finally {
      reporting = false;
    }
  };
}

/** Starts the SDK once, before the root layout renders (`app/_layout.tsx`). */
export function initMonitoring(): void {
  const env = mobileEnv();
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
  if (enabled || !dsn) {
    return;
  }
  enabled = true;
  const environment = env.EXPO_PUBLIC_ENVIRONMENT;
  init({
    beforeBreadcrumb: scrubMonitoringBreadcrumb,
    beforeSend: scrubMonitoringEvent,
    beforeSendTransaction: scrubMonitoringEvent,
    dsn,
    enableNativeFramesTracking: !isRunningInExpoGo(),
    environment,
    ignoreErrors: NETWORK_FAILURES,
    initialScope: { tags: { service: "mobile" } },
    integrations: [expoRouterIntegration()],
    sendDefaultPii: false,
    // Traces continue into our own API only (Mux, OpenPanel need none).
    tracePropagationTargets: [env.EXPO_PUBLIC_API_URL],
    tracesSampleRate: tracesSampleRate(environment),
  });
  captureConsoleErrors();
}

/**
 * Keeps the reported user in step with the session (`AppProviders`
 * renders it inside `AuthStateProvider`): the account id only.
 */
export function MonitoringUser(): null {
  const { user } = useAuthState();
  const id = user?.id ?? null;
  useEffect(() => {
    if (enabled) {
      setUser(id ? { id } : null);
    }
  }, [id]);
  return null;
}

/** Sentry's root wrapper when monitoring runs, else the component as is. */
export function wrapRoot(component: ComponentType): ComponentType {
  return enabled ? wrap(component) : component;
}
