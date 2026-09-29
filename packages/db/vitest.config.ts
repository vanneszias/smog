import { readFile } from "node:fs/promises";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const MIGRATIONS_DIR = new URL("./migrations", import.meta.url).pathname;
const SEED_FILE = new URL("./seed/dev.sql", import.meta.url);

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          SEED_SQL: await readFile(SEED_FILE, "utf8"),
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
      },
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    // `scripts/` runs on Bun (`bun test scripts`), not in workerd.
    include: ["test/**/*.test.ts"],
    setupFiles: ["./src/testing/apply-migrations.ts"],
  },
}));
