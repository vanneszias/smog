import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * The dev server's port. `E2E_PORT` moves it when 5173 is taken (several
 * checkouts on one machine); `.dev.vars` must then set the same
 * `SITE_URL` (`http://localhost:<port>`), which auth and the mails use.
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `http://localhost:${PORT}/api/health`,
  },
});
