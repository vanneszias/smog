import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../packages/db/migrations", import.meta.url)
);

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          // `.dev.vars` is not read in tests.
          BETTER_AUTH_SECRET: "site-test-secret-at-least-32-characters",
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
        // `env.dev` allows 1000/60 s so local use never locks out; the tests
        // run RL_AUTH at the staging/production limit to exercise the 429.
        ratelimits: {
          RL_AUTH: { namespace_id: "9003", simple: { limit: 5, period: 60 } },
        },
      },
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
    }),
    tanstackStart(),
  ],
  test: {
    // `scripts/` runs on Bun (`bun test scripts`), not in workerd.
    include: ["test/**/*.test.ts"],
    setupFiles: ["@smog/db/testing/apply-migrations"],
    // The first request in a file transforms the whole server entry
    // (Start, Better Auth, React Email) on demand, which takes ~15 s.
    testTimeout: 60_000,
  },
}));
