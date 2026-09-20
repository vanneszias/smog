import { expect, type Locator, type Page, test } from "@playwright/test";
import { stallMux } from "../helpers/mux";
import {
  cleanupGestureDetailFixtures,
  type GestureDetailFixtures,
  seedGestureDetailFixtures,
} from "../helpers/seedGestureDetail";
import {
  cleanupSharedListFixtures,
  type SharedListFixtures,
  seedSharedListFixtures,
} from "../helpers/seedSharedList";

const SITE = "http://localhost:3003";

/**
 * How many times the spec presses Tab before giving up on a control.
 *
 * The header contributes four focus stops before `<main>` starts, and the
 * gestures list adds a search box, a category button per category and a pager
 * before the first card. Forty is comfortably past that and still fails in
 * about a second when a control genuinely cannot be reached.
 */
const MAX_TABS = 40;

/**
 * **A floor, not an audit.** Four things per page type, each of which is a
 * page that cannot be used rather than a page that could be nicer: one `<h1>`,
 * alt text on every image, the primary action reachable from the keyboard,
 * and no positive `tabindex`. A real audit — contrast on every state, focus
 * order, live regions, reduced motion, a screen reader — is a different piece
 * of work and this spec does not stand in for one.
 *
 * Every DOM query below runs through `page.evaluate` and
 * `document.querySelectorAll` rather than a Playwright locator, and that is
 * deliberate: Playwright's CSS engine pierces open shadow roots, so
 * `page.locator("img")` also returns whatever `mux-player` renders inside its
 * own shadow DOM. Those are not this application's markup and cannot be
 * fixed here. `querySelectorAll` sees the light DOM only, which is exactly
 * the markup these pages author.
 */

/** Every `<h1>` in the page's own markup, as text. */
const headings = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("h1")).map(
      (heading) => heading.textContent?.trim() ?? ""
    )
  );

/**
 * Images with no usable alternative text.
 *
 * A missing `alt` attribute always counts. An empty one counts too *unless*
 * the image is explicitly marked decorative, which is the one case where
 * `alt=""` is the correct answer rather than a forgotten one.
 */
const imagesWithoutAlt = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("main img"))
      .filter((image) => {
        const alt = image.getAttribute("alt");
        const decorative =
          image.getAttribute("aria-hidden") === "true" ||
          image.getAttribute("role") === "presentation";

        return alt === null || (alt.trim() === "" && !decorative);
      })
      .map((image) => image.getAttribute("src") ?? "(no src)")
  );

/**
 * Elements that jump the queue in the focus order.
 *
 * A positive `tabindex` moves an element ahead of every natural stop on the
 * page, so one of them reorders the whole document for a keyboard user. `0`
 * and `-1` are both fine and both common.
 */
const positiveTabIndexes = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[tabindex]"))
      .filter((element) => {
        const value = Number.parseInt(
          element.getAttribute("tabindex") ?? "0",
          10
        );

        return Number.isFinite(value) && value > 0;
      })
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}[tabindex=${element.getAttribute("tabindex")}]`
      )
  );

/**
 * Tabs forward from the top of the document until `target` has focus.
 *
 * Pressing Tab for real rather than calling `.focus()`: the question is
 * whether a keyboard user can *get* to the control, and `.focus()` answers a
 * different question — one that a `tabindex="-1"` or a focus trap would also
 * pass.
 */
async function tabsTo(page: Page, target: Locator): Promise<boolean> {
  await expect(target).toBeVisible();
  await page.locator("body").press("Tab");

  for (let press = 0; press < MAX_TABS; press++) {
    if (await target.evaluate((node) => node === document.activeElement)) {
      return true;
    }

    await page.keyboard.press("Tab");
  }

  return false;
}

let detail: GestureDetailFixtures;
let shared: SharedListFixtures;

test.beforeAll(async () => {
  detail = await seedGestureDetailFixtures();
  shared = await seedSharedListFixtures();
});

test.afterAll(async () => {
  await cleanupGestureDetailFixtures(detail);
  await cleanupSharedListFixtures(shared);
});

/**
 * One case per page type. The primary action is the thing the page exists to
 * let someone do — browse from the home page, open a gesture from a list,
 * save one from its detail page.
 */
const PAGE_TYPES: {
  name: string;
  path: () => string;
  primary: (page: Page) => Locator;
}[] = [
  {
    name: "the locale home",
    path: () => `${SITE}/nl`,
    primary: (page) => page.getByRole("link", { name: "Bekijk alle gebaren" }),
  },
  {
    name: "the gestures list",
    path: () => `${SITE}/nl/gestures`,
    primary: (page) =>
      page.getByRole("list", { name: "Gebaren" }).locator("> li a").first(),
  },
  {
    name: "a gesture detail page",
    path: () => `${SITE}/nl/gestures/${detail.activeId}`,
    primary: (page) => page.getByRole("button", { name: "Favoriet" }),
  },
  {
    name: "the favorites page",
    path: () => `${SITE}/nl/favorites`,
    // With nothing favourited, the empty state's own call to action is the
    // primary action. It is also the state every first-time visitor sees.
    primary: (page) => page.getByRole("link", { name: "Blader door gebaren" }),
  },
  {
    name: "a shared list",
    path: () => `${SITE}/nl/lists/${shared.viewShareToken}`,
    primary: (page) =>
      page.getByRole("list", { name: "Gebaren" }).locator("> li a").first(),
  },
];

for (const pageType of PAGE_TYPES) {
  test(`${pageType.name} meets the accessibility floor`, async ({ page }) => {
    // The player's requests are stalled rather than allowed out: online it
    // plays and offline it unmounts into an error state, and neither this
    // spec nor the machine running it should decide which.
    await stallMux(page);

    /*
     * `domcontentloaded`, not the default `load`, and this is load-bearing
     * rather than a preference — every other spec that stalls Mux does the
     * same. `load` waits for every subresource, and `stallMux` deliberately
     * holds the player's requests open for ever, so on any run where
     * hydration starts a Mux request before the load event fires, `page.goto`
     * waits for a response that by construction never comes and the test
     * times out. It is a race, so it fails one run in several — which is the
     * worst kind. Caught here by the detail page timing out at 30 s during
     * the five-run flake check.
     *
     * Nothing below needs a settled page: the markup is server-rendered and
     * the focus order is a property of the DOM.
     */
    const response = await page.goto(pageType.path(), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);

    expect(
      await headings(page),
      `${pageType.name} must have exactly one <h1>`
    ).toHaveLength(1);

    expect(
      await imagesWithoutAlt(page),
      `${pageType.name} has images with no alt text`
    ).toEqual([]);

    expect(
      await positiveTabIndexes(page),
      `${pageType.name} has elements with a positive tabindex`
    ).toEqual([]);

    expect(
      await tabsTo(page, pageType.primary(page)),
      `${pageType.name} must reach its primary action within ${MAX_TABS} tab presses`
    ).toBe(true);
  });
}
