import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  type APIRequestContext,
  type Browser,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { blockingViolations, ORIGIN, waitForApp, watchErrors } from "./helpers";

/*
 * The admin settings and email previews (Task 6, ruling 9). Maintenance is
 * one site-wide KV flag, so these tests run serially and always turn it
 * off again; run this file on its own (`bunx playwright test
 * admin-settings`), not next to other specs on the same dev server.
 */

/** The dev seed's admin (packages/db/seed/dev.sql); a dev-only password. */
const ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
/** As playwright.config.ts: the preinstalled Chromium, launched by path. */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
/** The gate's 30 s isolate cache, plus slack for the dev server. */
const PROPAGATION_MS = 45_000;
const ACTIVE_UNTIL = /^Actief tot /;
const PROPAGATION_NOTE = /binnen ongeveer een minuut/;
const MESSAGE_LABEL = /^Bericht/;
const OTP_CODE = "482913";
const SANDBOX_BLOCKED =
  /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/;

test.describe.configure({ mode: "serial" });

async function signInAsAdmin(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/sign-in/email", {
    data: ADMIN,
    headers: { origin: ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

/**
 * Turns maintenance off as the admin (a bypass cookie first, in case it is
 * on), then gets a cookie for the new version.
 */
async function maintenanceOff(request: APIRequestContext): Promise<void> {
  const bypass = await request.post("/api/maintenance/bypass", {
    headers: { origin: ORIGIN },
  });
  expect(bypass.ok()).toBe(true);
  const off = await request.post("/api/rpc/admin/maintenance/set", {
    data: { json: { enabled: false } },
    headers: { origin: ORIGIN },
  });
  expect(off.ok()).toBe(true);
  // A cookie of the new version: this browser passes even while an isolate
  // still caches the window.
  const fresh = await request.post("/api/maintenance/bypass", {
    headers: { origin: ORIGIN },
  });
  expect(fresh.ok()).toBe(true);
}

/**
 * Waits until a request without a bypass cookie gets the site again (the
 * gate's 30 s isolate cache), so the next test starts on an open site.
 */
async function siteOpen(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  await expect
    .poll(() => statusOf(context.request, "/"), { timeout: PROPAGATION_MS })
    .toBe(200);
  await context.close();
}

/** A browser with no cookies at all. */
async function guest(browser: Browser): Promise<APIRequestContext> {
  const context = await browser.newContext();
  return context.request;
}

async function statusOf(
  request: APIRequestContext,
  path: string
): Promise<number> {
  const response = await request.get(path, { maxRedirects: 0 });
  return response.status();
}

async function confirmIn(page: Page, action: string): Promise<void> {
  const alert = page.getByRole("alertdialog");
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: action }).click();
  await expect(alert).toBeHidden();
}

test.describe("admin settings: maintenance", () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    await signInAsAdmin(context.request);
    await maintenanceOff(context.request);
    await context.close();
    await siteOpen(browser);
  });

  test("enable keeps the admin in while others get the 503; disable revokes the cookie", async ({
    browser,
    page,
  }) => {
    test.setTimeout(4 * PROPAGATION_MS);
    const errors = watchErrors(page);
    await signInAsAdmin(page.request);
    await maintenanceOff(page.request);
    const visitor = await guest(browser);

    await page.goto("/admin/settings");
    await waitForApp(page);
    await expect(page.getByText("Uit", { exact: true })).toBeVisible();
    await expect(page.getByText(PROPAGATION_NOTE)).toBeVisible();
    await page.getByLabel(MESSAGE_LABEL).fill("Nieuwe video's");
    await page.getByRole("button", { name: "Onderhoud aanzetten" }).click();
    await expect(
      page.getByText("Onderhoud staat aan", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("Aan", { exact: true })).toBeVisible();
    await expect(page.getByText(ACTIVE_UNTIL)).toBeVisible();

    // The acting admin keeps the site; a fresh browser gets the 503.
    expect(await statusOf(page.request, "/admin")).toBe(200);
    await page.goto("/admin");
    await waitForApp(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect
      .poll(() => statusOf(visitor, "/"), { timeout: PROPAGATION_MS })
      .toBe(503);
    expect(await statusOf(visitor, "/api/health")).toBe(200);
    const stale = (await page.context().cookies()).find(
      (cookie) => cookie.name === "smog_mx"
    );
    expect(stale).toBeDefined();

    // Disable: every bypass cookie is revoked, and the site opens.
    await page.goto("/admin/settings");
    await waitForApp(page);
    await page.getByRole("button", { name: "Onderhoud uitzetten" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "Elke omzeilcookie vervalt"
    );
    await confirmIn(page, "Onderhoud uitzetten");
    await expect(
      page.getByText("Onderhoud staat uit. Elke omzeilcookie is vervallen.", {
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByText("Niet actief", { exact: true })).toBeVisible();
    await expect
      .poll(() => statusOf(visitor, "/"), { timeout: PROPAGATION_MS })
      .toBe(200);

    // A new window: the old cookie no longer bypasses.
    const on = await page.request.post("/api/rpc/admin/maintenance/set", {
      data: { json: { enabled: true } },
      headers: { origin: ORIGIN },
    });
    expect(on.ok()).toBe(true);
    const holder = await browser.newContext();
    await holder.addCookies([
      { name: "smog_mx", url: ORIGIN, value: stale?.value ?? "" },
    ]);
    // Once the isolates see the new window (the same 30 s cache).
    await expect
      .poll(() => statusOf(holder.request, "/"), { timeout: PROPAGATION_MS })
      .toBe(503);
    await holder.close();
    await maintenanceOff(page.request);
    await siteOpen(browser);
    expect(errors).toEqual([]);
  });

  test("the bypass card gives this browser a 12 h cookie", async ({ page }) => {
    await signInAsAdmin(page.request);
    await page.goto("/admin/settings");
    await waitForApp(page);
    await page
      .getByRole("button", { name: "Omzeilen voor deze browser (12 u)" })
      .click();
    await expect(page.getByText(ACTIVE_UNTIL)).toBeVisible();
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === "smog_mx"
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(await blockingViolations(page)).toEqual([]);
  });
});

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
 * `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test admin-settings`.
 */
test.describe("admin settings screenshots", () => {
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
        await context.addCookies([
          { name: "theme", url: ORIGIN, value: theme },
        ]);
        const page = await context.newPage();
        await signInAsAdmin(page.request);
        await maintenanceOff(page.request);
        await page.goto("/admin/settings");
        await waitForApp(page);
        await page.waitForLoadState("networkidle");
        const decline = page.getByRole("button", {
          name: "Alleen noodzakelijke",
        });
        if (await decline.isVisible()) {
          await decline.click();
        }
        await page.screenshot({
          fullPage: true,
          path: `${dir}/settings-off-${theme}-${width}.png`,
        });
        const on = await page.request.post("/api/rpc/admin/maintenance/set", {
          data: {
            json: {
              enabled: true,
              message: "We zetten nieuwe video's klaar.",
              until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            },
          },
          headers: { origin: ORIGIN },
        });
        expect(on.ok()).toBe(true);
        await page.reload();
        await waitForApp(page);
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          fullPage: true,
          path: `${dir}/settings-on-${theme}-${width}.png`,
        });
        await page.getByRole("button", { name: "Onderhoud uitzetten" }).click();
        await page.getByRole("alertdialog").waitFor();
        await page.screenshot({
          path: `${dir}/settings-disable-${theme}-${width}.png`,
        });
        await page.keyboard.press("Escape");
        await maintenanceOff(page.request);
        await page.goto("/admin/emails?template=auth/otp");
        await waitForApp(page);
        await page
          .frameLocator("iframe")
          .getByText(OTP_CODE, { exact: true })
          .waitFor();
        await page.screenshot({
          fullPage: true,
          path: `${dir}/emails-${theme}-${width}.png`,
        });
        await page.getByRole("tab", { name: "Platte tekst" }).click();
        await page.screenshot({
          fullPage: true,
          path: `${dir}/emails-text-${theme}-${width}.png`,
        });
        await context.close();
      }
    }
    await browser.close();
  });
});
