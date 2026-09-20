import { expect, type Page, test } from "@playwright/test";
import { stallMux } from "../helpers/mux";
import {
  AUTH_PASSWORD,
  cleanupAuthUsers,
  seedAuthUser,
  uniqueAuthEmail,
} from "../helpers/seedAuthUser";
import {
  cleanupFavoriteFixtures,
  type FavoriteFixtures,
  seedFavoriteFixtures,
} from "../helpers/seedFavorites";

const SITE = "http://localhost:3003";
const GUEST_KEY = "smog.guest.favorites";

/**
 * Favorites on an account, through a real browser.
 *
 * `tests/e2e/favorites.spec.ts` covers the guest path and is unchanged; this
 * is the other backend behind the same two controls. Four things here cannot
 * be seen anywhere else:
 *
 * 1. **The rewrite.** `/account/favorites` is a `next.config.ts` entry
 *    pointing at a Payload endpoint. Delete it and every press posts into a
 *    404 — which typechecks, unit-tests and builds cleanly, and which the
 *    integration tests miss because they address the endpoint at its
 *    `/api/...` path.
 * 2. **That the heart is right on the *first* paint.** A signed-in reader's
 *    state is server-rendered, so there is no effect to wait for — and
 *    nothing below the browser can tell a correct first paint from a correct
 *    second one.
 * 3. **That the two stores stay apart.** A signed-in press must not land in
 *    `localStorage`, and a guest press must not survive signing in as
 *    somebody else.
 * 4. **A session that expires while the page is open.** The cookie is
 *    dropped out from under a loaded page, which is exactly what a real
 *    expiry looks like from the tab's point of view.
 */

const signInAs = async (page: Page, email: string) => {
  await page.goto(`${SITE}/nl/sign-in`);
  await page.getByTestId("email").fill(email);
  await page.getByTestId("password").fill(AUTH_PASSWORD);
  await page.getByTestId("submit").click();
  await page.waitForURL(`${SITE}/nl`);
};

const heart = (page: Page) => page.getByRole("button", { name: "Favoriet" });

/**
 * Presses the detail page's heart, once it is actually wired up.
 *
 * The wait is not padding, and it is not inherited from the guest spec for
 * convenience. A server-rendered button is inert until React hydrates, and a
 * press before that does nothing and reports nothing — so a spec that clicks
 * straight after `domcontentloaded` passes or fails on how fast the dev
 * server happened to compile the route.
 *
 * It bit again here. The first draft of `FavoriteButton` derived
 * `data-ready` from "the answer is known", which for a signed-in reader is
 * true in the server's own markup — so the attribute was there before
 * hydration, the wait returned instantly and six of these specs pressed a
 * dead button. `data-ready` now means "hydrated" on both paths; this helper
 * is what makes that mean something.
 */
const pressFavorite = async (page: Page) => {
  await expect(heart(page)).toHaveAttribute("data-ready", "true");
  await heart(page).click();
};

const openDetail = async (page: Page, id: string) => {
  await stallMux(page);
  await page.goto(`${SITE}/nl/gestures/${id}`, {
    waitUntil: "domcontentloaded",
  });
};

const cards = (page: Page) =>
  page.getByRole("list", { name: "Favorieten" }).locator("> li");

test.describe("Account favorites", () => {
  const created: string[] = [];
  let fixtures: FavoriteFixtures;

  test.beforeAll(async () => {
    fixtures = await seedFavoriteFixtures();
  });

  test.afterAll(async () => {
    await cleanupAuthUsers(created);
    await cleanupFavoriteFixtures(fixtures);
  });

  /**
   * A fresh account per test.
   *
   * These tests write to `users.favorites` and the row outlives the test, so
   * a shared account would make every one of them depend on the order the
   * others ran in — and Playwright does not promise one. The address is
   * unique for the reason `seedAuthUser` spells out: a fixed one collides
   * with a previous run's row on the `unique` email column, and a `beforeAll`
   * that throws is reported as *skipped* rather than failed.
   */
  const freshAccount = async (): Promise<string> => {
    const email = uniqueAuthEmail("fav");

    created.push(email);
    await seedAuthUser(email);

    return email;
  };

  test("favourites a gesture onto the account and keeps it across a reload", async ({
    page,
  }) => {
    await signInAs(page, await freshAccount());
    await openDetail(page, fixtures.firstId);

    await pressFavorite(page);
    await expect(heart(page)).toHaveAttribute("aria-pressed", "true");

    await page.reload({ waitUntil: "domcontentloaded" });

    // Server-rendered this time, from the account rather than from an effect.
    await expect(heart(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("does not put a signed-in favourite in this browser's storage", async ({
    page,
  }) => {
    await signInAs(page, await freshAccount());
    await openDetail(page, fixtures.firstId);

    await pressFavorite(page);
    await expect(heart(page)).toHaveAttribute("aria-pressed", "true");

    await expect
      .poll(
        async () =>
          await page.evaluate(
            (key) => window.localStorage.getItem(key),
            GUEST_KEY
          )
      )
      .toBeNull();
  });

  test("shows the account's favorites on the favorites page", async ({
    page,
  }) => {
    await signInAs(page, await freshAccount());
    await openDetail(page, fixtures.firstId);
    await pressFavorite(page);
    await expect(heart(page)).toHaveAttribute("aria-pressed", "true");

    await page.goto(`${SITE}/nl/favorites`);

    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText(fixtures.firstName);
    await expect(page.getByTestId("favorites-scope")).toContainText(
      "aan je account gekoppeld"
    );
  });

  test("follows the account into another browser session", async ({
    browser,
  }) => {
    /*
     * The claim the whole feature is sold on: the favorites page tells a
     * signed-in reader their favorites are on all their devices. A second
     * context is a second browser as far as `localStorage` is concerned, so
     * anything that survives it came off the account.
     */
    const email = await freshAccount();
    const first = await browser.newContext();
    const firstPage = await first.newPage();

    await signInAs(firstPage, email);
    await openDetail(firstPage, fixtures.secondId);
    await pressFavorite(firstPage);
    await expect(heart(firstPage)).toHaveAttribute("aria-pressed", "true");
    await first.close();

    const second = await browser.newContext();
    const secondPage = await second.newPage();

    await signInAs(secondPage, email);
    await secondPage.goto(`${SITE}/nl/favorites`);

    await expect(cards(secondPage)).toHaveCount(1);
    await expect(cards(secondPage).first()).toContainText(fixtures.secondName);

    await second.close();
  });

  test("un-favourites from the favorites page and it stays gone", async ({
    page,
  }) => {
    await signInAs(page, await freshAccount());
    await openDetail(page, fixtures.firstId);
    await pressFavorite(page);
    await expect(heart(page)).toHaveAttribute("aria-pressed", "true");

    await page.goto(`${SITE}/nl/favorites`);
    await expect(cards(page)).toHaveCount(1);

    await cards(page).first().getByRole("button", { name: "Favoriet" }).click();
    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();

    // And it was the account that changed, not just this render.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();
  });

  test("does not show a guest's favorites to a signed-in reader", async ({
    page,
  }) => {
    /*
     * A shared machine. Whatever the last visitor favourited is still in
     * this browser's `localStorage`; it is not this account's, and Task 6 —
     * not a silent read of the wrong store — is what will merge it.
     */
    await page.addInitScript(
      ([key, id]) => {
        window.localStorage.setItem(key, JSON.stringify([id]));
      },
      [GUEST_KEY, fixtures.firstId] as const
    );

    await signInAs(page, await freshAccount());
    await page.goto(`${SITE}/nl/favorites`);

    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();

    await openDetail(page, fixtures.firstId);
    await expect(heart(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("tells a reader whose session ended, and does not fill the heart", async ({
    page,
    context,
  }) => {
    await signInAs(page, await freshAccount());
    await openDetail(page, fixtures.firstId);
    await expect(heart(page)).toHaveAttribute("data-ready", "true");

    // Exactly what an expiry looks like from a page that is already open:
    // the markup still says "signed in" and the next request is anonymous.
    await context.clearCookies();

    await heart(page).click();

    await expect(page.getByTestId("favorite-error")).toContainText(
      "Je sessie is verlopen"
    );
    await expect(heart(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("serves the favourite endpoint at the rewritten path", async ({
    request,
  }) => {
    /*
     * The routing half, fetched the way the browser posts it. A missing
     * rewrite is a 404 here and nowhere else: `next.config.ts` is not
     * typechecked against `src/endpoints/favorites.ts`, and the integration
     * tests address the endpoint at `/api/account/favorites`, which exists
     * either way.
     *
     * Unauthenticated on purpose — 401 proves the handler was reached and
     * answered, which is the only thing routing can tell us.
     */
    const response = await request.post(`${SITE}/account/favorites`, {
      data: { favorite: true, gestureId: fixtures.firstId },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "signed-out" });
  });

  test("leaves the guest path exactly as it was", async ({ page }) => {
    // The other half of the mode switch, end to end: signed out, the heart
    // still writes to this browser and to nothing else.
    await openDetail(page, fixtures.firstId);

    await expect(heart(page)).toHaveAttribute("data-ready", "true");
    await pressFavorite(page);
    await expect(heart(page)).toHaveAttribute("aria-pressed", "true");

    await expect
      .poll(
        async () =>
          await page.evaluate(
            (key) => window.localStorage.getItem(key),
            GUEST_KEY
          )
      )
      .toBe(JSON.stringify([fixtures.firstId]));
  });
});
