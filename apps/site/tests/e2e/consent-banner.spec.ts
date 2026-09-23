import { expect, test } from "@playwright/test";

const SITE = "http://localhost:3003";

/**
 * The consent banner itself, in a real browser.
 *
 * Every other spec in this suite now seeds a decision before it drives a
 * page-bottom control (`seedConsent`, added alongside this file),
 * precisely so the banner stops being incidental noise in tests about
 * something else. That made it necessary to put the banner's own first-visit
 * behaviour somewhere: an undecided visitor still has to see it, a refusal
 * still has to dismiss it, and the dismissal still has to hold across a
 * navigation. No unit test can see the last one — `ConsentBanner.test.tsx`
 * exercises one mounted instance, not a real second page load reading back
 * what the first one wrote.
 *
 * `account.spec.ts`'s "deletes the account when the address is typed" is the
 * other half of this: it proves a page-bottom control stays
 * reachable *while the banner shown here is still up*, which this file does
 * not repeat.
 */
test.describe("The consent banner", () => {
  test("asks an undecided visitor, takes no for an answer, and stays answered", async ({
    page,
  }) => {
    await page.goto(`${SITE}/nl`);

    const banner = page.getByRole("region", {
      name: "Help SMOG & Co verbeteren",
    });

    await expect(banner).toBeVisible();

    await page
      .getByRole("button", { name: "Gebruiken zonder analytics" })
      .click();

    // Gone, not merely hidden: `toBeHidden()` is satisfied by an element
    // that never rendered at all — the mistake `account-lists.spec.ts`'s own
    // comment names — and `ConsentBanner` unmounts entirely once answered,
    // so presence is exactly what to assert the absence of.
    await expect(banner).toHaveCount(0);

    // The decision is a real `localStorage` write, not component state that
    // a fresh mount would forget — so it has to survive a full navigation,
    // not just a re-render.
    await page.goto(`${SITE}/nl/gestures`);
    await expect(
      page.getByRole("region", { name: "Help SMOG & Co verbeteren" })
    ).toHaveCount(0);
  });
});
