import { expect, test } from "@playwright/test";
import { stallMux } from "../helpers/mux";
import {
  cleanupFavoriteFixtures,
  type FavoriteFixtures,
  seedFavoriteFixtures,
} from "../helpers/seedFavorites";

const SITE = "http://localhost:3003";

/**
 * The favourite cards, direct children only.
 *
 * `> li` and not `getByRole("listitem")`: each card renders its categories as
 * a nested `<ul>`, so a descendant query counts the badges as cards.
 */
const cards = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Favorieten" }).locator("> li");

/**
 * Presses the detail page's favourite control, once it is actually wired up.
 *
 * The wait is not padding. The button is server-rendered before React
 * hydrates, and a press before hydration does nothing at all and reports
 * nothing — so a spec that clicks straight after `domcontentloaded` passes or
 * fails on how fast the dev server happened to compile the route. That was
 * observed, four tests at a time. `data-ready` is set by the component's own
 * mount effect and is the only honest signal that the control means what it
 * says.
 */
const pressFavorite = async (page: import("@playwright/test").Page) => {
  const heart = page.getByRole("button", { name: "Favoriet" });

  await expect(heart).toHaveAttribute("data-ready", "true");
  await heart.click();

  return heart;
};

test.describe("Guest favorites", () => {
  let fixtures: FavoriteFixtures;

  test.beforeAll(async () => {
    fixtures = await seedFavoriteFixtures();
  });

  test.afterAll(async () => {
    await cleanupFavoriteFixtures(fixtures);
  });

  test("starts with nothing and says so", async ({ page }) => {
    const response = await page.goto(`${SITE}/nl/favorites`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Favorieten"
    );
    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();
  });

  test("keeps a gesture favourited from its detail page", async ({ page }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.firstId}`, {
      waitUntil: "domcontentloaded",
    });

    const heart = await pressFavorite(page);
    await expect(heart).toHaveAttribute("aria-pressed", "true");

    await page.goto(`${SITE}/nl/favorites`);

    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText(fixtures.firstName);
  });

  test("survives a reload of the detail page", async ({ page }) => {
    // The state is in `localStorage`, so this is
    // the assertion that it is actually written and read back rather than
    // held in React.
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.firstId}`, {
      waitUntil: "domcontentloaded",
    });

    await pressFavorite(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("button", { name: "Favoriet" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("shows favourites in the order they were added", async ({ page }) => {
    await stallMux(page);

    for (const id of [fixtures.secondId, fixtures.firstId]) {
      await page.goto(`${SITE}/nl/gestures/${id}`, {
        waitUntil: "domcontentloaded",
      });
      await pressFavorite(page);
    }

    await page.goto(`${SITE}/nl/favorites`);

    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0)).toContainText(fixtures.secondName);
    await expect(cards(page).nth(1)).toContainText(fixtures.firstName);
  });

  test("un-favourites from the favorites page itself", async ({ page }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.firstId}`, {
      waitUntil: "domcontentloaded",
    });
    await pressFavorite(page);

    await page.goto(`${SITE}/nl/favorites`);
    await expect(cards(page)).toHaveCount(1);

    await cards(page).first().getByRole("button", { name: "Favoriet" }).click();

    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();

    // And it stayed removed, rather than only disappearing from this render.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();
  });

  test("links a favourite back to its detail page", async ({ page }) => {
    await stallMux(page);
    await page.goto(`${SITE}/nl/gestures/${fixtures.firstId}`, {
      waitUntil: "domcontentloaded",
    });
    await pressFavorite(page);

    await page.goto(`${SITE}/nl/favorites`);
    await cards(page).first().getByRole("link").click();

    await expect(page).toHaveURL(`${SITE}/nl/gestures/${fixtures.firstId}`);
  });

  test("renders a page, not a blank one, when site data is blocked", async ({
    page,
  }) => {
    /*
     * The guarded store, through the whole stack rather than at the helper.
     *
     * This is what a private window and a "block site data" setting actually
     * do: the `localStorage` *getter* throws rather than returning null. An
     * unguarded read is then an exception during render, and an exception
     * during render is a blank page — which is the failure the guarded store
     * exists to prevent, and which no happy-path test would ever see.
     *
     * `addInitScript` installs it before any page script runs, so the app
     * never sees a working store at any point.
     */
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("denied", "SecurityError");
        },
      });
    });
    await stallMux(page);

    const favorites = await page.goto(`${SITE}/nl/favorites`);

    expect(favorites?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Favorieten"
    );
    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();

    const detail = await page.goto(`${SITE}/nl/gestures/${fixtures.firstId}`, {
      waitUntil: "domcontentloaded",
    });

    expect(detail?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.firstName
    );
    // The control is still there and still pressable; it just cannot
    // remember. That is a degraded page, not a broken one.
    await expect(page.getByRole("button", { name: "Favoriet" })).toBeVisible();
    await pressFavorite(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.firstName
    );
  });

  test("drops a favourite the editors have since deactivated", async ({
    page,
  }) => {
    // A bookmark outliving what it points at is normal. The card disappears;
    // the page does not.
    await page.addInitScript(
      ([key, id]) => {
        window.localStorage.setItem(key, JSON.stringify([id, "999000001"]));
      },
      ["smog.guest.favorites", fixtures.firstId] as const
    );

    await page.goto(`${SITE}/nl/favorites`);

    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText(fixtures.firstName);
    // And the category badge, which only renders if the request asked for
    // `depth=1` *and* kept `categories` in its `select`. Getting either wrong
    // leaves a card that renders but says less than it should — the kind of
    // thing a count assertion never notices.
    await expect(cards(page).first()).toContainText(fixtures.categoryName);
  });

  test("ignores a corrupt store rather than failing the page", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("smog.guest.favorites", "{not json");
    });

    const response = await page.goto(`${SITE}/nl/favorites`);

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Nog geen favorieten" })
    ).toBeVisible();
  });

  test("is reachable from the header on every locale", async ({ page }) => {
    await page.goto(`${SITE}/fr/gestures`);

    await page
      .getByRole("navigation", { name: "Hoofdnavigatie" })
      .getByRole("link", { name: "Favorieten" })
      .click();

    await expect(page).toHaveURL(`${SITE}/fr/favorites`);
  });
});
