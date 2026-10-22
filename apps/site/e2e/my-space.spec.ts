import { expect, test } from "@playwright/test";
import { blockingViolations, stubMux, waitForApp } from "./helpers";

const MY_FAVORITES = /\/my\?tab=favorites$/;
const MY_LISTS = /\/my\?tab=lists$/;
const MY_LISTS_ID = /\/my\?(?:.*&)?id=[\w-]+&?/;

/*
 * My space (phase 10a task 4): Favorites and Lists as tabs of one page; a
 * guest keeps the device's store. The old /favorites and /lists answer a
 * 302 here (routes-parity.spec.ts pins the status and the query).
 */

test.describe("my space", () => {
  test.beforeEach(async ({ page }) => {
    await stubMux(page);
    await page.route("https://stream.mux.com/**", (route) => route.abort());
  });

  test("the old URLs land on the right tab", async ({ page }) => {
    await page.goto("/favorites");
    await waitForApp(page);
    await expect(page).toHaveURL(MY_FAVORITES);
    await expect(
      page.getByRole("heading", { level: 1, name: "Mijn ruimte" })
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Favorieten" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByText("Nog geen favorieten")).toBeVisible();

    await page.goto("/lists");
    await waitForApp(page);
    await expect(page).toHaveURL(MY_LISTS);
    await expect(page.getByRole("tab", { name: "Lijsten" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByText("Nog geen lijsten")).toBeVisible();
  });

  test("the tabs switch with the keyboard and the URL follows", async ({
    page,
  }) => {
    await page.goto("/my");
    await waitForApp(page);
    const favorites = page.getByRole("tab", { name: "Favorieten" });
    await favorites.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Lijsten" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(MY_LISTS);
    await expect(page.getByRole("tab", { name: "Lijsten" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("Shared by me asks a guest to sign in", async ({ page }) => {
    await page.goto("/my?tab=shared");
    await waitForApp(page);
    await expect(
      page.getByRole("tab", { name: "Gedeeld door mij" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { level: 2, name: "Deel lijsten met een account" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Aanmelden" })).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("a guest's list lives on the device and survives a reload", async ({
    page,
  }) => {
    await page.goto("/my?tab=lists");
    await waitForApp(page);
    await page.getByRole("button", { name: "Nieuwe lijst" }).click();
    const form = page.getByRole("dialog", { name: "Nieuwe lijst" });
    await form.getByRole("textbox", { name: "Naam" }).fill("Mijn les");
    await form.getByRole("button", { name: "Aanmaken" }).click();
    await expect(page).toHaveURL(MY_LISTS_ID);
    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole("region", { name: "Mijn les" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mijn les" })).toBeVisible();
  });
});
