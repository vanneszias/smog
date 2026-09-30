import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../db/migrations", import.meta.url)
);

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          SEED_SQL: await readFile(
            new URL("../db/seed/dev.sql", import.meta.url),
            "utf8"
          ),
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
      },
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["@smog/db/testing/apply-migrations"],
    // Vitest's 5 s default is passed by D1-heavy tests (scrypt, 500-row
    // seeds) when the whole turbo test run shares the cores; a hung test
    // still fails, after 30 s.
    testTimeout: 30_000,
  },
}));
