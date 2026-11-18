import { useAuthState } from "@smog/auth/react";
import type { AnyRouter } from "@tanstack/react-router";
import { type ErrorInfo, useEffect } from "react";
import type { MonitoringSdk } from "./monitoring.sdk";

/**
 * Error monitoring in the browser (docs/ERROR_MONITORING.md), the part in
 * the entry: a few hundred bytes that know whether the page reports and
 * hold what happens before the SDK is there. The Sentry SDK itself
 * (`monitoring.sdk.ts`, about 30 kB gzip) is a lazy chunk loaded right
 * after hydration starts, so it is outside every route's initial
 * JavaScript (`perf-budget.json`).
 *
 * The page says whether to report: the root route renders the env's DSN
 * and environment as `<meta name="smog-monitoring-*">` (`getShell`), only
 * when the Worker has a `SENTRY_DSN`. Without them nothing loads.
 *
 * What it reports: uncaught errors and rejections (React's uncaught and
 * recoverable errors among them), errors an error boundary caught
 * (`hydrationErrorOptions`, so TanStack Router's error component too). Not reported: redirects and not-found (not `Error`s), an
 * API error below 500 (an expected answer; the Worker reports its own
 * 500s) and a fetch that failed for the network.
 */

export const MONITORING_DSN_META = "smog-monitoring-dsn";
export const MONITORING_ENVIRONMENT_META = "smog-monitoring-environment";

type Pending = (sdk: MonitoringSdk) => void;

let enabled = false;
let sdk: MonitoringSdk | null = null;
let router: AnyRouter | null = null;
let userId: string | null = null;
const pending: Pending[] = [];
/** At most this many reports wait for the SDK; later ones are dropped. */
const MAX_PENDING = 20;

function run(action: Pending): void {
  if (sdk) {
    action(sdk);
  } else if (enabled && pending.length < MAX_PENDING) {
    pending.push(action);
  }
}

/** An `ORPCError` (or any typed API error) that is an expected answer. */
function isExpectedApiError(error: Error): boolean {
  const { status } = error as { status?: unknown };
  return typeof status === "number" && status < 500;
}

/** Whether an error is worth an issue; see the module comment. */
export function shouldReport(error: unknown): error is Error {
  return error instanceof Error && !isExpectedApiError(error);
}

/** The signed-in user's id (pseudonymous), or null after sign-out. */
function setMonitoringUser(id: string | null): void {
  userId = id;
  run((loaded) => loaded.setUser(id));
}

/**
 * Keeps the reported user in step with the session (the root document
 * renders it inside `AuthStateProvider`): the account id only, never an
 * address or a name.
 */
export function MonitoringUser(): null {
  const { user } = useAuthState();
  const id = user?.id ?? null;
  useEffect(() => {
    setMonitoringUser(id);
  }, [id]);
  return null;
}

/**
 * The client router, for navigation transactions named by route
 * (`src/router.tsx` registers it in the browser).
 */
export function setMonitoringRouter(instance: AnyRouter): void {
  router = instance;
}

function readMeta(name: string): string | null {
  return (
    document
      .querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
      ?.getAttribute("content") ?? null
  );
}

function onWindowError(event: ErrorEvent): void {
  reportUnhandled(event.error);
}

function onRejection(event: PromiseRejectionEvent): void {
  reportUnhandled(event.reason);
}

function reportUnhandled(error: unknown): void {
  if (shouldReport(error)) {
    run((loaded) => loaded.capture(error, { handled: false }));
  }
}

/**
 * Starts monitoring when the page asks for it (`src/client.tsx`, before
 * hydration): window errors are held until the SDK has loaded and its own
 * handlers take over.
 */
export function startMonitoring(): void {
  const dsn = readMeta(MONITORING_DSN_META);
  if (enabled || !dsn) {
    return;
  }
  enabled = true;
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onRejection);
  import("./monitoring.sdk")
    .then(({ initMonitoring }) => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onRejection);
      sdk = initMonitoring({
        dsn,
        environment: readMeta(MONITORING_ENVIRONMENT_META) ?? "production",
        router,
        userId,
      });
      for (const action of pending.splice(0)) {
        action(sdk);
      }
    })
    .catch((error: unknown) => {
      enabled = false;
      pending.length = 0;
      // A warning: an error line here would be reported by nobody anyway.
      console.warn("[monitoring] Failed to load the SDK:", error);
    });
}

type ReactErrorHandler = (error: unknown, errorInfo: ErrorInfo) => void;

/**
 * `hydrateRoot`'s error options while monitoring is on (call it after
 * `startMonitoring`). Only `onCaughtError`: an error an error boundary
 * caught (TanStack Router's error component included) never reaches the
 * window, so it is reported here, then logged as React does by default (the
 * option replaces React's own logging). Uncaught and recoverable errors
 * keep React's default, `window.reportError`, which the window handlers
 * above and then the SDK's own already report. Off: no options, React's
 * defaults unchanged.
 */
export function hydrationErrorOptions(): {
  onCaughtError?: ReactErrorHandler;
} {
  if (!enabled) {
    return {};
  }
  return {
    onCaughtError(error, errorInfo) {
      if (shouldReport(error)) {
        run((loaded) =>
          loaded.capture(error, {
            componentStack: errorInfo.componentStack ?? undefined,
            handled: true,
          })
        );
      }
      console.error(error);
    },
  };
}
