import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { suiteTests } from "../../suites";
import { WORKERS_POOL_TEST_OPTIONS } from "../../support/config/vitest";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

/** A repository file as base64: workerd tests have no file system. */
function asset(path: string): string {
  return readFileSync(`${ROOT}${path}`).toString("base64");
}

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          DRAWING_B64: asset(
            "packages/testing/support/pdf/fixtures/drawing-1.png"
          ),
          FONT_BOLD_B64: asset("apps/mobile/assets/fonts/Figtree-Bold.ttf"),
          FONT_REGULAR_B64: asset(
            "apps/mobile/assets/fonts/Figtree-Regular.ttf"
          ),
          IMAGE_B64: asset("packages/brand/src/art/icon.png"),
          LOGO_B64: asset("packages/pdf/assets/logo.png"),
        },
      },
      wrangler: {
        configPath: new URL("./pdf.wrangler.jsonc", import.meta.url).pathname,
      },
    }),
  ],
  root: new URL("../../../pdf/", import.meta.url).pathname,
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    // The workerd tests; the pure Bun tests live next to the source.
    include: suiteTests("pdf-workers"),
  },
});
