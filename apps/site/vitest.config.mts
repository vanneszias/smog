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
      // The e2e helpers are not e2e specs: `seedUser.ts` carries the retry
      // that decides whether the admin suite is reproducible, and that logic
      // is testable without a browser. `exclude` below still keeps the specs
      // themselves out of Vitest.
      "tests/helpers/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    // Vitest's 10s default is tuned for unit tests. Every `*.int.test.ts`
    // file's `beforeAll` boots a real Payload instance and pushes the whole
    // schema into a fresh miniflare D1, which costs most of those 10s on its
    // own — and grows with every collection added. Once the suite grew from
    // 19 files to 25, the slowest hook crossed the line: CI
    // failed at 10032ms, and a local run reproduced it at 10093ms in a
    // *different* file. Whichever integration file happens to be slowest on
    // a given run was going to fail, so this is a threshold the suite
    // crossed, not a flaky test.
    //
    // 60s is deliberate headroom rather than a nudge past today's number:
    // several files already sit near 8s, and the next collection makes all
    // of them slower again. A hook that genuinely hangs still fails, just
    // later.
    //
    // **The same threshold, crossed a second time — now by test bodies.**
    //
    // This comment used to say that individual tests "run in hundreds of
    // milliseconds" and were safely held to Vitest's 5s default. That stopped
    // being true once the auth work landed, and it failed CI on a commit that
    // had passed locally four times.
    //
    // The cause is not a slow test, it is the product's security posture.
    // Payload hashes with PBKDF2 at 100,000 iterations — the reason 3.90.x is
    // unusable here, since it raises that to 600,000 and workerd caps at
    // 100,000 — and a lockout test has to *actually* lock an account, which
    // means five real failed sign-ins plus several more verifications to prove
    // what the lock does and does not change. Two of the account endpoints
    // additionally hold every refusal to a 500 ms timing floor on purpose.
    // Measured locally, unloaded:
    //
    //   answers a locked account exactly as it answers a wrong password  2829ms
    //   does not lock a different account                                2705ms
    //   refuses the correct password while locked                        2545ms
    //   locks the account after repeated failures                        2403ms
    //
    // Four tests at under 2x headroom, and CI runs a single worker under load.
    // Whichever of them happened to be slowest on a given run was going to
    // fail — a threshold the suite crossed, not a flaky test, exactly as with
    // `hookTimeout` above.
    //
    // Raised globally rather than on the one test that failed, because that
    // would leave the other three one scheduling hiccup away and teach the
    // next person to patch theirs too. 30s is roughly 10x the slowest
    // measurement: a genuinely hung test still fails, just later, while a
    // merely slow machine no longer turns a security property into a red
    // build. Making the fixtures cheaper is the wrong trade — `lockOut` drives
    // the real sign-in path precisely so a fixture cannot quietly fail to lock
    // and leave the test comparing two identical refusals.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    isolate: false,
    // Integration tests boot a real Payload instance against a local D1
    // (miniflare) emulator. Rather than serializing test files to avoid two
    // emulator instances racing the same on-disk state, payload.config.ts
    // gives each Vitest worker its own persistence directory (keyed by
    // `VITEST_WORKER_ID`), so files can run in parallel safely — including
    // across `--shard`ed processes, which file-level serialization alone
    // would not have covered.
  },
});
