import { expect, test } from "@playwright/test";
import {
  blockingViolations,
  e2eSeed,
  ORIGIN,
  stubMux,
  waitForApp,
  watchErrors,
} from "./helpers";

/** A Convex id as printed on old QR codes (the seed has no legacy ids). */
const LEGACY_ID = "j57e2elegacyhond000000000000";
const STREAM_ERROR = /mux|media|Failed to load resource/i;
const HOND = /\/gestures\/hond$/;

test("opens a gesture: the video, the related gestures and the SEO head", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await stubMux(page);
  // No network here: the HLS stream is not needed to see the player.
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  await page.goto("/gestures/hond");
  await waitForApp(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "Hond" })
  ).toBeVisible();
  await expect(page.locator("mux-player")).toBeAttached();
  const related = page.getByRole("heading", { name: "Verwante gebaren" });
  await expect(related).toBeVisible();
  await expect(page.getByRole("link", { name: "Kat" })).toBeVisible();
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(jsonLd).toContain('"@type":"VideoObject"');

  // Share and QR live in the overflow menu.
  await page.getByRole("button", { name: "Acties voor Hond" }).click();
  await page.getByRole("menuitem", { name: "QR-code" }).click();
  const qr = page.getByRole("dialog", { name: "QR-code voor Hond" });
  await expect(qr).toContainText(`${ORIGIN}/gestures/hond`);
  await qr.getByRole("button", { name: "Sluiten" }).click();

  expect(await blockingViolations(page)).toEqual([]);
  // The aborted HLS stream is the only expected error.
  expect(errors.filter((error) => !STREAM_ERROR.test(error))).toEqual([]);
});

test("answers a legacy id with a 301 to the slug", async ({ request }) => {
  await e2eSeed(request, [
    { legacyId: LEGACY_ID, op: "legacyId", slug: "hond" },
  ]);
  const response = await request.get(`/gestures/${LEGACY_ID}`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toMatch(HOND);
});

test("answers an unknown gesture with the 404 page", async ({ page }) => {
  const response = await page.goto("/gestures/bestaat-niet");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("link", { name: "Naar de startpagina" })
  ).toBeVisible();
});
