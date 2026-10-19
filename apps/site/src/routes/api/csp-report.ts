import { checkRateLimit } from "@smog/rpc";
import { createFileRoute } from "@tanstack/react-router";
import { siteEnv } from "../../server/auth";
import { handleCspReport } from "../../server/csp-report";

/**
 * The CSP report endpoint (phase 8 ruling 11): `report-uri` and
 * `report-to csp` point here (`worker/headers.ts`). Capped, rate-limited on
 * `RL_ANALYTICS` (`csp:<ip>`), always an empty answer, and one redacted
 * log line per violation (`server/csp-report.ts`). Open during maintenance.
 */
function handle({ request }: { request: Request }): Promise<Response> {
  const { rateLimits } = siteEnv();
  return handleCspReport(request, {
    limit: (key) => checkRateLimit(rateLimits.RL_ANALYTICS, key),
  });
}

export const Route = createFileRoute("/api/csp-report")({
  server: { handlers: { POST: handle } },
});
