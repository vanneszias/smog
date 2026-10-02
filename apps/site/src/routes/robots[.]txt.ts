import { createFileRoute } from "@tanstack/react-router";
import { robotsTxt } from "@/lib/robots";
import { siteOrigin } from "@/lib/site-url";
import { siteEnv } from "@/server/auth";

/**
 * `/robots.txt`: a route rather than a static file, so the `Sitemap:` line
 * is this environment's absolute `SITE_URL` and only production is indexed.
 */
function robots(): Response {
  try {
    const { vars } = siteEnv();
    const body = robotsTxt({
      environment: vars.ENVIRONMENT,
      origin: siteOrigin(vars.SITE_URL),
    });
    return new Response(body, {
      headers: {
        "cache-control": "public, max-age=86400",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[robots] Failed to build robots.txt:", error);
    throw error;
  }
}

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: robots } },
});
