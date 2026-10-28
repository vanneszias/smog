import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { suiteTests } from "../../suites";
import { WORKERS_POOL_TEST_OPTIONS } from "../../support/config/vitest";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: new URL("./email.wrangler.jsonc", import.meta.url).pathname,
      },
    }),
  ],
  root: new URL("../../../email/", import.meta.url).pathname,
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    include: suiteTests("email-workers"),
  },
});
