import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { WORKERS_POOL_TEST_OPTIONS } from "@smog/config/testing/vitest";
import { defineConfig } from "vitest/config";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../db/migrations", import.meta.url)
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
    // The integration suite (task 10) runs in workerd against a D1 with
    // every migration; the rest (`src/**/*.test.ts`, `test/*.test.ts`)
    // runs on Bun (`bun test`).
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["@smog/db/testing/apply-migrations"],
  },
}));
