import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { WORKERS_POOL_TEST_OPTIONS } from "@smog/config/testing/vitest";
import { defineConfig } from "vitest/config";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../db/migrations", import.meta.url)
);

const PDF = fileURLToPath(new URL("../../pdf/", import.meta.url));

/** A repository file as base64: workerd tests have no file system. */
function asset(path: string): string {
  return readFileSync(`${PDF}${path}`).toString("base64");
}

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          DRAWING_B64: asset("fixtures/drawing-1.png"),
          DRAWING_JPG_B64: asset("fixtures/drawing-wide.jpg"),
          FONT_BOLD_B64: asset("assets/Figtree-Bold.ttf"),
          FONT_REGULAR_B64: asset("assets/Figtree-Regular.ttf"),
          LOGO_B64: asset("assets/logo.png"),
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
      },
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    // The service tests (D1 + KV) run in workerd.
    include: ["test/**/*.test.ts"],
    setupFiles: ["@smog/db/testing/apply-migrations"],
  },
}));
