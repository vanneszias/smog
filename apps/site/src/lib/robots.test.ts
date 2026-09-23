import { describe, expect, it } from "vitest";
import { LOCALES } from "./locale";
import { robotsTxt } from "./robots";

const ORIGIN = "https://smog.example";

const lines = (origin = ORIGIN): string[] => robotsTxt(origin).split("\n");

describe("robotsTxt", () => {
  it("addresses every crawler and allows the site", () => {
    expect(lines()).toContain("User-Agent: *");
    expect(lines()).toContain("Allow: /");
  });

  it("keeps crawlers out of the admin panel", () => {
    // It answers a login screen, and every URL under it is that same screen.
    expect(lines()).toContain("Disallow: /admin");
  });

  it("keeps crawlers out of the REST API but not out of the media it serves", () => {
    // Uploads are served through `/api/media/file/...`, and an image a
    // robots.txt forbids cannot be indexed or shown in an image result. The
    // longer rule wins, which is why both lines can stand.
    expect(lines()).toContain("Disallow: /api/");
    expect(lines()).toContain("Allow: /api/media/");
  });

  it("keeps crawlers off the favorites page in every locale", () => {
    // The page is `robots: { index: false }` because its contents live in one
    // reader's browser. Adding a locale must add a line here.
    for (const locale of LOCALES) {
      expect(lines()).toContain(`Disallow: /${locale}/favorites`);
    }
  });

  it("points at the sitemap with an absolute URL on the requesting origin", () => {
    // The standard requires an absolute URL, and deriving it from the request
    // is what makes staging advertise staging rather than production.
    expect(lines("https://staging.example")).toContain(
      "Sitemap: https://staging.example/sitemap.xml"
    );
  });

  it("does not double the slash when the origin carries one", () => {
    expect(lines("https://smog.example/")).toContain(
      "Sitemap: https://smog.example/sitemap.xml"
    );
  });

  it("ends with a newline, as a line-oriented format requires", () => {
    expect(robotsTxt(ORIGIN).endsWith("\n")).toBe(true);
  });
});
