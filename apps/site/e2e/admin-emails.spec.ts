import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium, expect, test } from "@playwright/test";
import { blockingViolations, ORIGIN, waitForApp, watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The email previews (Task 6, A-25, W-07). They never touch the
 * maintenance flag, so this file runs with the other specs.
 */

/** As playwright.config.ts: the preinstalled Chromium, launched by path. */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const OTP_CODE = "482913";
const SANDBOX_BLOCKED =
  /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/;

test.describe("admin emails", () => {
  test("the preview renders the OTP template in a sandboxed iframe", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signInAsAdmin(page.request);
    await page.goto("/admin/emails?template=auth/otp");
    await waitForApp(page);
    const frame = page.getByTitle("Voorbeeld: Aanmeldcode");
    await expect(frame).toBeVisible();
    expect(await frame.getAttribute("sandbox")).toBe("");
    await expect(
      page
        .frameLocator('iframe[title="Voorbeeld: Aanmeldcode"]')
        .getByText(OTP_CODE, { exact: true })
    ).toBeVisible();
    await expect(
      page.locator("dd").getByText(`${OTP_CODE} is je code voor SMOG & Co`)
    ).toBeVisible();

    await page.getByRole("radio", { name: "English" }).click();
    await expect(
      page.locator("dd").getByText(`${OTP_CODE} is your SMOG & Co code`)
    ).toBeVisible();
    await page.getByRole("radio", { name: "Mobiel (390 px)" }).click();
    await expect(frame).toHaveCSS("width", "390px");
    await page.getByRole("tab", { name: "Platte tekst" }).click();
    await expect(page.locator("pre")).toContainText(OTP_CODE);
    expect(await blockingViolations(page)).toEqual([]);
    // The only console lines: Chromium refusing scripts (axe's, injected
    // into every frame) in the sandboxed preview, which is the point.
    expect(errors.filter((line) => !SANDBOX_BLOCKED.test(line))).toEqual([]);
  });
});

/**
 * The review screenshots (light/dark × 390/1280, reduced motion, nl-BE),
 * when ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test admin-emails`.
 */
test.describe("admin emails screenshots", () => {
  test("screenshots", async () => {
    const dir = process.env.ADMIN_SHOTS_DIR;
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    test.setTimeout(180_000);
    await mkdir(dir ?? "", { recursive: true });
    const browser = await chromium.launch({
      args: ["--lang=nl-BE"],
      env: { ...process.env, LANG: "nl_BE.UTF-8", LANGUAGE: "nl_BE" },
      ...(existsSync(PREINSTALLED_CHROMIUM)
        ? { executablePath: PREINSTALLED_CHROMIUM }
        : {}),
    });
    try {
      for (const theme of ["light", "dark"] as const) {
        for (const width of [390, 1280]) {
          // biome-ignore lint/performance/noAwaitInLoops: one browser context at a time.
          const context = await browser.newContext({
            colorScheme: theme,
            locale: "nl-BE",
            reducedMotion: "reduce",
            timezoneId: "Europe/Brussels",
            viewport: { height: 900, width },
          });
          try {
            await context.addCookies([
              { name: "theme", url: ORIGIN, value: theme },
            ]);
            const page = await context.newPage();
            await signInAsAdmin(page.request);
            await page.goto("/admin/emails?template=auth/otp");
            await waitForApp(page);
            await page
              .frameLocator("iframe")
              .getByText(OTP_CODE, { exact: true })
              .waitFor();
            await page.waitForLoadState("networkidle");
            const decline = page.getByRole("button", {
              name: "Alleen noodzakelijke",
            });
            if (await decline.isVisible()) {
              await decline.click();
            }
            await page.screenshot({
              fullPage: true,
              path: `${dir}/emails-${theme}-${width}.png`,
            });
            await page.getByRole("tab", { name: "Platte tekst" }).click();
            await page.screenshot({
              fullPage: true,
              path: `${dir}/emails-text-${theme}-${width}.png`,
            });
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  });
});
