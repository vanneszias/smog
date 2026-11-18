import {
  type CloudflareOptions,
  captureConsoleIntegration,
  cronTriggersIntegration,
} from "@sentry/cloudflare";
import { ENVIRONMENTS } from "@smog/config/env/worker";
import { cronName } from "@smog/jobs/cron";
import {
  monitoringRelease,
  scrubMonitoringBreadcrumb,
  scrubMonitoringEvent,
  tracesSampleRate,
} from "@smog/utils";

/**
 * Error monitoring of the Worker (docs/ERROR_MONITORING.md): the options
 * `withSentry` (`src/worker.ts`) initialises the SDK with on every
 * invocation. Off (undefined) without `SENTRY_DSN`, so dev and the tests
 * send nothing.
 *
 * What it reports:
 * - an exception that escapes `fetch` (`respondSecurely` hands it over
 *   before answering 500), `queue` or `scheduled` (the SDK's own wrappers,
 *   which rethrow, so retries and dead letters are unchanged);
 * - every `console.error` line (`captureConsoleIntegration`): the
 *   project's `[service] Failed to ...:`, error lines become issues with
 *   that `service` as their `feature` tag (`scrubMonitoringEvent`). The
 *   top-level `[error] <entry>` line is dropped here: its exception is
 *   reported as itself;
 * - a check-in per Cron Trigger run, one monitor per `@smog/jobs` cron
 *   name (`expiry`, `reminders`, `stale`, `retention`);
 * - request, queue and cron transactions (10 % in production).
 *
 * Every event, transaction and breadcrumb goes through the scrubbers of
 * `@smog/utils` (no cookies, bodies, queries, fragments, addresses or
 * tokens; the user is an id at most).
 */

/** The top-level line of `logUnhandledError` (`@smog/utils`). */
const TOP_LEVEL_LINE = /^\[error\] (fetch|queue|scheduled) /;

/** The DSN of an env, or undefined when monitoring is off. */
export function monitoringDsn(env: unknown): string | undefined {
  const dsn = (env as { SENTRY_DSN?: unknown } | undefined)?.SENTRY_DSN;
  return typeof dsn === "string" && dsn !== "" ? dsn : undefined;
}

/** The Worker's SDK options, or undefined (no DSN: monitoring is off). */
export function monitoringOptions(env: unknown): CloudflareOptions | undefined {
  const dsn = monitoringDsn(env);
  if (!dsn) {
    return;
  }
  const raw = (env as { ENVIRONMENT?: unknown }).ENVIRONMENT;
  const environment = ENVIRONMENTS.find((name) => name === raw) ?? "production";
  return {
    beforeBreadcrumb: scrubMonitoringBreadcrumb,
    beforeSend(event) {
      const line = event.logentry?.message ?? event.message;
      if (typeof line === "string" && TOP_LEVEL_LINE.test(line)) {
        return null;
      }
      return scrubMonitoringEvent(event);
    },
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
    initialScope: { tags: { service: "worker" } },
    integrations: [
      captureConsoleIntegration({ levels: ["error"] }),
      cronTriggersIntegration({
        monitorSlug: (cron) => cronName(cron) ?? undefined,
      }),
    ],
    release: monitoringRelease("worker", __SMOG_RELEASE__),
    // Rustrak takes classic transactions, not v11's streamed spans.
    traceLifecycle: "static",
    tracesSampleRate: tracesSampleRate(environment),
  };
}
