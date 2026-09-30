import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import {
  blockingViolations,
  ORIGIN,
  signInWithApi,
  stubMux,
  waitForApp,
  watchErrors,
} from "./helpers";

/** The dev seed's admin (packages/db/seed/dev.sql); a dev-only password. */
const ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
const SIGN_IN_BACK_TO_AUDIT = /\/sign-in\?redirect=%2Fadmin%2Faudit$/;
const FROM_IN_URL = /from=2026-01-01/;

async function signInAsAdmin(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: ADMIN,
    headers: { origin: ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

test.describe("admin shell", () => {
  test("a guest opening /admin is sent to sign-in, with the way back", async ({
    page,
  }) => {
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(SIGN_IN_BACK_TO_AUDIT);
  });

  test("a signed-in user gets the 404 page, and no Admin menu entry", async ({
    page,
  }) => {
    await signInWithApi(page);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Pagina niet gevonden" })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Beheer" })).toHaveCount(
      0
    );
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: "Accountmenu" }).click();
    await expect(page.getByRole("menuitem", { name: "Beheer" })).toHaveCount(0);
  });

  test("the seeded admin sees the dashboard and the audit log", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    // The home page's gesture cards load Mux thumbnails.
    await stubMux(page);
    await signInAsAdmin(page);
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: "Accountmenu" }).click();
    await page.getByRole("menuitem", { name: "Beheer" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/admin`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Overzicht"
    );
    await expect(page.getByRole("heading", { name: "Gebaren" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recente acties" })
    ).toBeVisible();
    const rail = page.getByRole("navigation", { name: "Beheer" });
    await expect(rail.getByRole("link", { name: "Overzicht" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(await blockingViolations(page)).toEqual([]);

    await rail.getByRole("link", { name: "Logboek" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/admin/audit`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Logboek");
    await expect(page.getByRole("table", { name: "Logboek" })).toBeVisible();
    // The filters live in the URL.
    await page.getByLabel("Van", { exact: true }).fill("2026-01-01");
    await expect(page).toHaveURL(FROM_IN_URL);
    await page.reload();
    await expect(page.getByLabel("Van", { exact: true })).toHaveValue(
      "2026-01-01"
    );
    expect(await blockingViolations(page)).toEqual([]);

    await rail.getByRole("link", { name: "Gebaren" }).click();
    await expect(page.getByText("Komt in deze fase")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("on a phone the rail is a sheet", async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await signInAsAdmin(page);
    await page.goto("/admin");
    await waitForApp(page);
    await expect(page.getByRole("navigation", { name: "Beheer" })).toBeHidden();
    await page.getByRole("button", { name: "Beheermenu openen" }).click();
    const sheet = page.getByRole("dialog", { name: "Beheer" });
    await sheet.getByRole("link", { name: "Logboek" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/admin/audit`);
    await expect(sheet).toBeHidden();
  });

  /*
   * Review screenshots (light/dark × 390/1280), only when ADMIN_SHOTS_DIR
   * is set: ADMIN_SHOTS_DIR=/tmp/shots bun -F @smog/site test:e2e admin-shell
   */
  test("screenshots", async ({ browser }) => {
    const dir = process.env.ADMIN_SHOTS_DIR;
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    await mkdir(dir ?? "", { recursive: true });
    for (const theme of ["light", "dark"] as const) {
      for (const width of [390, 1280]) {
        // biome-ignore lint/performance/noAwaitInLoops: one browser context at a time.
        const context = await browser.newContext({
          colorScheme: theme,
          locale: "nl-BE",
          viewport: { height: 900, width },
        });
        await context.addCookies([
          { name: "theme", url: ORIGIN, value: theme },
        ]);
        const page = await context.newPage();
        await signInAsAdmin(page);
        for (const [name, path] of [
          ["dashboard", "/admin"],
          ["audit", "/admin/audit"],
        ] as const) {
          // biome-ignore lint/performance/noAwaitInLoops: the pages are shot one after another.
          await page.goto(path);
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
            path: `${dir}/${name}-${theme}-${width}.png`,
          });
        }
        // The detail sheet of the newest entry, if there is one.
        const row = page.getByRole("table").getByRole("row").nth(1);
        if ((await row.getAttribute("tabindex")) === "0") {
          await row.click();
          await page.getByRole("dialog").waitFor();
          await page.screenshot({
            path: `${dir}/audit-detail-${theme}-${width}.png`,
          });
        }
        await context.close();
      }
    }
  });
});
