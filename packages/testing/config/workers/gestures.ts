import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { suiteTests } from "../../suites";
import { WORKERS_POOL_TEST_OPTIONS } from "../../support/config/vitest";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../db/migrations", import.meta.url)
);

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          SEED_SQL: await readFile(
            new URL("../../../db/seed/dev.sql", import.meta.url),
            "utf8"
          ),
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
      },
      wrangler: {
        configPath: new URL("./gestures.wrangler.jsonc", import.meta.url)
          .pathname,
      },
    }),
  ],
  root: new URL("../../../features/gestures/", import.meta.url).pathname,
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    // The service tests (D1 + KV) run in workerd; `src/**/*.test.ts(x)`
    // (ranking, query parsing, hooks) run on Bun (`bun test src`).
    include: suiteTests("gestures-workers"),
    setupFiles: [
      new URL("../../support/db/apply-migrations.ts", import.meta.url).pathname,
    ],
  },
}));
