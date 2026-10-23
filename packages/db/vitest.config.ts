import { readFile } from "node:fs/promises";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { WORKERS_POOL_TEST_OPTIONS } from "@smog/config/testing/vitest";
import { defineConfig } from "vitest/config";

const MIGRATIONS_DIR = new URL("./migrations", import.meta.url).pathname;
const SEED_FILE = new URL("./seed/dev.sql", import.meta.url);
const LEGACY_SEED_FILE = new URL(
  "./test/fixtures/seed-0014.sql",
  import.meta.url
);

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          LEGACY_SEED_SQL: await readFile(LEGACY_SEED_FILE, "utf8"),
          SEED_SQL: await readFile(SEED_FILE, "utf8"),
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
      },
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    // `scripts/` runs on Bun (`bun test scripts`), not in workerd.
    include: ["test/**/*.test.ts"],
    setupFiles: ["./src/testing/apply-migrations.ts"],
  },
}));
