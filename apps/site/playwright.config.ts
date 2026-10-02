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
/** The dev seed's public sample (`@smog/db` `SAMPLE_PLAYBACK_ID`). */
const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";

/**
 * Browsers are preinstalled (never run `playwright install` here). The
 * Chromium at /opt/pw-browsers can be older than the one this Playwright
 * version expects, so it is launched by path when present;
 * PLAYWRIGHT_CHROMIUM_PATH overrides it.
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
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  reporter: "list",
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Accept-Language picks the page language (no cookie yet): Dutch, the default.
    locale: "nl-BE",
    trace: "retain-on-failure",
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
      command: `bunx vite dev --port ${PORT} --strictPort`,
      env: {
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
