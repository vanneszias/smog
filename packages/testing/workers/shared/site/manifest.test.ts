import { exports } from "cloudflare:workers";
import { tokens } from "@smog/styles/tokens";
import { describe, expect, it } from "vitest";
import { MANIFEST_ICONS } from "../../../../../apps/site/src/lib/manifest";

const ORIGIN = "http://localhost:5173";
const MANIFEST_LINKS = /<link [^>]*rel="manifest"[^>]*>/g;

// The files `bun -F @smog/brand generate` writes into public/, as the build
// sees them (the Workers pool has no filesystem).
const PUBLIC_FILES = Object.keys(
  import.meta.glob("../../../../../apps/site/public/*.{png,svg}", {
    eager: false,
  })
);

describe("/manifest.webmanifest (inventory P-14, R-18)", () => {
  it("serves the brand's manifest as application/manifest+json", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/manifest.webmanifest`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/manifest+json"
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await response.json()).toMatchObject({
      // The installed app's title bar and splash are the header green
      // (DECISIONS, "Brand identity: the browser bar follows the header").
      background_color: tokens.chrome.manifestBackground.toLowerCase(),
      categories: ["education", "reference"],
      description:
        "Mensen gaan van nature hun spraak ondersteunen met gebaren. SMOG staat voor Spreken Met Ondersteuning van Gebaren.",
      display: "standalone",
      id: "/",
      lang: "nl",
      name: "SMOG & Co",
      orientation: "any",
      scope: "/",
      short_name: "SMOG & Co",
      shortcuts: [
        { name: "Gebaar opzoeken", url: "/gestures" },
        { name: "Mijn ruimte", url: "/my" },
      ],
      start_url: "/",
      theme_color: tokens.color.light.sidebar.toLowerCase(),
    });
  });

  it("lists only icons that exist in public/, with a maskable one", () => {
    for (const icon of MANIFEST_ICONS) {
      expect(PUBLIC_FILES, `${icon.src} is not in public/`).toContain(
        `../../../../../apps/site/public${icon.src}`
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
