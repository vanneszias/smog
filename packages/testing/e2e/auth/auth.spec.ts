import { expect, test } from "@playwright/test";
import {
  otpFor,
  stubMux,
  uniqueEmail,
  verifyLinkFor,
  watchErrors,
} from "../../support/e2e/helpers";

const PASSWORD = "correct horse battery";
const VERIFY_EMAIL_URL = /\/verify-email/;
const ACCOUNT_URL = /\/account$/;
const HOME_URL = /\/$/;
const DARK = /\bdark\b/;
const ACCOUNT_REDIRECT = /\/sign-in\?redirect=(?:%2F|\/)account$/;
const BRAND_LINE = "Mensen gaan van nature hun spraak ondersteunen met gebaren";

/** Every route in the auth shell, in a state a guest can open. */
const AUTH_SHELL_PAGES = [
  ["/sign-in", "Aanmelden of registreren"],
  ["/sign-up", "Account aanmaken"],
  ["/forgot-password", "Wachtwoord vergeten"],
  ["/reset-password?token=e2e", "Kies een nieuw wachtwoord"],
  ["/verify-email", "Bevestig je e-mailadres"],
  ["/magic-link?error=INVALID_TOKEN", "Kijk in je mailbox"],
  ["/magic-link/app", "Aanmelden in de app"],
] as const;

test.describe("auth", () => {
  test("sign up with a password, verify by email, sign out", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const email = uniqueEmail();
    // The sign-up ends on the home page, whose gesture cards load Mux stills.
    await stubMux(page);

    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Doorgaan" }).click();
    await page.getByRole("button", { name: "Met mijn wachtwoord" }).click();
    await page.getByLabel("Naam").fill("Ada Lovelace");
    await page.getByLabel("Nieuw wachtwoord").fill(PASSWORD);
    await page.getByLabel("Herhaal je wachtwoord").fill(PASSWORD);
    await page.getByRole("button", { name: "Account aanmaken" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bevestig je e-mailadres" })
    ).toBeVisible();
    // Not signed in before the address is verified.
    const before = await page.request.get("/api/auth/get-session");
    expect(await before.json()).toBeNull();

    await page.goto(await verifyLinkFor(page.request, email));
    await expect(page).toHaveURL(VERIFY_EMAIL_URL);
    await expect(page.getByText("Je e-mailadres is bevestigd.")).toBeVisible();
    // The auth shell has no user menu: continue to the site, signed in.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Doorgaan" }).click();
    await expect(page).toHaveURL(HOME_URL);

    const userMenu = page.getByRole("button", { name: "Accountmenu" });
    await expect(userMenu).toBeVisible();
    await page.waitForLoadState("networkidle");
    await userMenu.click();
    await expect(page.getByRole("menu")).toContainText(email);
    await page.getByRole("menuitem", { name: "Afmelden" }).click();

    await expect(
      page.getByText("Je bent afgemeld.", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Aanmelden" })
    ).toBeVisible();
    await expect(userMenu).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("sign in with an email code", async ({ page }) => {
    const errors = watchErrors(page);
    const email = uniqueEmail();

    await page.goto("/sign-in?redirect=/account");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Doorgaan" }).click();
    await page.getByRole("button", { name: "Met een code via e-mail" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Vul je code in" })
    ).toBeVisible();

    await page.getByLabel("Code").fill(await otpFor(page.request, email));
    await page.getByRole("button", { name: "Bevestigen" }).click();

    await expect(page).toHaveURL(ACCOUNT_URL);
    await expect(
      page.getByRole("heading", { level: 1, name: "Je account" })
    ).toBeVisible();
    await expect(page.getByText(`Aangemeld als ${email}`)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Accountmenu" })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a wrong code shows an error and keeps the step", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Doorgaan" }).click();
    await page.getByRole("button", { name: "Met een code via e-mail" }).click();
    const code = await otpFor(page.request, email);
    const wrong = code === "000000" ? "111111" : "000000";
    await page.getByLabel("Code").fill(wrong);
    await page.getByRole("button", { name: "Bevestigen" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Die code klopt niet of is verlopen. Controleer de code of vraag een nieuwe aan."
    );
  });
});

test.describe("the auth shell", () => {
  for (const [path, heading] of AUTH_SHELL_PAGES) {
    test(`${path} fills the screen without the site header and footer`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ height: 900, width: 1280 });
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
      // Its own slim landmarks, not the site's navigation or search.
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      await expect(
        page.getByRole("navigation", { name: "Hoofdnavigatie" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("banner").getByRole("button", { name: "Zoeken" })
      ).toHaveCount(0);
      await expect(
        page
          .getByRole("banner")
          .getByRole("link", { name: "Terug naar de website" })
      ).toHaveAttribute("href", "/");
      const legal = page.getByRole("contentinfo");
      await expect(legal.getByRole("link", { name: "Privacy" })).toBeVisible();
      await expect(
        legal.getByRole("link", { name: "Voorwaarden" })
      ).toBeVisible();
      // The brand panel beside the form, edge to edge.
      const panel = page.locator("[data-slot=auth-side-panel]");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(BRAND_LINE);
      const box = await panel.boundingBox();
      expect(box?.x).toBe(0);
      expect(box?.height).toBeGreaterThanOrEqual(900);
      expect(errors).toEqual([]);
    });
  }

  test("on a phone the form leads and a short screen scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 480, width: 390 });
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-slot=auth-side-panel]")).toBeHidden();
    const email = page.getByRole("textbox", { name: "E-mailadres" });
    await expect(email).toBeInViewport();
    // The last control is reached by scrolling, never clipped.
    const signUp = page.getByRole("link", { name: "Maak er een aan" });
    await signUp.scrollIntoViewIfNeeded();
    await expect(signUp).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
  });

  test("the settings menu switches the language and theme in place", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto("/sign-in?redirect=/account");
    await page.waitForLoadState("networkidle");
    const settings = page
      .getByRole("banner")
      .getByRole("button", { name: "Instellingen" });
    await settings.click();
    await page.getByRole("menuitemradio", { name: "Donker" }).click();
    await expect(page.locator("html")).toHaveClass(DARK);
    await settings.click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in or sign up" })
    ).toBeVisible();
    // The redirect survives the language change.
    await expect(page).toHaveURL(ACCOUNT_REDIRECT);
    expect(errors).toEqual([]);
  });

  test("the back link returns to the website and its header", async ({
    page,
  }) => {
    await stubMux(page);
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Terug naar de website" }).click();
    await expect(page).toHaveURL(HOME_URL);
    await expect(
      page.getByRole("navigation", { name: "Hoofdnavigatie" })
    ).toBeVisible();
    await expect(page.locator("[data-slot=auth-side-panel]")).toHaveCount(0);
  });

  test("a sent email and a bad link are designed states with an icon", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-mailadres").fill(uniqueEmail());
    await page.getByRole("button", { name: "Stuur me een link" }).click();
    const main = page.getByRole("main");
    await expect(main.locator("[data-tone=primary] svg")).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Terug naar aanmelden" })
    ).toBeVisible();

    await page.goto("/reset-password");
    await expect(main.locator("[data-tone=danger] svg")).toBeVisible();
    await expect(main.getByRole("alert")).toContainText(
      "Deze link is verlopen of niet meer geldig."
    );
  });
});
