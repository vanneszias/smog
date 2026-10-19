import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { WORKERS_POOL_TEST_OPTIONS } from "@smog/config/testing/vitest";
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
    ...WORKERS_POOL_TEST_OPTIONS,
    // The D1 tests run in workerd; `src/**/*.test.ts` (the schema, the
    // transition table and the source scans) run on Bun (`bun test src`).
    include: ["test/**/*.test.ts"],
    setupFiles: ["@smog/db/testing/apply-migrations"],
  },
}));
