import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../db/migrations", import.meta.url)
);

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR) },
      },
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    // The service tests (D1 + KV) run in workerd.
    include: ["test/**/*.test.ts"],
    setupFiles: ["@smog/db/testing/apply-migrations"],
  },
}));
