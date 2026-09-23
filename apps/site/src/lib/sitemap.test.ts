import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import { LOCALES } from "./locale";
import { robotsTxt } from "./robots";
import {
  fetchSitemapGestures,
  renderSitemapXml,
  type SitemapGesture,
  sitemapEntries,
} from "./sitemap";

const ORIGIN = "https://smog.example";

const paths = (entries: { url: string }[]): string[] =>
  entries.map((entry) => new URL(entry.url).pathname);

/**
 * A stand-in for `payload.find` that answers a scripted list of pages.
 *
 * The paging loop cannot be exercised against the real database without
 * seeding more rows than one page holds, and the local D1 under
 * `.wrangler/state/vitest` is never cleared — so a fixture large enough to
 * prove paging would be added to the table on every run, forever, and the
 * test would get slower each time. `sitemap.int.test.ts` proves the access
 * behaviour against a real database; this proves the loop.
 */
function fakePayload(pages: SitemapGesture[][]) {
  const find = vi.fn(async ({ page }: { page: number }) => {
    const docs = pages[page - 1] ?? [];

    return await Promise.resolve({
      docs,
      hasNextPage: page < pages.length,
    });
  });

  const warn = vi.fn();

  return {
    find,
    payload: { find, logger: { warn } } as unknown as Payload,
    warn,
  };
}

describe("sitemapEntries", () => {
  it("lists the locale root and the gestures list in every locale", () => {
    const entries = sitemapEntries(ORIGIN, []);

    expect(paths(entries)).toEqual([
      "/nl",
      "/en",
      "/fr",
      "/nl/gestures",
      "/en/gestures",
      "/fr/gestures",
    ]);
  });

  it("never lists a favorites page, which robots.txt disallows", () => {
    // `/[locale]/favorites` carries `robots: { index: false }`. A sitemap
    // entry for a page robots.txt disallows is a contradiction a crawler
    // reports as an error, so the two files have to agree.
    const entries = sitemapEntries(ORIGIN, [{ id: 1 }]);

    expect(
      entries.filter((entry) => entry.url.includes("favorites"))
    ).toHaveLength(0);
  });

  it("lists no URL that robots.txt disallows", () => {
    // The generalisation of the test above: whatever either file grows next,
    // it cannot contradict the other without failing here.
    const disallowed = robotsTxt(ORIGIN)
      .split("\n")
      .filter((line) => line.startsWith("Disallow: "))
      .map((line) => line.slice("Disallow: ".length));

    const listed = paths(sitemapEntries(ORIGIN, [{ id: 1 }]));

    expect(
      listed.filter((path) => disallowed.some((rule) => path.startsWith(rule)))
    ).toEqual([]);
  });

  it("lists every gesture once per locale", () => {
    const entries = sitemapEntries(ORIGIN, [{ id: 7 }, { id: 9 }]);
    const gestures = paths(entries).filter((path) =>
      /\/gestures\/\d+$/.test(path)
    );

    expect(gestures).toEqual([
      "/nl/gestures/7",
      "/en/gestures/7",
      "/fr/gestures/7",
      "/nl/gestures/9",
      "/en/gestures/9",
      "/fr/gestures/9",
    ]);
  });

  it("gives each entry an alternate for all three locales", () => {
    const [first] = sitemapEntries(ORIGIN, [{ id: 7 }]).filter((entry) =>
      entry.url.endsWith("/nl/gestures/7")
    );

    expect(first?.alternates?.languages).toEqual({
      en: `${ORIGIN}/en/gestures/7`,
      fr: `${ORIGIN}/fr/gestures/7`,
      nl: `${ORIGIN}/nl/gestures/7`,
    });
  });

  it("keeps the alternates in step with the declared locales", () => {
    // Adding a locale to `LOCALES` without it appearing here would ship a
    // sitemap that hides the new language from every crawler.
    for (const entry of sitemapEntries(ORIGIN, [{ id: 7 }])) {
      expect(Object.keys(entry.alternates?.languages ?? {}).sort()).toEqual(
        [...LOCALES].sort()
      );
    }
  });

  it("carries the row's updatedAt as lastModified", () => {
    const [entry] = sitemapEntries(ORIGIN, [
      { id: 7, updatedAt: "2026-09-20T10:00:00.000Z" },
    ]).filter((candidate) => candidate.url.endsWith("/nl/gestures/7"));

    expect(entry?.lastModified).toBe("2026-09-20T10:00:00.000Z");
  });

  it("omits lastModified rather than inventing one", () => {
    // A `<lastmod>` is a claim about the document. `null` would render the
    // string "null" into the XML.
    const [entry] = sitemapEntries(ORIGIN, [{ id: 7, updatedAt: null }]);

    expect(entry?.lastModified).toBeUndefined();
  });

  it("does not double the slash when the origin carries one", () => {
    const [entry] = sitemapEntries("https://smog.example/", []);

    expect(entry?.url).toBe("https://smog.example/nl");
  });
});

describe("fetchSitemapGestures", () => {
  /*
   * The two guards are pinned by *separate* named tests, and that is a
   * deliberate answer to something a mutation sweep found rather than
   * belt-and-braces theatre.
   *
   * `sitemap.int.test.ts` asserts against a real database that an inactive
   * gesture never reaches the sitemap — the obvious assertion — but
   * it cannot tell the two guards apart: `publicReadActive` filters on
   * exactly the predicate the explicit `where` filters on, so flipping
   * `overrideAccess` to `true` leaves that test green. No fixture can
   * distinguish them, because no row is hidden by one and not the other.
   * Dropping *both* does fail it, which is what the integration test is for.
   *
   * So each half is pinned here by name instead, the way `sharedList.test.ts`
   * pins its pair.
   */
  it("reads as an anonymous visitor", async () => {
    // `overrideAccess: false` with no user is what makes `publicReadActive`
    // run at all. With it flipped, an admin's session — or a future caller
    // that passes one — would publish every inactive gesture.
    const { find, payload } = fakePayload([[{ id: 1 }]]);

    await fetchSitemapGestures(payload);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "gestures", overrideAccess: false })
    );
    expect(find.mock.calls[0]?.[0]).not.toHaveProperty("user");
  });

  it("asks the database only for active rows", async () => {
    // The half that keeps the query correct the day someone loosens
    // `publicReadActive` for an unrelated reason.
    const { find, payload } = fakePayload([[{ id: 1 }]]);

    await fetchSitemapGestures(payload);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: { equals: true } } })
    );
  });

  it("pages until the last page rather than stopping at the first", async () => {
    const { find, payload } = fakePayload([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }],
    ]);

    expect(await fetchSitemapGestures(payload)).toEqual([
      { id: 1, updatedAt: undefined },
      { id: 2, updatedAt: undefined },
      { id: 3, updatedAt: undefined },
    ]);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("warns rather than truncating silently when the ceiling is hit", async () => {
    // A sitemap that quietly loses half its URLs is a de-indexing event that
    // shows up weeks later as a traffic drop.
    const { payload, warn } = fakePayload(
      Array.from({ length: 500 }, (_, index) => [{ id: index }])
    );

    await fetchSitemapGestures(payload);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[sitemap]"));
  });
});

describe("renderSitemapXml", () => {
  it("wraps the entries in a urlset with the xhtml namespace", () => {
    const xml = renderSitemapXml(sitemapEntries(ORIGIN, [{ id: 7 }]));

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
    );
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("declares no xhtml namespace when nothing uses it", () => {
    // Mirrors Next's own serializer, which only emits the declaration when an
    // entry carries alternates.
    const xml = renderSitemapXml([{ url: `${ORIGIN}/nl` }]);

    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
    expect(xml).not.toContain("xhtml");
  });

  it("emits one alternate link per locale", () => {
    const xml = renderSitemapXml(sitemapEntries(ORIGIN, [{ id: 7 }]));

    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="fr" href="${ORIGIN}/fr/gestures/7" />`
    );
  });

  it("emits lastmod only for the entries that have one", () => {
    const xml = renderSitemapXml([
      { lastModified: "2026-09-20T10:00:00.000Z", url: `${ORIGIN}/nl` },
      { url: `${ORIGIN}/en` },
    ]);

    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml).toContain("<lastmod>2026-09-20T10:00:00.000Z</lastmod>");
  });

  it("serializes a Date the way Next does", () => {
    const xml = renderSitemapXml([
      { lastModified: new Date("2026-09-20T10:00:00.000Z"), url: ORIGIN },
    ]);

    expect(xml).toContain("<lastmod>2026-09-20T10:00:00.000Z</lastmod>");
  });

  it("escapes a URL that would otherwise break the document", () => {
    // Next's own serializer interpolates the URL raw, which is a malformed
    // document the first time a `&` reaches it.
    const xml = renderSitemapXml([{ url: `${ORIGIN}/nl?a=1&b=2` }]);

    expect(xml).toContain(`<loc>${ORIGIN}/nl?a=1&amp;b=2</loc>`);
  });
});
