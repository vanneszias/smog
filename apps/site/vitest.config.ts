import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

const SRC = fileURLToPath(new URL("./src", import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../packages/db/migrations", import.meta.url)
);

export default defineConfig(async () => ({
  // Tests run the `dev` environment, which has the /dev pages.
  define: { __SMOG_DEV_TOOLS__: "true" },
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          // `.dev.vars` is not read in tests.
          BETTER_AUTH_SECRET: "site-test-secret-at-least-32-characters",
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
        // `env.dev` allows 1000/60 s so local use never locks out; the tests
        // run RL_AUTH at the staging/production limit, and RL_ANALYTICS at 5,
        // to exercise the 429s.
        ratelimits: {
          RL_ANALYTICS: {
            namespace_id: "9004",
            simple: { limit: 5, period: 60 },
          },
          RL_AUTH: { namespace_id: "9003", simple: { limit: 5, period: 60 } },
        },
      },
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
    }),
    tanstackStart(),
  ],
  resolve: { alias: { "@": SRC } },
  test: {
    // test/warm-up.ts pays the first (slow) transform of the server entry
    // under `hookTimeout`, so a hung test still fails after 60 s.
    hookTimeout: 180_000,
    // `scripts/` runs on Bun (`bun test scripts`), not in workerd.
    include: ["test/**/*.test.ts"],
    setupFiles: ["@smog/db/testing/apply-migrations", "./test/warm-up.ts"],
    testTimeout: 60_000,
  },
}));
