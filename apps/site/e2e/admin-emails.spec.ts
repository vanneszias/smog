import { expect, test } from "@playwright/test";
import { blockingViolations, waitForApp, watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The email previews (Task 6, A-25, W-07). They never touch the
 * maintenance flag, so this file runs with the other specs.
 */

const OTP_CODE = "482913";
const SANDBOX_BLOCKED =
  /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/;

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
});
