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
 * Browsers are preinstalled (never run `playwright install` here). The
 * Chromium at /opt/pw-browsers can be older than the one this Playwright
 * version expects, so it is launched by path when present;
 * PLAYWRIGHT_CHROMIUM_PATH overrides it.
 */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
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
  webServer: {
    command: `bunx vite dev --port ${PORT} --strictPort`,
    env: { SMOG_DEV_SITE_URL: `http://localhost:${PORT}` },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `http://localhost:${PORT}/api/health`,
  },
});
