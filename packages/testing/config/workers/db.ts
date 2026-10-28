import { readFile } from "node:fs/promises";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { suiteTests } from "../../suites";
import { WORKERS_POOL_TEST_OPTIONS } from "../../support/config/vitest";

const MIGRATIONS_DIR = new URL("../../../db/migrations", import.meta.url)
  .pathname;
const SEED_FILE = new URL("../../../db/seed/dev.sql", import.meta.url);
const LEGACY_SEED_FILE = new URL(
  "../../workers/shared/db/service/fixtures/seed-0014.sql",
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
      wrangler: {
        configPath: new URL("./db.wrangler.jsonc", import.meta.url).pathname,
      },
    }),
  ],
  root: new URL("../../../db/", import.meta.url).pathname,
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    // `scripts/` runs on Bun (`bun test scripts`), not in workerd.
    include: suiteTests("db-workers"),
    setupFiles: [
      new URL("../../support/db/apply-migrations.ts", import.meta.url).pathname,
    ],
  },
}));
