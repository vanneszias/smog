import { expect, test } from "@playwright/test";
import {
  blockingViolations,
  stubMux,
  waitForApp,
  watchErrors,
} from "../../support/e2e/helpers";

const Q_HOND = /\/gestures\?q=hond$/;
const CATEGORY_DIEREN = /\/gestures\?category=dieren$/;
const SLUG_HOND = /\/gestures\/hond$/;
const KAT = /Kat/;
const DIEREN = /^Dieren/;
const HOND = /Hond/;
const CONTINUE = "Ga verder waar je bleef";

function isMuxError(message: string): boolean {
  const urls = message.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  return (
    urls.length > 0 &&
    urls.every((url) => URL.parse(url)?.origin === "https://stream.mux.com")
  );
}

test("Mux error filtering checks parsed origins, not URL substrings", () => {
  expect(isMuxError("Failed to fetch https://stream.mux.com/video.m3u8")).toBe(
    true
  );
  for (const message of [
    "An unrelated error",
    "https://evil.test/https://stream.mux.com/video.m3u8",
    "https://evil.test/?url=https://stream.mux.com/video.m3u8",
    "https://stream.mux.com.evil.test/video.m3u8",
    "https://stream.mux.com@evil.test/video.m3u8",
    "https://stream.mux.com/video.m3u8 https://evil.test/failure",
  ]) {
    expect(isMuxError(message), message).toBe(false);
  }
});

/*
 * Home (the identity overhaul): the deep green hero (the tagline as the
 * heading, the search with its orange action, the pointing hand), the
 * themes as a contents list, "continue where you left off" from the
 * device's recent gestures, a few gestures and the footer.
 */

test.describe("home", () => {
  test.beforeEach(async ({ page }) => {
    await stubMux(page);
    await page.route("https://stream.mux.com/**", (route) => route.abort());
  });

  test("the hero, the categories and the featured gestures", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto("/");
    await waitForApp(page);
    const hero = page.getByRole("heading", {
      level: 1,
      name: "Mensen gaan van nature hun spraak ondersteunen met gebaren",
    });
    await expect(hero).toBeVisible();
    await expect(
      page.getByText("Een geheugensteun bij je SMOG-cursus of initiatie.")
    ).toBeVisible();
    // The hero sits on the deep green surface (`sidebar`).
    const surface = await hero.evaluate(
      (node) =>
        getComputedStyle(node.closest("section") ?? node).backgroundColor
    );
    expect(surface).toBe("rgb(9, 86, 76)");
    await expect(
      page.getByRole("button", { name: "Zoeken" }).first()
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Gebaren per thema" });
    await expect(nav.getByRole("link", { name: DIEREN })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Om mee te beginnen" })
    ).toBeVisible();
    // No recents yet on a fresh device: nothing to continue.
    await expect(page.getByRole("heading", { name: CONTINUE })).toHaveCount(0);
    expect(await blockingViolations(page)).toEqual([]);
    expect(errors.filter((error) => !isMuxError(error))).toEqual([]);
  });

  test("the hero search opens the results, a category chip filters", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);
    const field = page.getByRole("searchbox", { name: "Zoek een gebaar" });
    await field.fill("hond");
    await field.press("Enter");
    await expect(page).toHaveURL(Q_HOND);

    await page.goto("/");
    await waitForApp(page);
    await page
      .getByRole("navigation", { name: "Gebaren per thema" })
      .getByRole("link", { name: DIEREN })
      .click();
    await expect(page).toHaveURL(CATEGORY_DIEREN);
  });

  test("continue where you left off: opened gestures come back, and can be cleared", async ({
    page,
  }) => {
    await page.goto("/gestures/hond");
    await waitForApp(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Hond" })
    ).toBeVisible();
    await page.goto("/gestures/kat");
    await waitForApp(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Kat" })
    ).toBeVisible();

    await page.goto("/");
    await waitForApp(page);
    const section = page.locator("section").filter({
      has: page.getByRole("heading", { name: CONTINUE }),
    });
    await expect(section).toBeVisible();
    // Newest first: Kat, then Hond.
    await expect(section.getByRole("link")).toHaveText([KAT, HOND]);
    await section.getByRole("link", { name: "Hond" }).first().click();
    await expect(page).toHaveURL(SLUG_HOND);

    await page.goto("/");
    await waitForApp(page);
    await page
      .getByRole("button", { name: "Recent bekeken gebaren wissen" })
      .click();
    await expect(page.getByRole("heading", { name: CONTINUE })).toHaveCount(0);
    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole("heading", { name: CONTINUE })).toHaveCount(0);
  });

  for (const width of [390, 768]) {
    for (const path of ["/gestures", "/gestures/hond"]) {
      test(`at ${width} px ${path} reflows without sideways scroll`, async ({
        page,
      }) => {
        await page.setViewportSize({ height: 800, width });
        await page.goto(path);
        await waitForApp(page);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }
  }

  test("on a phone the hero, the contents and the footer reflow without sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 390 });
    await page.goto("/");
    await waitForApp(page);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Sponsor" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
  });
});
