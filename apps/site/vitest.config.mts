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
    // (miniflare) emulator persisted to `.wrangler/`. Running two such files
    // concurrently races two emulator instances against the same on-disk
    // state and fails with spurious D1 errors. Serializing test *files*
    // (tests within a file still run as usual) avoids that; there are few
    // enough integration tests that this costs no meaningful time.
    fileParallelism: false,
  },
});
