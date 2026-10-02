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
