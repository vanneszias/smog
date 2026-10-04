import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { workerSecretsSchema } from "@smog/config/env/worker";
import { WORKERS_POOL_TEST_OPTIONS } from "@smog/config/testing/vitest";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";
import { unstable_readConfig } from "wrangler";
import { THEME_SCRIPT_HASH_DEFINE } from "./build-defines";
import { MUX_WEBHOOK_TEST_SECRET } from "./test/mux-secret";

const SRC = fileURLToPath(new URL("./src", import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../packages/db/migrations", import.meta.url)
);

/*
 * The tests' env is pinned, never read from the machine. The pool builds
 * the Worker's bindings with wrangler, which merges a local `.dev.vars`
 * (or `.env*`, and with CLOUDFLARE_INCLUDE_PROCESS_ENV the process env)
 * over `env.dev.vars`; only keys set in `miniflare.bindings` win over those.
 * So every var comes from `wrangler.jsonc` `env.dev.vars` and every secret
 * is off (`""`, `optionalValue`) unless set here (the auth secret and the
 * Mux webhook signing secret). `test/env-isolation.test.ts` checks it.
 */
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
Reflect.deleteProperty(process.env, "CLOUDFLARE_INCLUDE_PROCESS_ENV");
const DEV_VARS = unstable_readConfig(
  {
    config: fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)),
    env: "dev",
  },
  { hideWarnings: true }
).vars;
const SECRETS_OFF = Object.fromEntries(
  Object.keys(workerSecretsSchema.shape).map((key) => [key, ""])
);

export default defineConfig(async () => ({
  // Tests run the `dev` environment, which has the /dev pages.
  define: {
    __SMOG_DEV_TOOLS__: "true",
    __SMOG_E2E_SEED__: "true",
    __SMOG_THEME_SCRIPT_HASH__: THEME_SCRIPT_HASH_DEFINE,
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          ...DEV_VARS,
          ...SECRETS_OFF,
          BETTER_AUTH_SECRET: "site-test-secret-at-least-32-characters",
          MUX_WEBHOOK_SECRET: MUX_WEBHOOK_TEST_SECRET,
          TEST_MIGRATIONS: await readD1Migrations(MIGRATIONS_DIR),
        },
        // `env.dev` allows 1000/60 s so local use never locks out; the tests
        // run RL_AUTH and RL_SPONSOR at the staging/production limit, and
        // RL_ANALYTICS at 5,
        // to exercise the 429s.
        ratelimits: {
          RL_ANALYTICS: {
            namespace_id: "9004",
            simple: { limit: 5, period: 60 },
          },
          RL_AUTH: { namespace_id: "9003", simple: { limit: 5, period: 60 } },
          RL_SPONSOR: {
            namespace_id: "9002",
            simple: { limit: 5, period: 60 },
          },
        },
      },
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
    }),
    tanstackStart(),
  ],
  resolve: { alias: { "@": SRC } },
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    // test/warm-up.ts pays the first (slow) transform of the server entry
    // under `hookTimeout`, so a hung test still fails after 60 s.
    hookTimeout: 180_000,
    // `scripts/` runs on Bun (`bun test scripts`), not in workerd.
    include: ["test/**/*.test.ts"],
    setupFiles: ["@smog/db/testing/apply-migrations", "./test/warm-up.ts"],
    testTimeout: 60_000,
  },
}));
