import { devices, expect, type Page, test } from "@playwright/test";
import {
  blockingViolations,
  ORIGIN,
  stubMux,
  waitForApp,
  watchErrors,
} from "./helpers";

/** Review screenshots (gitignored); `SCREENSHOTS_DIR` sends them elsewhere. */
const SCREENSHOTS = process.env.SCREENSHOTS_DIR ?? "e2e/__screenshots__";
const CONSENT = "Help SMOG verbeteren";
const DECLINE = "Alleen noodzakelijke";
const APP_BANNER = "SMOG is nu beschikbaar op je telefoon!";
const OPEN_IN_APP = "Heb je de SMOG-app?";
const IPHONE = devices["iPhone 15"].userAgent;
const SIGN_IN_URL = /\/sign-in\?redirect=%2Faccount$/;
const DUTCH_TITLE = "Privacybeleid";
const DUTCH_TERMS = /\/terms\?lang=nl$/;
const RIGHTS_ANCHOR = /#rights$/;
const DIEREN_FILTER = /\/gestures\?category=dieren$/;
const APP_STORE_LINK = /App Store/;

async function setCookie(
  page: Page,
  name: string,
  value: string
): Promise<void> {
  await page.context().addCookies([{ name, url: ORIGIN, value }]);
}

test.beforeEach(async ({ page }) => {
  await stubMux(page);
});

test.describe("legal pages", () => {
  test("/privacy is Dutch, accessible and has the consent switch", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/privacy");
    await waitForApp(page);
    await expect(
      page.getByRole("heading", { level: 1, name: DUTCH_TITLE })
    ).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0);
    await page.getByRole("link", { name: "Uw rechten" }).click();
    await expect(page).toHaveURL(RIGHTS_ANCHOR);
    await expect(
      page.getByRole("group", { name: "Je keuze voor statistieken" })
    ).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("en is flagged as a translation and links to the Dutch text", async ({
    page,
  }) => {
    await setCookie(page, "locale", "en");
    await page.goto("/terms");
    await waitForApp(page);
    const notice = page.getByRole("note");
    await expect(notice).toContainText("the Dutch version prevails");
    await notice
      .getByRole("link", { name: "Lees de Nederlandse versie" })
      .click();
    // The Dutch text in place: the site and the saved language stay English
    // (review I2).
    await expect(page).toHaveURL(DUTCH_TERMS);
    await expect(
      page.getByRole("heading", { level: 1, name: "Servicevoorwaarden" })
    ).toBeVisible();
    await expect(page.getByRole("note")).toContainText(
      "You are reading the Dutch version"
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === "locale")?.value).toBe(
      "en"
    );
    expect(await blockingViolations(page)).toEqual([]);
    await page
      .getByRole("link", { name: "Show the English translation" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Terms of service" })
    ).toBeVisible();
  });

  test("the footer links resolve", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy" }).first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: DUTCH_TITLE })
    ).toBeVisible();
  });
});

test.describe("app links and legacy URLs", () => {
  for (const path of [
    "/.well-known/apple-app-site-association",
    "/.well-known/assetlinks.json",
  ]) {
    test(`${path} is JSON`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      // Vite's dev server serves `public/` itself and ignores `_headers`, so
      // the extensionless AASA has no type here; the Workers assets (build,
      // `vite preview`, deploys) apply `_headers` (release-config-check).
      if (path.endsWith(".json")) {
        expect(response.headers()["content-type"]).toContain(
          "application/json"
        );
      }
      const body: unknown = await response.json();
      expect(JSON.stringify(body)).toContain("be.zias.smog");
    });
  }

  test("an old /login bookmark lands on /sign-in with its query", async ({
    page,
  }) => {
    const response = await page.request.get("/login?redirect=%2Faccount", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(301);
    await page.goto("/login?redirect=%2Faccount");
    await expect(page).toHaveURL(SIGN_IN_URL);
  });

  test("an old category name opens the slug filter", async ({ page }) => {
    await page.goto("/gestures?category=Dieren");
    await expect(page).toHaveURL(DIEREN_FILTER);
  });
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, userAgent: IPHONE });

  test("the app banner waits for the consent decision and stays dismissed", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    await waitForApp(page);
    await expect(page.getByRole("region", { name: CONSENT })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("region", { name: APP_BANNER })).toHaveCount(0);
    await page
      .getByRole("region", { name: CONSENT })
      .getByRole("button", { name: DECLINE })
      .click();
    const banner = page.getByRole("region", { name: APP_BANNER });
    await expect(banner).toBeVisible();
    await expect(
      banner.getByRole("link", { name: APP_STORE_LINK })
    ).toHaveAttribute(
      "href",
      "https://apps.apple.com/app/smog-co/id6758547774"
    );
    expect(await blockingViolations(page)).toEqual([]);
    await banner.getByRole("button", { name: "Sluit de app-banner" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: APP_BANNER })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a gesture page offers to open the app through its universal link", async ({
    page,
  }) => {
    await page.route("https://stream.mux.com/**", (route) => route.abort());
    await page.goto("/gestures/hond");
    await waitForApp(page);
    const region = page.getByRole("region", { name: OPEN_IN_APP });
    await expect(region).toBeVisible();
    await expect(
      region.getByRole("link", { name: "Open in de app" })
    ).toHaveAttribute("href", `${ORIGIN}/gestures/hond`);
    // iOS: no timed fallback, a separate App Store link (review I1).
    await expect(
      region.getByRole("link", { name: "Nog geen app? Download hem" })
    ).toHaveAttribute(
      "href",
      "https://apps.apple.com/app/smog-co/id6758547774"
    );
  });
});

test("desktop browsers get neither banner", async ({ page }) => {
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  await page.goto("/gestures/hond");
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hond" })
  ).toBeVisible();
  await expect(page.getByRole("region", { name: OPEN_IN_APP })).toHaveCount(0);
});

test.describe("screenshots", () => {
  for (const width of [390, 1280] as const) {
    test(`/privacy, /terms and the app banner at ${width}px`, async ({
      browser,
    }) => {
      for (const theme of ["light", "dark"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one theme after the other.
        const context = await browser.newContext({
          hasTouch: true,
          userAgent: IPHONE,
          viewport: { height: 900, width },
        });
        await context.addCookies([
          { name: "theme", url: ORIGIN, value: theme },
          { name: "locale", url: ORIGIN, value: "nl" },
        ]);
        const page = await context.newPage();
        await stubMux(page);
        // A decided guest: no consent banner over the pages.
        await page.addInitScript(() => {
          const key = "smog:guest:v1";
          if (!window.localStorage.getItem(key)) {
            window.localStorage.setItem(
              key,
              JSON.stringify({
                consent: { analytics: false, decidedAt: 1 },
                favorites: [],
                lists: [],
                preferences: {
                  importDismissedFor: [],
                  locale: null,
                  theme: "system",
                },
                recentSearches: [],
                version: 2,
              })
            );
          }
        });
        for (const path of ["/privacy", "/terms"]) {
          // biome-ignore lint/performance/noAwaitInLoops: one page after the other.
          await page.goto(path);
          await waitForApp(page);
          await page.waitForLoadState("networkidle");
          await page.screenshot({
            animations: "disabled",
            path: `${SCREENSHOTS}${path}-${width}-${theme}.png`,
          });
          await page.screenshot({
            animations: "disabled",
            fullPage: true,
            path: `${SCREENSHOTS}${path}-full-${width}-${theme}.png`,
          });
        }
        await context.addCookies([
          { name: "locale", url: ORIGIN, value: "en" },
        ]);
        await page.goto("/privacy");
        await waitForApp(page);
        await expect(page.getByRole("note")).toBeVisible();
        await page.screenshot({
          animations: "disabled",
          path: `${SCREENSHOTS}/privacy-en-${width}-${theme}.png`,
        });
        await context.addCookies([
          { name: "locale", url: ORIGIN, value: "nl" },
        ]);
        await page.goto("/");
        await waitForApp(page);
        await expect(
          page.getByRole("region", { name: APP_BANNER })
        ).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          animations: "disabled",
          path: `${SCREENSHOTS}/app-banner-${width}-${theme}.png`,
        });
        await page.goto("/gestures/hond");
        await waitForApp(page);
        await expect(
          page.getByRole("region", { name: OPEN_IN_APP })
        ).toBeVisible();
        await page.screenshot({
          animations: "disabled",
          path: `${SCREENSHOTS}/open-in-app-${width}-${theme}.png`,
        });
        await context.close();
      }
    });
  }
});
