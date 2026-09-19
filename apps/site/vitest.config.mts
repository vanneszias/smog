import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
      "tests/int/**/*.int.spec.ts",
    ],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    // Integration tests boot a real Payload instance against a local D1
    // (miniflare) emulator. Rather than serializing test files to avoid two
    // emulator instances racing the same on-disk state, payload.config.ts
    // gives each Vitest worker its own persistence directory (keyed by
    // `VITEST_WORKER_ID`), so files can run in parallel safely — including
    // across `--shard`ed processes, which file-level serialization alone
    // would not have covered.
  },
});
