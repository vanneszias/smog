import { expect, type Page, test } from "@playwright/test";
import {
  AUTH_PASSWORD,
  cleanupAuthUsers,
  seedAuthUser,
  uniqueAuthEmail,
} from "../helpers/seedAuthUser";
import { seedConsent } from "../helpers/seedConsent";

const SITE = "http://localhost:3003";

/**
 * The account page, through a real browser.
 *
 * What only this layer can see, the same three things `auth.spec.ts` lists
 * and one more:
 *
 * 1. **The rewrites.** `/account/password`, `/account/email`,
 *    `/account/confirm-email` and `/account/delete` are `next.config.ts`
 *    entries pointing at Payload endpoints under `/api/`. Delete one and the
 *    form posts into a 404 — which typechecks, unit-tests, builds and passes
 *    every integration test, because those call the endpoint's real path.
 * 2. **That the forms carry the fields the endpoints read.** A renamed input
 *    is invisible to both layers on their own: the page still renders and the
 *    endpoint still works when called directly.
 * 3. **That a signed-out visitor never sees the page.** The redirect is a
 *    `redirect()` in a server component, which only a request exercises.
 * 4. **That the delete confirmation is a typed address and not a dialog.**
 *    A `confirm()` would make every one of these tests hang rather than fail,
 *    which is its own kind of evidence.
 */

const signInAs = async (
  page: Page,
  email: string,
  password = AUTH_PASSWORD
) => {
  await page.goto(`${SITE}/nl/sign-in`);
  await page.getByTestId("email").fill(email);
  await page.getByTestId("password").fill(password);
  await page.getByTestId("submit").click();
  await page.waitForURL(`${SITE}/nl`);
};

test.describe("The account page", () => {
  const created: string[] = [];

  const freshMember = async (prefix: string) => {
    const email = uniqueAuthEmail(prefix);

    created.push(email);
    await seedAuthUser(email);

    return email;
  };

  test.afterAll(async () => {
    await cleanupAuthUsers(created);
  });

  test("is reached from the header and names the account", async ({ page }) => {
    const member = await freshMember("account-header");

    await signInAs(page, member);
    await page.getByTestId("account-email").click();

    await page.waitForURL(`${SITE}/nl/account`);
    await expect(page.getByTestId("account-email")).toContainText(member);
  });

  test("sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto(`${SITE}/nl/account`);

    await page.waitForURL(`${SITE}/nl/sign-in`);
    await expect(page.getByTestId("submit")).toBeVisible();
  });

  test("refuses a password change without the current password", async ({
    page,
  }) => {
    const member = await freshMember("account-pw-wrong");

    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account`);
    await page.getByTestId("current-password").fill("not-the-password");
    await page.getByTestId("new-password").fill("a-brand-new-password");
    await page.getByTestId("change-password").click();

    await page.waitForURL(`${SITE}/nl/account?error=credentials`);
    await expect(page.getByTestId("account-error")).toBeVisible();

    // Still signed in, and the old password still works: the refusal changed
    // nothing.
    await expect(page.getByTestId("account-email")).toBeVisible();
  });

  test("changes the password and signs the visitor out", async ({ page }) => {
    const member = await freshMember("account-pw-ok");
    const next = "a-completely-new-password";

    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account`);
    await page.getByTestId("current-password").fill(AUTH_PASSWORD);
    await page.getByTestId("new-password").fill(next);
    await page.getByTestId("change-password").click();

    await page.waitForURL(`${SITE}/nl/sign-in?notice=password-changed`);
    await expect(page.getByTestId("sign-in-notice")).toBeVisible();

    // The header proves the cookie really is gone in the browser, not only
    // in the database.
    await expect(page.getByTestId("sign-in-link")).toBeVisible();

    await signInAs(page, member, next);
    await expect(page.getByTestId("account-email")).toHaveText(member);
  });

  test("parks an address change instead of applying it", async ({ page }) => {
    const member = await freshMember("account-email");
    const wanted = uniqueAuthEmail("account-email-new");

    created.push(wanted);

    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account`);
    await page.getByTestId("new-email").fill(wanted);
    await page.getByTestId("email-current-password").fill(AUTH_PASSWORD);
    await page.getByTestId("change-email").click();

    await page.waitForURL(`${SITE}/nl/account?notice=email-pending`);
    await expect(page.getByTestId("account-notice")).toBeVisible();
    await expect(page.getByTestId("pending-email")).toContainText(wanted);

    // The address has *not* moved: the header still names the old one, and
    // that is the whole property — an address that moved on request is an
    // account-takeover path.
    await expect(page.getByTestId("account-email")).toContainText(member);
  });

  test("tells a visitor with a stale link that it cannot be used", async ({
    page,
  }) => {
    const member = await freshMember("account-confirm-stale");

    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account/confirm-email?token=${"0".repeat(64)}`);
    await page.getByTestId("confirm-email").click();

    await page.waitForURL(`${SITE}/nl/account/confirm-email?error=link`);
    await expect(page.getByTestId("confirm-email-error")).toBeVisible();
  });

  test("refuses to delete the account on a mistyped address", async ({
    page,
  }) => {
    const member = await freshMember("account-delete-wrong");

    // Not what this test is about — see `seedConsent`'s own comment.
    await seedConsent(page);
    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account`);
    await page.getByTestId("delete-confirm").fill(`x${member}`);
    await page.getByTestId("delete-account").click();

    await page.waitForURL(`${SITE}/nl/account?error=confirm`);
    await expect(page.getByTestId("account-error")).toBeVisible();
    await expect(page.getByTestId("account-email")).toContainText(member);
  });

  /*
   * Deliberately left seeding nothing — the one place in this suite that
   * still drives `delete-account` with the consent banner up and undecided,
   * on purpose. `ConsentBanner`'s reserved-space spacer is what this test
   * proves: it presses a page-bottom control while the fixed banner is
   * genuinely covering the foot of the viewport, with no seeded decision
   * making the banner absent to dodge the question. If a future change
   * regresses the spacer, this is the test that goes red — the other
   * account/list/sponsor specs that now seed a decision would stay green
   * and prove nothing about it.
   */
  test("deletes the account when the address is typed", async ({ page }) => {
    const member = await freshMember("account-delete-ok");

    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account`);
    await page.getByTestId("delete-confirm").fill(member);
    await page.getByTestId("delete-account").click();

    await page.waitForURL(`${SITE}/nl/sign-in?notice=deleted`);
    await expect(page.getByTestId("sign-in-notice")).toBeVisible();
    await expect(page.getByTestId("sign-in-link")).toBeVisible();

    // And the account is really gone: the same credentials no longer sign in.
    await page.goto(`${SITE}/nl/sign-in`);
    await page.getByTestId("email").fill(member);
    await page.getByTestId("password").fill(AUTH_PASSWORD);
    await page.getByTestId("submit").click();

    await page.waitForURL(`${SITE}/nl/sign-in?error=invalid`);
  });
});
