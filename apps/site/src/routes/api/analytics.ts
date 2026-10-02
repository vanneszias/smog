import { waitUntil } from "cloudflare:workers";
import { handleAnalyticsRelay } from "@smog/analytics/server";
import { checkRateLimit, isForeignRequest } from "@smog/rpc";
import { createFileRoute } from "@tanstack/react-router";
import { siteEnv } from "../../server/auth";

/**
 * The first-party OpenPanel relay (spec §12): the browser never talks to
 * OpenPanel. Same-origin only, `RL_ANALYTICS` per IP, taxonomy-validated,
 * forwarded after the answer (`waitUntil`), and always 202 once accepted.
 */
function handle({ request }: { request: Request }): Promise<Response> {
  const { rateLimits, worker } = siteEnv();
  return handleAnalyticsRelay(request, {
    env: worker,
    isForeign: (candidate) => isForeignRequest(candidate, worker),
    limit: (key) => checkRateLimit(rateLimits.RL_ANALYTICS, key),
    waitUntil,
  });
}

export const Route = createFileRoute("/api/analytics")({
  server: { handlers: { POST: handle } },
});
