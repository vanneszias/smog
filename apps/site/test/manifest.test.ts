import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MANIFEST_ICONS } from "../src/lib/manifest";

const ORIGIN = "http://localhost:5173";
const MANIFEST_LINKS = /<link [^>]*rel="manifest"[^>]*>/g;

// The files `bun -F @smog/brand generate` writes into public/, as the build
// sees them (the Workers pool has no filesystem).
const PUBLIC_FILES = Object.keys(
  import.meta.glob("../public/*.{png,svg}", { eager: false })
);

describe("/manifest.webmanifest (inventory P-14, R-18)", () => {
  it("serves the old manifest's values as application/manifest+json", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/manifest.webmanifest`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/manifest+json"
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await response.json()).toMatchObject({
      background_color: "#ebf4eb",
      categories: ["education", "reference"],
      display: "standalone",
      lang: "nl",
      name: "SMOG&Co",
      orientation: "any",
      scope: "/",
      short_name: "SMOG&Co",
      start_url: "/",
      theme_color: "#00805f",
    });
  });

  it("lists only icons that exist in public/, with a maskable one", () => {
    for (const icon of MANIFEST_ICONS) {
      expect(PUBLIC_FILES, `${icon.src} is not in public/`).toContain(
        `../public${icon.src}`
      );
    }
    expect(MANIFEST_ICONS.some((icon) => icon.purpose === "maskable")).toBe(
      true
    );
  });

  it("is linked exactly once from the document", async () => {
    const html = await (await exports.default.fetch(`${ORIGIN}/`)).text();
    const links = html.match(MANIFEST_LINKS) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('href="/manifest.webmanifest"');
  });
});
