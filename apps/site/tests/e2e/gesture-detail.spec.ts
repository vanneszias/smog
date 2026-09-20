import { expect, test } from "@playwright/test";
import { stallMux } from "../helpers/mux";
import {
  cleanupGestureDetailFixtures,
  type GestureDetailFixtures,
  seedGestureDetailFixtures,
} from "../helpers/seedGestureDetail";

const SITE = "http://localhost:3003";

test.describe("Gesture detail", () => {
  let fixtures: GestureDetailFixtures;

  test.beforeAll(async () => {
    fixtures = await seedGestureDetailFixtures();
  });

  test.afterAll(async () => {
    await cleanupGestureDetailFixtures(fixtures);
  });

  test("renders the gesture the list page links to", async ({ page }) => {
    await stallMux(page);
    const response = await page.goto(
      `${SITE}/nl/gestures/${fixtures.activeId}`,
      { waitUntil: "domcontentloaded" }
    );

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.activeName
    );
    await expect(page.getByRole("list", { name: "Categorieën" })).toContainText(
      fixtures.categoryName
    );
    await expect(page.getByText("Uitleg voor")).toBeVisible();
  });

  test("arrives from a card on the list page", async ({ page }) => {
    // The list page's links were built in Task 3 against a route that did not
    // exist yet. This is the assertion that they now resolve.
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures?q=${fixtures.run} actief`, {
      waitUntil: "domcontentloaded",
    });

    await page
      .getByRole("list", { name: "Gebaren" })
      .locator("> li")
      .first()
      .getByRole("link")
      .click();

    await expect(page).toHaveURL(/\/nl\/gestures\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.activeName
    );
  });

  test("404s an inactive gesture for an anonymous visitor", async ({
    page,
  }) => {
    const response = await page.goto(
      `${SITE}/nl/gestures/${fixtures.inactiveId}`,
      { waitUntil: "domcontentloaded" }
    );

    expect(response?.status()).toBe(404);
  });

  test("404s an id no gesture has, rather than erroring", async ({ page }) => {
    const response = await page.goto(`${SITE}/nl/gestures/987654321`, {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBe(404);
  });

  test("404s an id that is not a number", async ({ page }) => {
    const response = await page.goto(`${SITE}/nl/gestures/banana`, {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBe(404);
  });

  test("404s an unknown locale", async ({ page }) => {
    const response = await page.goto(
      `${SITE}/de/gestures/${fixtures.activeId}`,
      { waitUntil: "domcontentloaded" }
    );

    expect(response?.status()).toBe(404);
  });

  test("gives the player the gesture's playback id", async ({ page }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.activeId}`, {
      waitUntil: "domcontentloaded",
    });

    // Playback itself is not asserted: it needs a route to Mux, and a test
    // that passes or fails on the network is not a test of this page.
    await expect(page.getByTestId("gesture-video")).toHaveAttribute(
      "data-playback-id",
      fixtures.activePlaybackId
    );

    const player = page.getByTestId("gesture-video").locator("mux-player");
    await expect(player).toHaveCount(1);
    await page.waitForFunction(
      () => window.customElements.get("mux-player") !== undefined
    );
    await expect(player).toHaveAttribute(
      "playback-id",
      fixtures.activePlaybackId
    );
  });

  test("shows the sponsor credit and the sponsored cut of the video", async ({
    page,
  }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.sponsoredId}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("sponsor-overlay")).toContainText(
      fixtures.sponsoredOverlayText
    );
    await expect(page.getByTestId("gesture-video")).toHaveAttribute(
      "data-playback-id",
      fixtures.sponsoredPlaybackId
    );
  });

  test("shows nothing for a sponsorship whose term has ended", async ({
    page,
  }) => {
    // The row still says `status: "active"`. Rendering it would put a
    // sponsorship nobody is paying for on a public page.
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.expiredId}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("sponsor-overlay")).toHaveCount(0);
    await expect(page.getByText(fixtures.expiredOverlayText)).toHaveCount(0);
  });

  test("never sends the sponsor's contact details to the browser", async ({
    page,
  }) => {
    // The whole reason the projection exists. `sponsorships.read` is
    // `isAdmin`; this asserts the server-side read did not smuggle the row
    // into the payload anyway — RSC flight data included, which is why this
    // reads the raw response rather than the rendered text.
    const response = await page.request.get(
      `${SITE}/nl/gestures/${fixtures.sponsoredId}`
    );
    const html = await response.text();

    expect(html).toContain(fixtures.sponsoredOverlayText);
    expect(html).not.toContain(`e2e-actief-${fixtures.run}@example.com`);
    expect(html).not.toContain("Jan Janssens");
  });

  test("titles the document with the gesture's name", async ({ page }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.activeId}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveTitle(`${fixtures.activeName} — SMOG`);
  });

  test("advertises the same gesture in all three locales", async ({ page }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.activeId}`, {
      waitUntil: "domcontentloaded",
    });

    /*
     * Queried through the DOM rather than by matching the raw HTML, because
     * Next 16 emits React's camelCase `hrefLang=` into the markup rather than
     * the HTML spelling. It parses the same — HTML attribute names are
     * case-insensitive — but a string match on `hreflang="nl"` finds nothing,
     * and the test would then be pinning a serializer quirk instead of the
     * alternates.
     */
    for (const locale of ["nl", "en", "fr"]) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${locale}"]`)
      ).toHaveAttribute("href", `/${locale}/gestures/${fixtures.activeId}`);
    }

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `/nl/gestures/${fixtures.activeId}`
    );
  });

  test("serves the Dutch name to a French visitor", async ({ page }) => {
    await stallMux(page);
    const response = await page.goto(
      `${SITE}/fr/gestures/${fixtures.activeId}`,
      { waitUntil: "domcontentloaded" }
    );

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.activeName
    );
  });
});
