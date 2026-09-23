import { expect, test } from "@playwright/test";
import { stallMux } from "../helpers/mux";
import {
  cleanupSharedListFixtures,
  type SharedListFixtures,
  seedSharedListFixtures,
  unshareList,
} from "../helpers/seedSharedList";

const SITE = "http://localhost:3003";

/**
 * The share link, through the whole stack.
 *
 * `shareTokens.int.test.ts` proves what the database answers. This proves the
 * part that only a browser can: that the token in the *path* reaches the
 * access filter at all (a Local API call has no URL of its own, so the page
 * has to hand `req.searchParams` over itself), and that a dead link renders a
 * page rather than a 500 or a 404.
 *
 * The tests run in order and share one list on purpose: the last one revokes
 * it, and "the same URL that worked a moment ago now does not" is the claim.
 */
test.describe.configure({ mode: "serial" });

test.describe("Shared list", () => {
  let fixtures: SharedListFixtures;

  test.beforeAll(async () => {
    fixtures = await seedSharedListFixtures();
  });

  test.afterAll(async () => {
    await cleanupSharedListFixtures(fixtures);
  });

  test("renders someone else's list from the link they sent", async ({
    page,
  }) => {
    await stallMux(page);
    const response = await page.goto(
      `${SITE}/nl/lists/${fixtures.viewShareToken}`,
      { waitUntil: "domcontentloaded" }
    );

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.listName
    );
    await expect(page.getByRole("list", { name: "Gebaren" })).toContainText(
      fixtures.gestureName
    );
  });

  test("says a link it does not recognise is no longer valid, rather than failing", async ({
    page,
  }) => {
    const response = await page.goto(`${SITE}/nl/lists/niet-een-echte-token`, {
      waitUntil: "domcontentloaded",
    });

    // 200, not 404 and emphatically not 500: a revoked link is the expected
    // end of a share link's life and the reader did nothing wrong.
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("share-link-invalid")).toBeVisible();
  });

  test("stops honouring the link once the owner makes the list private", async ({
    page,
  }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/lists/${fixtures.viewShareToken}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.listName
    );

    await unshareList(fixtures.listId);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("share-link-invalid")).toBeVisible();
    await expect(page.getByText(fixtures.gestureName)).toBeHidden();
  });
});
