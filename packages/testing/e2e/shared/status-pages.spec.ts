import { expect, test } from "@playwright/test";
import { byRule, scanThemes } from "../../support/e2e/a11y-support";
import { stubMux, waitForApp } from "../../support/e2e/helpers";

const HOME = /\/$/;
const GESTURES = /\/gestures$/;
const BY_SLUG = "**/api/rpc/gestures/bySlug**";

/*
 * The page-level states (issue #6): the 404 keeps its status and offers home
 * and the gestures; a route whose loader fails offers a retry, says so when
 * the retry fails again (home first), and recovers once the server answers.
 * The failure is a 500 on the gesture read during a client navigation, so
 * the server-rendered page is never involved.
 */

test.describe("status pages", () => {
  test.beforeEach(async ({ page }) => {
    await stubMux(page);
    await page.route("https://stream.mux.com/**", (route) => route.abort());
  });

  test("the 404 is a 404 with one h1, home and the gestures", async ({
    page,
  }) => {
    const response = await page.goto("/dit-bestaat-niet");
    expect(response?.status()).toBe(404);
    await waitForApp(page);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "Pagina niet gevonden"
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      main.getByRole("link", { name: "Naar de startpagina" })
    ).toHaveAttribute("href", "/");
    await main.getByRole("link", { name: "Gebaren zoeken" }).click();
    await expect(page).toHaveURL(GESTURES);
  });

  test("a failed load retries, says when it fails again, then recovers", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.route(BY_SLUG, (route) =>
      route.fulfill({ body: "{}", status: 500 })
    );
    await page.locator('main a[href="/gestures/appel"]').first().click();

    const main = page.getByRole("main");
    const alert = main.getByRole("alert");
    await expect(alert.getByRole("heading", { level: 1 })).toHaveText(
      "Deze pagina laadt niet"
    );
    const actions = alert.locator("a, button");
    await expect(actions).toHaveText([
      "Opnieuw proberen",
      "Naar de startpagina",
    ]);
    expect(byRule(await scanThemes(page, "route-error"))).toEqual([]);

    await alert.getByRole("button", { name: "Opnieuw proberen" }).click();
    await expect(alert.getByRole("heading", { level: 1 })).toHaveText(
      "Het lukt nog steeds niet"
    );
    // Home comes first once a retry has failed.
    await expect(actions).toHaveText([
      "Naar de startpagina",
      "Opnieuw proberen",
    ]);

    await page.unroute(BY_SLUG);
    await alert.getByRole("button", { name: "Opnieuw proberen" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Appel" })
    ).toBeVisible();
    await expect(main.getByRole("alert")).toHaveCount(0);
  });

  test("the home link leaves a failed page", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.route(BY_SLUG, (route) =>
      route.fulfill({ body: "{}", status: 500 })
    );
    await page.locator('main a[href="/gestures/appel"]').first().click();
    await page
      .getByRole("alert")
      .getByRole("link", { name: "Naar de startpagina" })
      .click();
    await expect(page).toHaveURL(HOME);
  });
});
