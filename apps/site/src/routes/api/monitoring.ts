import { checkRateLimit, isForeignRequest } from "@smog/rpc";
import { createFileRoute } from "@tanstack/react-router";
import { siteEnv } from "../../server/auth";
import { handleMonitoringTunnel } from "../../server/monitoring-tunnel";

/**
 * The browser's error-monitoring tunnel (docs/ERROR_MONITORING.md): the
 * SDK posts its envelopes here and the Worker forwards those for this
 * env's `SENTRY_DSN` to Rustrak. Same-origin only, `RL_ANALYTICS` per IP,
 * capped, and an empty answer (`server/monitoring-tunnel.ts`).
 */
function handle({ request }: { request: Request }): Promise<Response> {
  const { rateLimits, worker } = siteEnv();
  return handleMonitoringTunnel(request, {
    dsn: worker.SENTRY_DSN,
    isForeign: (candidate) => isForeignRequest(candidate, worker),
    limit: (key) => checkRateLimit(rateLimits.RL_ANALYTICS, key),
  });
}

export const Route = createFileRoute("/api/monitoring")({
  server: { handlers: { POST: handle } },
});
