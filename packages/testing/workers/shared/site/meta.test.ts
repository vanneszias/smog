import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:5173";
// The first page render transforms the root, the shell and the kit.
const FIRST_RENDER_TIMEOUT = 120_000;
const LD_JSON = /<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/;
const TITLE = /<title>([^<]*)<\/title>/;

async function html(
  path: string,
  headers: Record<string, string> = {}
): Promise<string> {
  const response = await exports.default.fetch(`${ORIGIN}${path}`, {
    headers,
  });
  return await response.text();
}

function meta(page: string, key: string): string | undefined {
  const pattern = new RegExp(
    `<meta content="([^"]*)" (?:name|property)="${key}"[^>]*>`
  );
  return page.match(pattern)?.[1];
}

describe("metadata (brand identity)", () => {
  it(
    "gives the home page a searchable title, the tagline card and its own language",
    async () => {
      const page = await html("/", { "accept-language": "fr-BE,fr;q=0.9" });
      expect(page.match(TITLE)?.[1]).toBe(
        "Gestes SMOG en vidéo · SMOG &amp; Co"
      );
      expect(meta(page, "og:title")).toBe(
        "Les gens accompagnent naturellement leur parole de gestes"
      );
      expect(meta(page, "og:image")).toBe(`${ORIGIN}/og-fr.png`);
      expect(meta(page, "og:image:width")).toBe("1200");
      expect(meta(page, "og:image:height")).toBe("630");
      expect(meta(page, "og:image:alt")).toContain("SMOG\u00a0&amp;\u00a0Co");
      expect(meta(page, "twitter:image:alt")).toBe(meta(page, "og:image:alt"));
      const description = meta(page, "description") ?? "";
      expect(description.length).toBeGreaterThan(50);
      expect(description.length).toBeLessThanOrEqual(160);

      const ld = JSON.parse(page.match(LD_JSON)?.[1] ?? "{}");
      const [org, site] = ld["@graph"];
      expect(org).toMatchObject({ "@type": "Organization", name: "SMOG & Co" });
      // The language is the page's, not every language the site has.
      expect(site).toMatchObject({
        "@type": "WebSite",
        inLanguage: "fr-BE",
        publisher: { "@id": org["@id"] },
      });
    },
    FIRST_RENDER_TIMEOUT
  );

  it("falls back to the Dutch card for a page in Dutch", async () => {
    const page = await html("/gestures");
    expect(meta(page, "og:image")).toBe(`${ORIGIN}/og-nl.png`);
    expect(page.match(TITLE)?.[1]).toBe("Gebaren · SMOG &amp; Co");
  });

  it("describes the sponsorship as the end card", async () => {
    const page = await html("/sponsor", { cookie: "locale=en" });
    expect(meta(page, "description")).toContain("at the end of the gesture");
    expect(meta(page, "description")).not.toContain("SMOG project");
  });

  it("titles a page that does not exist, and keeps it out of the index", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/nope`);
    expect(response.status).toBe(404);
    const page = await response.text();
    expect(page.match(TITLE)?.[1]).toBe("Pagina niet gevonden · SMOG &amp; Co");
    expect(meta(page, "robots")).toBe("noindex");
  });
});
