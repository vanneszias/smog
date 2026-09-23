import { expect, type Page, test } from "@playwright/test";
import {
  AUTH_PASSWORD,
  cleanupAuthUsers,
  seedAuthUser,
  uniqueAuthEmail,
} from "../helpers/seedAuthUser";
import { seedConsent } from "../helpers/seedConsent";
import {
  cleanupListGestureFixtures,
  type ListGestureFixtures,
  seedListGestureFixtures,
} from "../helpers/seedListGestures";

const SITE = "http://localhost:3003";

/**
 * The owner's list pages, through a real browser.
 *
 * What only this layer can see:
 *
 * 1. **The six rewrites.** `/account/lists/create`, `rename`, `delete`,
 *    `add`, `remove` and `share` are `next.config.ts` entries pointing at
 *    Payload endpoints under `/api/`. Delete one and the form posts into a
 *    404 — which typechecks, unit-tests, builds and passes every integration
 *    test, because those call the endpoint's real path.
 * 2. **That the forms carry the fields the endpoints read.** A renamed input
 *    is invisible to both other layers: the page still renders and the
 *    endpoint still works when called directly.
 * 3. **That the two `lists` routes coexist.** `/{locale}/lists/[shareToken]`
 *    is public and `/{locale}/account/lists/[id]` is the owner's, and the
 *    share test below walks from one to the other. Two different slug names
 *    on the *same* segment is a build-time throw in Next's router, which is
 *    why the owner's pages are under `/account` — a spec that opens both is
 *    what keeps that from being re-litigated by someone moving a directory.
 * 4. **That a signed-out visitor never sees any of it**, which is a
 *    `redirect()` in a server component and only a request exercises.
 *
 * Absence is never the assertion on its own. An element that has not rendered
 * yet satisfies `toBeHidden()` — a mistake this suite has made before — so
 * every "it is gone" here is paired with something whose presence proves the
 * page has settled.
 */

const signInAs = async (page: Page, email: string) => {
  await page.goto(`${SITE}/nl/sign-in`);
  await page.getByTestId("email").fill(email);
  await page.getByTestId("password").fill(AUTH_PASSWORD);
  await page.getByTestId("submit").click();
  await page.waitForURL(`${SITE}/nl`);
};

test.describe("The owner's list pages", () => {
  const created: string[] = [];
  let fixtures: ListGestureFixtures;

  const freshMember = async (prefix: string) => {
    const email = uniqueAuthEmail(prefix);

    created.push(email);
    await seedAuthUser(email);

    return email;
  };

  /** A list made through the UI, left on its own page. */
  const makeList = async (page: Page, label: string) => {
    const name = `Lijst ${fixtures.run} ${label}`;

    await page.goto(`${SITE}/nl/account/lists`);
    await page.getByTestId("list-name").fill(name);
    await page.getByTestId("create-list").click();
    await page.waitForURL(/\/nl\/account\/lists\/\d+\?notice=created$/);

    return name;
  };

  test.beforeAll(async () => {
    fixtures = await seedListGestureFixtures();
  });

  test.afterAll(async () => {
    await cleanupListGestureFixtures(fixtures);
    await cleanupAuthUsers(created);
  });

  test("sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto(`${SITE}/nl/account/lists`);

    await page.waitForURL(`${SITE}/nl/sign-in`);
    await expect(page.getByTestId("submit")).toBeVisible();
  });

  test("sends a signed-out visitor away from one list too", async ({
    page,
  }) => {
    await page.goto(`${SITE}/nl/account/lists/${fixtures.otherListId}`);

    await page.waitForURL(`${SITE}/nl/sign-in`);
    await expect(page.getByTestId("submit")).toBeVisible();
  });

  test("is reached from the account page", async ({ page }) => {
    const member = await freshMember("lists-nav");

    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account`);
    await page.getByTestId("account-lists-link").click();

    await page.waitForURL(`${SITE}/nl/account/lists`);
    await expect(page.getByTestId("lists-empty")).toBeVisible();
  });

  test("creates a list, and it shows up on the index", async ({ page }) => {
    const member = await freshMember("lists-create");

    await signInAs(page, member);
    const name = await makeList(page, "nieuw");

    await expect(page.getByTestId("list-title")).toHaveText(name);
    await expect(page.getByTestId("list-notice")).toBeVisible();

    await page.goto(`${SITE}/nl/account/lists`);
    await expect(page.getByTestId("list-link")).toHaveText(name);
    await expect(page.getByTestId("lists-count")).toHaveText("1 lijsten");
  });

  test("refuses a list with no name at all", async ({ page }) => {
    // The `required` attribute is a browser's opinion. Posting the form
    // without it is what the endpoint has to refuse, so the input is cleared
    // of its constraint first.
    const member = await freshMember("lists-blank");

    await signInAs(page, member);
    await page.goto(`${SITE}/nl/account/lists`);
    await page
      .getByTestId("list-name")
      .evaluate((input) => input.removeAttribute("required"));
    await page.getByTestId("create-list").click();

    await page.waitForURL(`${SITE}/nl/account/lists?error=name`);
    await expect(page.getByTestId("lists-error")).toBeVisible();
  });

  test("renames a list", async ({ page }) => {
    const member = await freshMember("lists-rename");

    await signInAs(page, member);
    await makeList(page, "hernoem");

    const renamed = `Lijst ${fixtures.run} hernoemd`;
    await page.getByTestId("rename-name").fill(renamed);
    await page.getByTestId("rename-description").fill("Met omschrijving");
    await page.getByTestId("rename-list").click();

    await page.waitForURL(/\?notice=renamed$/);
    await expect(page.getByTestId("list-title")).toHaveText(renamed);
    await expect(page.getByTestId("rename-description")).toHaveValue(
      "Met omschrijving"
    );
  });

  test("adds a gesture found by search, and takes it off again", async ({
    page,
  }) => {
    const member = await freshMember("lists-items");

    await signInAs(page, member);
    await makeList(page, "gebaren");

    await page.getByTestId("list-search").fill(fixtures.searchName);
    await page.getByTestId("list-search-submit").click();

    // Presence, not absence: the result has to be there before it can be
    // clicked, and the click is what proves the rewrite resolves.
    await expect(page.getByTestId("add-gesture")).toBeVisible();
    await page.getByTestId("add-gesture").click();

    await page.waitForURL(/\?notice=added$/);
    await expect(page.getByTestId("list-item")).toHaveText(fixtures.searchName);
    await expect(page.getByTestId("list-count")).toContainText("1 gebaren");

    await page.getByTestId("remove-gesture").click();

    await page.waitForURL(/\?notice=removed$/);
    // The empty state's *presence* is the assertion. `toBeHidden()` on the
    // item would pass on a page that had not rendered at all.
    await expect(page.getByTestId("list-empty")).toBeVisible();
    await expect(page.getByTestId("list-count")).toContainText("0 gebaren");
  });

  test("says so rather than offering a gesture twice", async ({ page }) => {
    const member = await freshMember("lists-twice");

    await signInAs(page, member);
    await makeList(page, "dubbel");

    await page.getByTestId("list-search").fill(fixtures.searchName);
    await page.getByTestId("list-search-submit").click();
    await page.getByTestId("add-gesture").click();
    await page.waitForURL(/\?notice=added$/);

    await page.getByTestId("list-search").fill(fixtures.searchName);
    await page.getByTestId("list-search-submit").click();

    await expect(page.getByTestId("already-on-list")).toBeVisible();
  });

  test("shares a list, the link works, and un-sharing kills it", async ({
    page,
  }) => {
    const member = await freshMember("lists-share");

    await signInAs(page, member);
    const name = await makeList(page, "delen");
    const owned = page.url().split("?")[0] ?? "";

    await page.getByTestId("share-list").click();
    await page.waitForURL(/\?notice=shared$/);

    const link = (await page.getByTestId("share-link").innerText()).trim();
    expect(link).toMatch(/^\/nl\/lists\/[0-9a-f-]{36}$/);

    // The public page, by the capability URL the owner was just handed.
    await page.goto(`${SITE}${link}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.goto(owned);
    await page.getByTestId("unshare-list").click();
    await page.waitForURL(/\?notice=unshared$/);

    // Revocation is rotation: the exact link stops resolving, rather than
    // being merely discouraged. The "this link is gone" page is asserted by
    // presence, because a blank page would satisfy an absence check.
    await page.goto(`${SITE}${link}`);
    await expect(page.getByTestId("share-link-invalid")).toBeVisible();
  });

  test("refuses to delete on a mistyped name, and then deletes", async ({
    page,
  }) => {
    const member = await freshMember("lists-delete");

    // Not what this test is about — see `seedConsent`'s own comment.
    // `account.spec.ts`'s "deletes the account when the address is typed"
    // is the one place that still leaves this unseeded, on purpose.
    await seedConsent(page);
    await signInAs(page, member);
    const name = await makeList(page, "weg");

    await page.getByTestId("delete-confirm-name").fill(`${name} niet`);
    await page.getByTestId("delete-list").click();

    await page.waitForURL(/\?error=confirm$/);
    await expect(page.getByTestId("list-error")).toBeVisible();
    // Still there, which is the half a status code cannot tell you.
    await expect(page.getByTestId("list-title")).toHaveText(name);

    await page.getByTestId("delete-confirm-name").fill(name);
    await page.getByTestId("delete-list").click();

    await page.waitForURL(`${SITE}/nl/account/lists?notice=deleted`);
    await expect(page.getByTestId("lists-notice")).toBeVisible();
    // The notice above proves the index rendered; only then does the empty
    // state mean the list is gone rather than the page being unfinished.
    await expect(page.getByTestId("lists-empty")).toBeVisible();
  });

  test("404s on a list that belongs to somebody else", async ({ page }) => {
    const member = await freshMember("lists-stranger");

    await signInAs(page, member);
    const response = await page.goto(
      `${SITE}/nl/account/lists/${fixtures.otherListId}`
    );

    expect(response?.status()).toBe(404);
  });
});
