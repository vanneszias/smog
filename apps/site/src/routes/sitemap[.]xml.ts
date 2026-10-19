import { escapeHtml } from "@smog/utils";
import { createFileRoute } from "@tanstack/react-router";
import { siteOrigin } from "@/lib/site-url";
import { siteEnv } from "@/server/auth";
import { createInProcessApiClient } from "@/server/in-process-api";

/** The public pages (P-16): the wizard, not its token and return pages. */
const STATIC_PATHS = [
  "/",
  "/gestures",
  "/sponsor",
  "/privacy",
  "/terms",
] as const;

function url(loc: string, lastmod?: number): string {
  const modified =
    lastmod === undefined
      ? ""
      : `<lastmod>${new Date(lastmod).toISOString()}</lastmod>`;
  return `<url><loc>${escapeHtml(loc)}</loc>${modified}</url>`;
}

/**
 * `/sitemap.xml` (spec §9): the public pages and every published gesture
 * (`gestures.sitemap`, one D1 read, at most 50 000 rows: the protocol's
 * limit), cached for an hour.
 */
async function sitemap(): Promise<Response> {
  try {
    const origin = siteOrigin(siteEnv().vars.SITE_URL);
    const gestures = await createInProcessApiClient().gestures.sitemap();
    const urls = [
      ...STATIC_PATHS.map((path) => url(`${origin}${path}`)),
      ...gestures.map((entry) =>
        url(
          `${origin}/gestures/${encodeURIComponent(entry.slug)}`,
          entry.updatedAt
        )
      ),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
    return new Response(body, {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/xml; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[sitemap] Failed to build the sitemap:", error);
    throw error;
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: sitemap } },
});
