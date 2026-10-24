import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { WORKERS_POOL_TEST_OPTIONS } from "@smog/config/testing/vitest";
import { defineConfig } from "vitest/config";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** A repository file as base64: workerd tests have no file system. */
function asset(path: string): string {
  return readFileSync(`${ROOT}${path}`).toString("base64");
}

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          FONT_BOLD_B64: asset("apps/mobile/assets/fonts/Figtree-Bold.ttf"),
          FONT_REGULAR_B64: asset(
            "apps/mobile/assets/fonts/Figtree-Regular.ttf"
          ),
          IMAGE_B64: asset("packages/brand/src/art/icon.png"),
        },
      },
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    // The workerd tests; the pure Bun tests live next to the source.
    include: ["test/**/*.test.ts"],
  },
});
