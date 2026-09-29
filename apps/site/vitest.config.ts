import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
    }),
    tanstackStart(),
  ],
  test: {
    // `scripts/` runs on Bun (`bun test scripts`), not in workerd.
    include: ["test/**/*.test.ts"],
  },
});
