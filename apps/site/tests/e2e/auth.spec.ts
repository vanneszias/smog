import { expect, type Page, test } from "@playwright/test";
import {
  AUTH_PASSWORD,
  cleanupAuthUsers,
  seedAuthUser,
  uniqueAuthEmail,
} from "../helpers/seedAuthUser";

const SITE = "http://localhost:3003";

/**
 * Email and password, through a real browser.
 *
 * Three things here cannot be tested anywhere else, and all three are
 * invisible to the integration tests one layer down:
 *
 * 1. **The rewrites.** `/auth/sign-in` is a `next.config.ts` entry pointing
 *    at a Payload endpoint at `/api/auth/sign-in`. Delete it and the form
 *    posts into a 404 — which typechecks, unit-tests and builds cleanly.
 * 2. **The cookie's scope.** Every URL on this site is
 *    locale-prefixed, and a session cookie scoped to the path it was set from
 *    signs the visitor out the moment they switch language. Every
 *    single-locale test passes against that bug.
 * 3. **That a browser accepts the cookie at all.** It is issued with
 *    `Secure`, and only a browser decides whether that is acceptable over
 *    `http://localhost`.
 */

const signInAs = async (page: Page, email: string, locale = "nl") => {
  await page.goto(`${SITE}/${locale}/sign-in`);
  await page.getByTestId("email").fill(email);
  await page.getByTestId("password").fill(AUTH_PASSWORD);
  await page.getByTestId("submit").click();
};

test.describe("Email and password auth", () => {
  const created: string[] = [];
  let member: string;

  test.beforeAll(async () => {
    member = uniqueAuthEmail("member");
    created.push(member);
    await seedAuthUser(member);
  });

  test.afterAll(async () => {
    await cleanupAuthUsers(created);
  });

  test("shows the way in to a visitor who is not signed in", async ({
    page,
  }) => {
    await page.goto(`${SITE}/nl`);

    await expect(page.getByTestId("sign-in-link")).toBeVisible();
    await expect(page.getByTestId("account-email")).toHaveCount(0);
  });

  test("signs an account in and names it in the header", async ({ page }) => {
    await signInAs(page, member);

    await page.waitForURL(`${SITE}/nl`);
    await expect(page.getByTestId("account-email")).toHaveText(member);
  });

  test("honours a session established under /nl when the visitor moves to /en", async ({
    page,
  }) => {
    /*
     * The cookie's scope, end to end. `Set-Cookie` without an explicit
     * `Path` defaults to the directory of the request URI, so a cookie issued
     * from a `/nl/...` URL would apply to `/nl` and nothing else — and this
     * navigation would land signed out. `generatePayloadCookie` hard-codes
     * `Path=/`; this is what proves the site uses it.
     */
    await signInAs(page, member);
    await page.waitForURL(`${SITE}/nl`);

    await page.goto(`${SITE}/en`);
    await expect(page.getByTestId("account-email")).toHaveText(member);

    await page.goto(`${SITE}/fr/gestures`);
    await expect(page.getByTestId("account-email")).toHaveText(member);
  });

  test("keeps the session across the locale switcher in the header", async ({
    page,
  }) => {
    // The same claim by the route a visitor actually takes, rather than by a
    // typed URL: the switcher builds its own hrefs.
    await signInAs(page, member);
    await page.waitForURL(`${SITE}/nl`);

    await page.getByTestId("locale-switch-fr").click();
    await page.waitForURL(`${SITE}/fr`);

    await expect(page.getByTestId("account-email")).toHaveText(member);
  });

  test("signs out and returns to the locale it was asked from", async ({
    page,
  }) => {
    await signInAs(page, member);
    await page.waitForURL(`${SITE}/nl`);

    await page.goto(`${SITE}/en`);
    await page.getByTestId("sign-out").click();

    await page.waitForURL(`${SITE}/en`);
    await expect(page.getByTestId("sign-in-link")).toBeVisible();
    await expect(page.getByTestId("account-email")).toHaveCount(0);
  });

  test("refuses a wrong password and says the same thing either way", async ({
    page,
  }) => {
    await page.goto(`${SITE}/nl/sign-in`);
    await page.getByTestId("email").fill(member);
    await page.getByTestId("password").fill("not-the-password-at-all");
    await page.getByTestId("submit").click();

    await page.waitForURL(`${SITE}/nl/sign-in?error=invalid`);

    const refusal = await page.getByTestId("sign-in-error").textContent();

    await page.goto(`${SITE}/nl/sign-in`);
    await page.getByTestId("email").fill(uniqueAuthEmail("ghost"));
    await page.getByTestId("password").fill("not-the-password-at-all");
    await page.getByTestId("submit").click();

    await page.waitForURL(`${SITE}/nl/sign-in?error=invalid`);
    await expect(page.getByTestId("sign-in-error")).toHaveText(refusal ?? "");
    await expect(page.getByTestId("account-email")).toHaveCount(0);
  });

  test("registers a new account and signs in with it", async ({ page }) => {
    const fresh = uniqueAuthEmail("fresh");
    created.push(fresh);

    await page.goto(`${SITE}/nl/sign-up`);
    await page.getByTestId("email").fill(fresh);
    await page.getByTestId("password").fill(AUTH_PASSWORD);
    await page.getByTestId("submit").click();

    await page.waitForURL(`${SITE}/nl/sign-in?notice=registered`);
    await expect(page.getByTestId("sign-in-notice")).toBeVisible();

    await page.getByTestId("email").fill(fresh);
    await page.getByTestId("password").fill(AUTH_PASSWORD);
    await page.getByTestId("submit").click();

    await page.waitForURL(`${SITE}/nl`);
    await expect(page.getByTestId("account-email")).toHaveText(fresh);
  });

  test("says nothing different when the address is already taken", async ({
    page,
  }) => {
    await page.goto(`${SITE}/nl/sign-up`);
    await page.getByTestId("email").fill(member);
    await page.getByTestId("password").fill("a-different-password-here");
    await page.getByTestId("submit").click();

    // Identical landing to the fresh registration above, and no session.
    await page.waitForURL(`${SITE}/nl/sign-in?notice=registered`);
    await expect(page.getByTestId("sign-in-notice")).toBeVisible();
    await expect(page.getByTestId("account-email")).toHaveCount(0);
  });

  test("rejects a password under the policy floor", async ({ page }) => {
    const fresh = uniqueAuthEmail("weak");

    await page.goto(`${SITE}/nl/sign-up`);
    await page.getByTestId("email").fill(fresh);
    // `minLength` on the control would block the submit, so it is removed
    // first: the rule under test is the server's, not the browser's.
    await page
      .getByTestId("password")
      .evaluate((input) => input.removeAttribute("minlength"));
    await page.getByTestId("password").fill("short");
    await page.getByTestId("submit").click();

    await page.waitForURL(`${SITE}/nl/sign-up?error=password`);
    await expect(page.getByTestId("sign-up-error")).toBeVisible();
  });

  test("serves the endpoints at the rewritten paths", async ({ request }) => {
    /*
     * The routing half, fetched the way the form posts. A missing rewrite is
     * a 404 here and nowhere else — `next.config.ts` is not typechecked
     * against `src/endpoints/auth.ts`, and the integration tests address the
     * endpoints at their `/api/...` path, which exists either way.
     */
    const response = await request.post(`${SITE}/auth/sign-in`, {
      form: { email: uniqueAuthEmail("routing"), locale: "nl", password: "x" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe("/nl/sign-in?error=invalid");
  });

  /**
   * The two OAuth rewrites, checked the same way and for the same reason:
   * `next.config.ts` is not typechecked against `src/endpoints/oauth.ts`, and
   * the integration tests address those endpoints at `/api/auth/google`,
   * which exists whether or not the public path does. The callback path in
   * particular is a URL registered with Google as a redirect URI — if the
   * rewrite is gone, every real sign-in lands on a 404 and nothing else in
   * the suite notices.
   *
   * No Google credentials exist in CI, so `resolveProvider` answers `null`
   * and both paths redirect with `?error=oauth-unavailable`. That is the
   * assertion: reached and answered, not 404. The flow itself is proven
   * against a provider the integration test controls.
   */
  test("serves the Google endpoints at the rewritten paths", async ({
    request,
  }) => {
    for (const path of ["/auth/google", "/auth/google/callback"]) {
      const response = await request.get(`${SITE}${path}`, {
        maxRedirects: 0,
      });

      expect(response.status(), path).toBe(303);
      expect(response.headers().location, path).toBe(
        "/nl/sign-in?error=oauth-unavailable"
      );
    }
  });

  test("does not offer Google sign-in when it is not configured", async ({
    page,
  }) => {
    await page.goto(`${SITE}/nl/sign-in`);

    await expect(page.getByTestId("sign-in-google")).toHaveCount(0);
  });

  test("refuses a sign-in posted from another site", async ({ request }) => {
    const response = await request.post(`${SITE}/auth/sign-in`, {
      form: { email: member, locale: "nl", password: AUTH_PASSWORD },
      headers: { Origin: "https://evil.example" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(403);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
});
