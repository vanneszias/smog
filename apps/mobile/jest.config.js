module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|\\.pnpm|react-native|@react-native|@react-native-community|expo|@expo|react-navigation|@react-navigation|nativewind|react-native-css-interop))",
  ],
  // Jest's 5s default failed CI on 2594e36: `src/screens/search.test.tsx`'s
  // "shows the matching gestures once a query is submitted" hit the
  // timeout, on a run where the whole file took 7.8s. Locally, warm, that
  // same test costs ~600ms (render a screen, submit a query, mock-`fetch`
  // a real `Response`, parse it, re-render) — comfortably under 5s on its
  // own. `bun release:check` runs every package's suite concurrently
  // through turbo, so this file was competing with the rest of the
  // monorepo's tests for the same CPU, not running alone the way a local
  // `bun -F mobile test` does.
  //
  // Reproduced directly: checking out the commit *before* this test
  // existed in its current form and pinning the same test, unmodified, to
  // one CPU core alongside dozens of competing processes measured its
  // slowest step at 2.6-3.2s; a genuinely cold cache (first Jest run after
  // a fresh `bun install`, no warm Babel transform cache) measured it at
  // 12.6s. Both numbers came from the pre-existing test, not from
  // anything this change added — confirmed by removing the new code under
  // test and re-measuring, with no difference. Whichever test in the
  // suite happened to run heaviest under that load was going to cross 5s
  // first: a threshold the suite crossed, not a flaky test.
  //
  // Set globally, not on the one test that failed: any test in this app
  // that mounts a screen and waits on a real fetch/parse/render cycle pays
  // a similar cost, and turbo's concurrency is a property of the whole CI
  // run, not of one file. 30s is roughly 10x the worst reproduced number
  // (12.6s), matching `apps/site/vitest.config.mts`'s own reasoning for
  // its `testTimeout`: a genuinely hung test still fails, just later, and
  // a shared, loaded CI runner no longer turns ordinary contention into a
  // red build.
  testTimeout: 30_000,
};
