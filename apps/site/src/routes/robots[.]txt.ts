import { createFileRoute } from "@tanstack/react-router";
import { siteOrigin } from "@/lib/site-url";
import { siteEnv } from "@/server/auth";

/** Never crawled: admin, the API, dev tools and the account (inventory P-15). */
const DISALLOW = ["/admin", "/api/", "/dev/", "/account"] as const;

/**
 * `/robots.txt`: a route rather than a static file, so the `Sitemap:` line
 * is the absolute URL of this environment's `SITE_URL`.
 */
function robots(): Response {
  try {
    const origin = siteOrigin(siteEnv().vars.SITE_URL);
    const body = [
      "User-agent: *",
      "Allow: /",
      ...DISALLOW.map((path) => `Disallow: ${path}`),
      "",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n");
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
