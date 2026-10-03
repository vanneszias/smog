import { expect, test } from "@playwright/test";
import { blockingViolations, waitForApp, watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The email previews (Task 6, A-25, W-07). They never touch the
 * maintenance flag, so this file runs with the other specs.
 */

const OTP_CODE = "482913";
const LOGO_SRC = /\/brand\/email-logo\.png$/;
const SANDBOX_BLOCKED =
  /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/;

/** Each template: its id, its Dutch label and a line its sample shows. */
const PREVIEWS = [
  ["auth/magic-link", "Aanmeldlink", "Aanmelden bij SMOG & Co"],
  ["auth/otp", "Aanmeldcode", OTP_CODE],
  ["auth/reset-password", "Wachtwoord opnieuw instellen", "Hallo Alex,"],
  ["auth/verify-email", "E-mailadres bevestigen", "Bevestig je e-mailadres"],
  ["transactional/welcome", "Welkom", "Ontdek gebaren"],
  [
    "transactional/sponsorship-received",
    "Sponsoring ontvangen",
    "Wat gebeurt er nu?",
  ],
  ["transactional/payment-confirmed", "Betaling bevestigd", "Betaald bedrag"],
  ["transactional/sponsorship-live", "Sponsoring online", "Actief tot"],
  [
    "transactional/renewal-reminder",
    "Herinnering verlenging",
    "Sponsoring verlengen",
  ],
  [
    "transactional/admin-new-sponsorship",
    "Nieuwe sponsoring (beheer)",
    "BE 0123.456.749",
  ],
  [
    "transactional/admin-render-failed",
    "Video mislukt (beheer)",
    "Video maken mislukt",
  ],
  [
    "transactional/admin-refund-needed",
    "Terugbetaling nodig (beheer)",
    "Openen in Mollie",
  ],
] as const;

test.describe("admin emails", () => {
  test("the preview renders the OTP template in a sandboxed iframe", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signInAsAdmin(page.request);
    await page.goto("/admin/emails?template=auth/otp");
    await waitForApp(page);
    const frame = page.getByTitle("Voorbeeld: Aanmeldcode");
    await expect(frame).toBeVisible();
    expect(await frame.getAttribute("sandbox")).toBe("");
    await expect(
      page
        .frameLocator('iframe[title="Voorbeeld: Aanmeldcode"]')
        .getByText(OTP_CODE, { exact: true })
    ).toBeVisible();
    await expect(
      page.locator("dd").getByText(`${OTP_CODE} is je code voor SMOG & Co`)
    ).toBeVisible();

    await page.getByRole("radio", { name: "English" }).click();
    await expect(
      page.locator("dd").getByText(`${OTP_CODE} is your SMOG & Co code`)
    ).toBeVisible();
    await page.getByRole("radio", { name: "Mobiel (390 px)" }).click();
    await expect(frame).toHaveCSS("width", "390px");
    await page.getByRole("tab", { name: "Platte tekst" }).click();
    await expect(page.locator("pre")).toContainText(OTP_CODE);
    expect(await blockingViolations(page)).toEqual([]);
    // The only console lines: Chromium refusing scripts (axe's, injected
    // into every frame) in the sandboxed preview, which is the point.
    expect(errors.filter((line) => !SANDBOX_BLOCKED.test(line))).toEqual([]);
  });

  test("previews all twelve templates, each with the logo from the site", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page.request);
    for (const [template, label, text] of PREVIEWS) {
      // biome-ignore lint/performance/noAwaitInLoops: one preview at a time.
      await page.goto(`/admin/emails?template=${template}`);
      await waitForApp(page);
      const frame = page.frameLocator(`iframe[title="Voorbeeld: ${label}"]`);
      // The preheader repeats some lines, hidden: match the visible one.
      await expect(
        frame.getByText(text).filter({ visible: true }).first()
      ).toBeVisible();
      // The preview's policy lets the header logo load from /brand/.
      const logo = frame.locator('img[alt="SMOG & Co"]');
      await expect(logo).toHaveAttribute("src", LOGO_SRC);
      await expect
        .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBe(369);
    }
  });
});
