import { expect, type Request, test } from "@playwright/test";
import {
  blockingViolations,
  stubMux,
  waitForApp,
  watchErrors,
} from "./helpers";

const Q_CAFE = /\?q=cafe$/;
const Q_KAT = /\?q=kat$/;
const CATEGORY_DIEREN = /\?category=dieren$/;
const SLUG_HOND = /\/gestures\/hond$/;
const NAME_HOND = /Hond/;

/** Calls to the gestures procedures over HTTP (the SSR ones are in-process). */
function gestureCalls(requests: Request[]): string[] {
  return requests
    .map((request) => new URL(request.url()).pathname)
    .filter((path) => path.startsWith("/api/rpc/gestures/"));
}

test("searches a seeded name, accent-insensitively and without refetching the SSR results", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await stubMux(page);
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));

  await page.goto("/gestures?q=hond");
  await waitForApp(page);
  const results = page.getByRole("status").filter({ hasText: "gebaar" });
  await expect(results.first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Hond" }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  // The results came with the page (dehydrated), not from /api/rpc.
  expect(gestureCalls(requests)).toEqual([]);

  // Typing updates the results and the URL (`replace`, debounced).
  const field = page.getByRole("searchbox", { name: "Zoek een gebaar" });
  await field.fill("cafe");
  await expect(page).toHaveURL(Q_CAFE);
  // "café" is a keyword of Koffie.
  await expect(
    page.getByRole("link", { name: "Koffie" }).first()
  ).toBeVisible();

  expect(await blockingViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("shows recent searches when the empty field is focused", async ({
  page,
}) => {
  await stubMux(page);
  await page.goto("/gestures");
  await waitForApp(page);
  const field = page.getByRole("searchbox", { name: "Zoek een gebaar" });
  await field.fill("kat");
  await field.press("Enter");
  await expect(page).toHaveURL(Q_KAT);

  await field.fill("");
  await field.focus();
  const recent = page.getByRole("region", { name: "Recente zoekopdrachten" });
  await expect(recent.getByRole("button", { name: "kat" })).toBeVisible();
});

test("filters by a category chip, synced to ?category=", async ({ page }) => {
  await stubMux(page);
  await page.goto("/gestures");
  await waitForApp(page);
  await page.getByRole("button", { name: "Dieren" }).click();
  await expect(page).toHaveURL(CATEGORY_DIEREN);
  await expect(page.getByRole("link", { name: "Paard" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Koffie" })).toHaveCount(0);
});

test.describe("the filters on a phone (phase 10a)", () => {
  test("the categories live in a bottom sheet; choosing one filters at once", async ({
    page,
  }) => {
    await stubMux(page);
    await page.setViewportSize({ height: 800, width: 390 });
    await page.goto("/gestures");
    await waitForApp(page);
    // The inline chips are for md and up.
    await expect(page.getByRole("button", { name: "Dieren" })).toBeHidden();
    const open = page.getByRole("button", { name: "Filters" });
    await open.click();
    const sheet = page.getByRole("dialog", { name: "Filteren op categorie" });
    await expect(sheet).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
    await sheet.getByRole("button", { name: "Dieren" }).click();
    await expect(page).toHaveURL(CATEGORY_DIEREN);
    await sheet.getByRole("button", { name: "Resultaten tonen" }).click();
    await expect(sheet).toBeHidden();
    // The button counts what is chosen, and the grid shows the filtered cards.
    await expect(
      page.getByRole("button", { name: "Filters 1 gekozen" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Paard" }).first()
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Koffie" })).toHaveCount(0);
  });
});

test.describe("the global search palette", () => {
  test("/ opens it from any page; results are grouped, Enter opens a gesture", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await stubMux(page);
    await page.goto("/sign-in");
    await waitForApp(page);
    await page.keyboard.press("/");
    const dialog = page.getByRole("dialog", { name: "Zoeken" });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole("combobox");
    await expect(input).toBeFocused();
    await input.fill("hond");
    const gestures = dialog.getByRole("group", { name: "Gebaren" });
    await expect(
      gestures.getByRole("option", { name: NAME_HOND })
    ).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(SLUG_HOND);
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("the header button opens it; a category leads to the filtered list; Escape closes it and returns the focus", async ({
    page,
  }) => {
    await stubMux(page);
    await page.goto("/");
    await waitForApp(page);
    const trigger = page.getByRole("button", { name: "Zoeken" }).first();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Zoeken" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog
      .getByRole("group", { name: "Categorieën" })
      .getByRole("option", { name: "Dieren" })
      .click();
    await expect(page).toHaveURL(CATEGORY_DIEREN);
  });

  test("a slash typed in a field does not open it", async ({ page }) => {
    await stubMux(page);
    await page.goto("/gestures");
    await waitForApp(page);
    await page.getByRole("searchbox", { name: "Zoek een gebaar" }).press("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
