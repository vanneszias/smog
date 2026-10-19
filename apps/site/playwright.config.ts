import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * The dev server's port. `E2E_PORT` moves it when 5173 is taken (several
 * checkouts on one machine). The web server gets the matching `SITE_URL`
 * through `SMOG_DEV_SITE_URL` (vite.config.ts), so `.dev.vars` needs no
 * edit; a `SITE_URL` in `.dev.vars` would override it (and leak into
 * nothing else: the unit tests pin their own env).
 */
const PORT = Number(process.env.E2E_PORT ?? 5173);

/**
 * The Mux fake (`@smog/video/testing/server`): the dev server's Mux API and
 * upload URLs for the admin video e2e (`E2E_MUX_PORT`, 4010 by default).
 * It readies an uploaded asset after 1.5 s with the public sample playback
 * id and POSTs the signed webhooks to the dev server.
 */
const MUX_PORT = Number(process.env.E2E_MUX_PORT ?? 4010);
const MUX_FAKE_URL = `http://localhost:${MUX_PORT}`;
const MUX_WEBHOOK_SECRET = "e2e-mux-webhook-secret";
/**
 * The Mollie fake (`@smog/payments/testing/server`): the dev server's
 * Mollie API and a hosted checkout page with Pay / Fail / Cancel / Expire
 * (`E2E_MOLLIE_PORT`, 4020 by default). It POSTs the webhook to the dev
 * server the way Mollie does. The key is the fake's own test key.
 */
const MOLLIE_PORT = Number(process.env.E2E_MOLLIE_PORT ?? 4020);
const MOLLIE_FAKE_URL = `http://localhost:${MOLLIE_PORT}`;
const FAKE_MOLLIE_API_KEY = "test_fakeMollieKeyForTestsOnly000000";

/** The dev seed's public sample (`@smog/db` `SAMPLE_PLAYBACK_ID`). */
const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";

/**
 * The sandbox's preinstalled Chromium (/opt/pw-browsers) can be older than
 * the one this Playwright version expects, so it is launched by path when
 * present; PLAYWRIGHT_CHROMIUM_PATH overrides it. CI has no such directory:
 * it installs the matching Chromium (`playwright install --with-deps
 * chromium`), which Playwright then finds itself.
 */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

/**
 * The specs share one Vite dev server (and its local D1), whose first
 * compiles are slow: two workers locally, one in CI, where the runner has
 * fewer cores to spare. `E2E_WORKERS` overrides both.
 */
const WORKERS = Number(process.env.E2E_WORKERS ?? (process.env.CI ? 1 : 2));

/**
 * The two specs that change what every visitor sees, on one worker, in this
 * order (alphabetical file order, one worker): the catalogue spec publishes
 * 100 gestures of its own for a moment (the bulk smoke), the settings spec
 * turns maintenance mode on. They are the `serial` project, which runs
 * alone (its own runner in CI, its own command locally), so no other spec
 * sees those rows or that window.
 */
const SERIAL_SPECS = /\/admin-(catalog|settings)\.spec\.ts$/;
/** The accessibility specs (Task 5 adds them; the project exists already). */
const A11Y_SPECS = /\/a11y-[^/]*\.spec\.ts$/;
/**
 * The admin accessibility specs (axe over every admin screen, light and dark
 * at two widths: about 13 of the admin shard's 18 minutes on a loaded
 * machine), their own project so no shard passes 15 minutes.
 */
const ADMIN_A11Y_SPECS = /\/admin-[^/]*a11y[^/]*\.spec\.ts$/;
/** The other admin specs, except the serial ones. */
const ADMIN_SPECS = /\/admin-[^/]*\.spec\.ts$/;

const DESKTOP = {
  ...devices["Desktop Chrome"],
  launchOptions: { executablePath },
};

/**
 * Independent projects, no `dependencies`: a CI shard runs one of them on
 * its own runner with its own dev server and D1 (`--project <name>`), and
 * `bun run test:e2e` (scripts/e2e.ts) runs them one after another in this
 * order (`PROJECTS` there; a test keeps the two lists equal). A spec lands in the first project that matches it by name:
 * `serial`, `a11y`, `admin-a11y`, `admin`, else `public`.
 */
export default defineConfig({
  // Assertions wait up to 15 s (the default is 5 s): a first compile, or
  // Vite's "new dependencies optimized, reloading", can land mid-test.
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  // Warms the dev server (every route's first compile and the dependency
  // optimisation) before the first test.
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results",
  projects: [
    {
      name: "public",
      testIgnore: [SERIAL_SPECS, A11Y_SPECS, ADMIN_SPECS],
      use: DESKTOP,
    },
    {
      name: "a11y",
      testMatch: A11Y_SPECS,
      use: DESKTOP,
    },
    {
      name: "admin",
      testIgnore: [SERIAL_SPECS, ADMIN_A11Y_SPECS],
      testMatch: ADMIN_SPECS,
      use: DESKTOP,
    },
    {
      name: "admin-a11y",
      testMatch: ADMIN_A11Y_SPECS,
      use: DESKTOP,
    },
    {
      fullyParallel: false,
      name: "serial",
      testMatch: SERIAL_SPECS,
      use: DESKTOP,
      workers: 1,
    },
  ],
  reporter: process.env.CI
    ? [["list"], ["json", { outputFile: "playwright-report/results.json" }]]
    : "list",
  // One retry in CI (traces on it); a pass on the retry is reported as
  // flaky by scripts/e2e-flaky-report.ts and is a bug to fix. None locally.
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    // No global actionTimeout: it also becomes the context's default for
    // `request` calls, `waitForFunction` (hydration) and `waitForResponse`
    // (phase 6 review M-8). A step that must fail on its own line sets its
    // own timeout (the catalogue reorder, `STEP_MS`).
    baseURL: `http://localhost:${PORT}`,
    // Accept-Language picks the page language (no cookie yet): Dutch, the default.
    locale: "nl-BE",
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
  },
  webServer: [
    {
      command: "bun ../../packages/video/src/testing/fake-server.ts",
      env: {
        FAKE_MUX_PLAYBACK_ID: SAMPLE_PLAYBACK_ID,
        FAKE_MUX_PORT: String(MUX_PORT),
        FAKE_MUX_WEBHOOK_SECRET: MUX_WEBHOOK_SECRET,
        FAKE_MUX_WEBHOOK_URL: `http://localhost:${PORT}/api/webhooks/mux`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: `${MUX_FAKE_URL}/__fake/health`,
    },
    {
      command: "bun ../../packages/payments/src/testing/fake-server.ts",
      env: {
        FAKE_MOLLIE_PORT: String(MOLLIE_PORT),
        FAKE_MOLLIE_WEBHOOK_URL: `http://localhost:${PORT}/api/webhooks/mollie`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: `${MOLLIE_FAKE_URL}/__fake/health`,
    },
    {
      command: `bunx vite dev --port ${PORT} --strictPort --host`,
      env: {
        SMOG_DEV_MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
        SMOG_DEV_MOLLIE_API_URL: MOLLIE_FAKE_URL,
        SMOG_DEV_MUX_API_URL: MUX_FAKE_URL,
        SMOG_DEV_MUX_TOKEN_ID: "fake-token-id",
        SMOG_DEV_MUX_TOKEN_SECRET: "fake-token-secret",
        SMOG_DEV_MUX_WEBHOOK_SECRET: MUX_WEBHOOK_SECRET,
        SMOG_DEV_SITE_URL: `http://localhost:${PORT}`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: `http://localhost:${PORT}/api/health`,
    },
  ],
  workers: WORKERS,
});
