import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { WORKERS_POOL_TEST_OPTIONS } from "@smog/config/testing/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    ...WORKERS_POOL_TEST_OPTIONS,
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
