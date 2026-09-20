import { expect, test } from "@playwright/test";
import {
  cleanupGestureFixtures,
  type GestureFixtures,
  seedGestureFixtures,
} from "../helpers/seedGestures";

const SITE = "http://localhost:3003";
const PER_PAGE = 12;

/**
 * The gesture cards.
 *
 * `> li` and not `getByRole("listitem")`: each card renders its categories as
 * a nested `<ul>` of badges, so a descendant query counts one card plus its
 * badges and reports twelve cards as twenty-five. Direct children only.
 */
const cards = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Gebaren" }).locator("> li");

test.describe("Gestures list", () => {
  let fixtures: GestureFixtures;

  test.beforeAll(async () => {
    fixtures = await seedGestureFixtures();
  });

  test.afterAll(async () => {
    await cleanupGestureFixtures(fixtures);
  });

  test("renders a grid of gestures server-side", async ({ page }) => {
    const response = await page.goto(`${SITE}/nl/gestures`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gebaren");
    await expect(cards(page)).toHaveCount(PER_PAGE);
  });

  test("puts a category filter in the URL and narrows the count", async ({
    page,
  }) => {
    await page.goto(`${SITE}/nl/gestures`);

    const unfiltered = Number.parseInt(
      (await page.getByTestId("gesture-count").innerText()).split(" ")[0],
      10
    );
    expect(unfiltered).toBeGreaterThanOrEqual(fixtures.bigCount);

    await page
      .getByRole("button", { name: fixtures.smallCategoryName })
      .click();

    await expect(page).toHaveURL(
      `${SITE}/nl/gestures?category=${fixtures.smallCategoryId}`
    );
    await expect(page.getByTestId("gesture-count")).toHaveText(
      `${fixtures.smallCount} gebaren`
    );
    await expect(cards(page)).toHaveCount(fixtures.smallCount);
  });

  test("recomputes the page count from the filtered set", async ({ page }) => {
    await page.goto(`${SITE}/nl/gestures?category=${fixtures.bigCategoryId}`);

    await expect(page.getByTestId("gesture-count")).toHaveText(
      `${fixtures.bigCount} gebaren`
    );
    // 15 rows at 12 per page is two pages — of the filtered set, not of the
    // table, which holds more.
    await expect(
      page.getByRole("navigation", { exact: true, name: "Paginering" })
    ).toContainText("Pagina 1 van 2");
  });

  test("shows different gestures on page two", async ({ page }) => {
    await page.goto(`${SITE}/nl/gestures?category=${fixtures.bigCategoryId}`);

    const first = await cards(page).first().innerText();

    await page.getByRole("button", { name: "Volgende" }).click();

    await expect(page).toHaveURL(
      `${SITE}/nl/gestures?category=${fixtures.bigCategoryId}&page=2`
    );
    await expect(cards(page)).toHaveCount(fixtures.bigCount - PER_PAGE);
    expect(await cards(page).first().innerText()).not.toBe(first);
  });

  test("returns to the first page when a filter changes", async ({ page }) => {
    await page.goto(
      `${SITE}/nl/gestures?category=${fixtures.bigCategoryId}&page=2`
    );

    await page.getByRole("button", { name: fixtures.bigCategoryName }).click();

    // Deselecting the filter widens the set; staying on page 2 of the old one
    // would be a different set of rows than the URL claims.
    await expect(page).toHaveURL(`${SITE}/nl/gestures`);
  });

  test("clamps a page beyond the end rather than erroring", async ({
    page,
  }) => {
    const response = await page.goto(
      `${SITE}/nl/gestures?category=${fixtures.bigCategoryId}&page=99`
    );

    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("page-clamped")).toContainText(
      "Dit is pagina 2 van 2"
    );
    await expect(cards(page)).toHaveCount(fixtures.bigCount - PER_PAGE);
  });

  test("keeps the filter when the locale changes", async ({ page }) => {
    await page.goto(`${SITE}/nl/gestures?category=${fixtures.smallCategoryId}`);

    await page.getByTestId("locale-switch-fr").click();

    await expect(page).toHaveURL(
      `${SITE}/fr/gestures?category=${fixtures.smallCategoryId}`
    );
    // Dutch-only content must still be counted in French: `fallback: true`
    // applies to the read even though it would not apply to a `where`.
    await expect(page.getByTestId("gesture-count")).toHaveText(
      `${fixtures.smallCount} gebaren`
    );
  });

  test("links each card at the detail route", async ({ page }) => {
    await page.goto(`${SITE}/nl/gestures?category=${fixtures.smallCategoryId}`);

    await expect(cards(page).first().getByRole("link")).toHaveAttribute(
      "href",
      /^\/nl\/gestures\/\d+$/
    );
  });
});
