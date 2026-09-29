import { expect, test } from "@playwright/test";
import { otpFor, uniqueEmail, verifyLinkFor, watchErrors } from "./helpers";

const PASSWORD = "correct horse battery";
const VERIFY_EMAIL_URL = /\/verify-email/;
const ACCOUNT_URL = /\/account$/;

test.describe("auth", () => {
  test("sign up with a password, verify by email, sign out", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const email = uniqueEmail();

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
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Aanmelden" })
    ).toBeVisible();

    await page.goto(await verifyLinkFor(page.request, email));
    await expect(page).toHaveURL(VERIFY_EMAIL_URL);
    await expect(page.getByText("Je e-mailadres is bevestigd.")).toBeVisible();

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
      "Die code klopt niet of is verlopen."
    );
  });
});
