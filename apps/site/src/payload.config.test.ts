// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SanitizedConfig, SanitizedLocalizationConfig } from "payload";
import { beforeAll, describe, expect, it } from "vitest";

let config: SanitizedConfig;

function requireLocalization(): SanitizedLocalizationConfig {
  if (!config.localization) {
    throw new Error(
      "localization is disabled — locale codes, defaultLocale and fallback are all meaningless without it"
    );
  }
  return config.localization;
}

// Importing payload.config.ts evaluates requireEnv("PAYLOAD_SECRET") and boots
// the Cloudflare/wrangler platform proxy at module scope, so this suite only
// runs when a secret is available (same gating, and for the same reason, as
// tests/int/api.int.spec.ts). The import stays dynamic so a skipped
// `beforeAll` never evaluates that module-level bootstrapping.
//
// Awaiting the config's default export (buildConfig's promise) only sanitizes
// the config in memory — it does not call payload.init() or touch the
// database, so this suite has no D1 side effects.
describe.skipIf(!process.env.PAYLOAD_SECRET)(
  "payload.config locale setup",
  () => {
    beforeAll(async () => {
      const { default: configPromise } = await import("./payload.config");
      config = await configPromise;
    });

    it("declares exactly nl, en, fr as locales, with nl first", () => {
      // Order is asserted, not just membership: `nl` first matches the
      // default locale and the admin panel's locale-switcher tab order, and
      // a silent reorder is worth catching even though nothing downstream
      // currently depends on it.
      expect(requireLocalization().localeCodes).toEqual(["nl", "en", "fr"]);
    });

    it("defaults to the nl locale", () => {
      expect(requireLocalization().defaultLocale).toBe("nl");
    });

    it("falls back to the default locale for untranslated fields", () => {
      expect(requireLocalization().fallback).toBe(true);
    });

    it("registers the categories collection", () => {
      expect(config.collections.map((collection) => collection.slug)).toContain(
        "categories"
      );
    });

    it("brands the admin as SMOG & Co, with the site's own icons", () => {
      const { meta } = config.admin;
      const icons = meta.icons as { url: string }[];

      expect(meta.titleSuffix).toBe("— SMOG & Co");
      // No image: the admin resolves relative URLs against localhost.
      expect(meta.defaultOGImageType).toBe("off");
      expect(meta.openGraph).toEqual({ siteName: "SMOG & Co" });
      expect(icons.map((icon) => icon.url)).toEqual([
        "/favicon.ico",
        "/icon.svg",
      ]);
      for (const { url } of icons) {
        expect(existsSync(join(process.cwd(), "public", url)), url).toBe(true);
      }
    });

    /*
     * A component path that is registered but missing from the generated
     * import map renders nothing in the admin, with only a console warning to
     * say so. `generate:importmap` has to be rerun whenever one is added, and
     * this is where forgetting it shows.
     */
    it("finds both brand graphics in the generated import map", () => {
      const importMap = readFileSync(
        join(process.cwd(), "src/app/(payload)/admin/importMap.js"),
        "utf8"
      );
      const { graphics } = config.admin.components;

      expect(graphics).toEqual({
        Icon: "/components/admin/Icon#Icon",
        Logo: "/components/admin/Logo#Logo",
      });
      for (const path of Object.values(graphics ?? {})) {
        expect(importMap).toContain(`"${String(path)}"`);
      }
    });
  }
);
