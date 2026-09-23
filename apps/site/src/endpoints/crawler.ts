import type { Endpoint } from "payload";
import { robotsTxt } from "@/lib/robots";
import { buildSitemap, renderSitemapXml } from "@/lib/sitemap";

/**
 * `/sitemap.xml` and `/robots.txt`, served from Payload's existing REST
 * entry rather than from Next's metadata routes.
 *
 * **This is a bundle decision, and it was measured rather than assumed.**
 * A `route.ts`, `sitemap.ts` or `opengraph-image.tsx` becomes its own bundle
 * entry and re-bundles the Payload/D1/drizzle graph into it, while a
 * `page.tsx` shares the SSR server bundle and costs nothing. This was built
 * four ways against the same commit:
 *
 * | build | gzipped | delta |
 * |---|---:|---:|
 * | baseline | 7,423.13 KiB | — |
 * | + `app/robots.ts` (no Payload import) | 7,459.26 KiB | +36.13 |
 * | + `app/(frontend)/sitemap.ts` calling Payload | 7,982.91 KiB | **+523.65** |
 * | both as the endpoints below | 7,428.19 KiB | **+5.06** |
 *
 * (The change landed at 7,428.58 KiB; the remaining 0.39 KiB is the
 * locale-aware metadata added alongside, not these two files.)
 *
 * The naive pair fits — 7,982.91 KiB is still under CI's 8 MiB warning — but
 * it spends 560 of the 769 KiB of headroom on two text files, and the next
 * route that renders the Mux player costs 437 KiB on its own (the
 * sponsor preview is exactly that route). Two text files are not worth the
 * whole budget.
 *
 * These endpoints cost nothing because `app/(payload)/api/[...slug]/route.ts`
 * already exists and already imports the entire Payload graph: adding a
 * handler to it adds only the handler. `handleEndpoints`
 * (`payload/dist/utilities/handleEndpoints.js`, 3.89.0) matches root-level
 * `config.endpoints` against the path after `/api`, so the paths below are
 * reached as `/api/sitemap.xml` and `/api/robots.txt`. The conventional URLs
 * are rewrites in `next.config.ts`, which are routing-table entries and add
 * no code at all.
 *
 * The cost of the trade is that the two files are no longer discoverable
 * from the `app/` directory, which is where the next person will look. That
 * is what this comment, the `next.config.ts` rewrites and
 * `apps/site/README.md` are for.
 */
export const crawlerEndpoints: Endpoint[] = [
  {
    handler: async (req) => {
      /*
       * `req.origin` is the origin of the request as it arrived, filled in by
       * `createPayloadRequest` from the request URL. Using it rather than a
       * configured base URL means staging emits staging URLs and production
       * emits production ones with nothing to configure and nothing to get
       * wrong — and a sitemap listing the wrong host is worse than no
       * sitemap, because a crawler treats it as a hijacking attempt and
       * ignores the file.
       */
      const xml = renderSitemapXml(
        await buildSitemap(req.payload, req.origin ?? "")
      );

      return new Response(xml, {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Type": "application/xml; charset=utf-8",
        },
      });
    },
    method: "get",
    path: "/sitemap.xml",
  },
  {
    handler: (req) =>
      new Response(robotsTxt(req.origin ?? ""), {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Type": "text/plain; charset=utf-8",
        },
      }),
    method: "get",
    path: "/robots.txt",
  },
];
