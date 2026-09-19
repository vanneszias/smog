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
    // Vitest's 10s default is tuned for unit tests. Every `*.int.test.ts`
    // file's `beforeAll` boots a real Payload instance and pushes the whole
    // schema into a fresh miniflare D1, which costs most of those 10s on its
    // own — and grows with every collection added. Stage 1 Task 6 took the
    // suite from 19 files to 25, and the slowest hook crossed the line: CI
    // failed at 10032ms, and a local run reproduced it at 10093ms in a
    // *different* file. Whichever integration file happens to be slowest on
    // a given run was going to fail, so this is a threshold the suite
    // crossed, not a flaky test.
    //
    // 60s is deliberate headroom rather than a nudge past today's number:
    // several files already sit near 8s, and the next collection makes all
    // of them slower again. A hook that genuinely hangs still fails, just
    // later. Note this is `hookTimeout`, not `testTimeout` — individual test
    // bodies run in hundreds of milliseconds and are held to the 5s default,
    // so a slow *test* is still caught.
    hookTimeout: 60_000,
    // Integration tests boot a real Payload instance against a local D1
    // (miniflare) emulator. Rather than serializing test files to avoid two
    // emulator instances racing the same on-disk state, payload.config.ts
    // gives each Vitest worker its own persistence directory (keyed by
    // `VITEST_WORKER_ID`), so files can run in parallel safely — including
    // across `--shard`ed processes, which file-level serialization alone
    // would not have covered.
  },
});
