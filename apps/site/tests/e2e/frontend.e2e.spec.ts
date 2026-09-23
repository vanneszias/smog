import { expect, test } from "@playwright/test";

const SITE = "http://localhost:3003";

/**
 * What this file once asserted: that `/` served Payload's
 * blank-template home page — the title `Payload Blank Template` and the
 * heading "Welcome to your new project." That page is gone; `/` is now a
 * redirect to the default locale.
 *
 * The spec is rewritten rather than deleted. A redirect nobody tests is a
 * redirect that silently becomes a 404 the first time someone renames a
 * segment, and `/` is the URL every visitor who types the domain lands on.
 */
test.describe("Locale routing", () => {
  test("redirects the bare root to the default locale", async ({ request }) => {
    // Asserted on the response rather than on the address bar, because a
    // client-side redirect would satisfy `toHaveURL` while still serving a
    // blank page to a crawler and to anything without JavaScript.
    const response = await request.get(`${SITE}/`, { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/nl");
  });

  test("lands on the Dutch home page when the redirect is followed", async ({
    page,
  }) => {
    await page.goto(`${SITE}/`);

    await expect(page).toHaveURL(`${SITE}/nl`);
    await expect(page.locator("html")).toHaveAttribute("lang", "nl");
    await expect(page.locator("h1")).toHaveText(
      "Mensen ondersteunen hun spraak van nature met gebaren"
    );
    await expect(page).toHaveTitle("SMOG & Co");
  });

  for (const locale of ["nl", "en", "fr"] as const) {
    test(`declares ${locale} as the document language on /${locale}`, async ({
      page,
    }) => {
      const response = await page.goto(`${SITE}/${locale}`);

      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });
  }

  test("404s an unknown locale instead of serving Dutch under it", async ({
    page,
  }) => {
    // `/de` returning Dutch content under a URL that claims German is worse
    // than an error, for a reader and for a crawler both.
    const response = await page.goto(`${SITE}/de`);

    expect(response?.status()).toBe(404);
  });

  test("names the header logo link after the product", async ({ page }) => {
    await page.goto(`${SITE}/nl/gestures`);

    const home = page.getByRole("banner").getByRole("link", {
      name: "SMOG & Co",
    });
    await expect(home).toHaveAttribute("href", "/nl");
  });

  test("searches from the home page without JavaScript", async ({
    browser,
  }) => {
    // The form is a plain GET, so it has to work before, or without,
    // hydration — which only a page with scripting switched off can prove.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto(`${SITE}/nl`);
    await page
      .getByRole("searchbox", { name: "Zoek een gebaar" })
      .fill("hallo");
    await page.getByRole("button", { name: "Zoeken" }).click();

    await expect(page).toHaveURL(`${SITE}/nl/gestures?q=hallo`);
    await context.close();
  });

  test("declares the icons, the manifest and an absolute share image", async ({
    page,
    request,
  }) => {
    await page.goto(`${SITE}/nl`);

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest"
    );
    await expect(
      page.locator('link[rel="icon"][type="image/svg+xml"]')
    ).toHaveAttribute("href", "/icon.svg");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/apple-touch-icon.png"
    );
    // Open Graph requires an absolute URL; a relative one is no preview.
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${SITE}/og.png`
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image"
    );

    // Served as files, not swallowed by the `[locale]` segment.
    for (const path of [
      "/favicon.ico",
      "/icon.svg",
      "/manifest.webmanifest",
      "/og.png",
      "/brand/logo.svg",
    ]) {
      const response = await request.get(`${SITE}${path}`);
      expect(response.status(), path).toBe(200);
    }
  });

  test("keeps the path and the query when switching locale", async ({
    page,
  }) => {
    await page.goto(`${SITE}/en?q=hallo`);

    await page.getByTestId("locale-switch-fr").click();

    await expect(page).toHaveURL(`${SITE}/fr?q=hallo`);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});
