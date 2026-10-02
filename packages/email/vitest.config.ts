import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    // Vitest's 5 s default is passed by D1-heavy tests (scrypt, 500-row
    // seeds) when the whole turbo test run shares the cores; a hung test
    // still fails, after 30 s.
    testTimeout: 30_000,
  },
});
