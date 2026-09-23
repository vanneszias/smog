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
    await expect(page.locator("h1")).toHaveText("SMOG");
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

  test("keeps the path and the query when switching locale", async ({
    page,
  }) => {
    await page.goto(`${SITE}/en?q=hallo`);

    await page.getByTestId("locale-switch-fr").click();

    await expect(page).toHaveURL(`${SITE}/fr?q=hallo`);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});
