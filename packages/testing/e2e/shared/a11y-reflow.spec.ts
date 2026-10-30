import {
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import {
  decideConsent,
  expectConsentOverlay,
  type Fixture,
  GUEST_ROUTES,
  newPublicPage,
  openPublic,
  STATES_MS,
  seedAccount,
  useSharedGuestPage,
} from "../../support/e2e/a11y-support";
import {
  settleForShot,
  stubMux,
  stubMuxStream,
  waitForApp,
} from "../../support/e2e/helpers";

const VIDEO_NAME = /^Naam in de video/;
const FULL_NAME = /^Volledige naam/;
const EMAIL = /^E-mail$/;

/*
 * Reflow, text spacing, reduced motion and landmarks (phase 9 task 5):
 * WCAG 1.4.10 (320 x 256 px is 1280 x 1024 at 400 % zoom, so no sideways
 * scrolling), 1.4.12 (the text-spacing override clips and overlaps
 * nothing), 2.3.3 (reduced motion runs no animation), and the page
 * structure every route shares (one `main`, a header and a footer, one
 * `h1`, a localised and unique title, `lang` follows the language).
 */

/** WCAG 1.4.12's override: the minimum spacing a user may force. */
const TEXT_SPACING = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

/** The document does not scroll sideways (1 px of rounding allowed). */
async function expectNoHorizontalScroll(
  page: Page,
  where: string
): Promise<void> {
  // Fonts and images in place: a late web font changes every line's width.
  await settleForShot(page);
  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    // The widest offenders, for the message.
    wide: [...document.body.querySelectorAll("*")]
      .filter(
        (node) =>
          node.getBoundingClientRect().right >
          document.documentElement.clientWidth + 1
      )
      .slice(0, 5)
      .map(
        (node) =>
          `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`
      ),
  }));
  expect(
    overflow.scroll,
    `${where}: ${overflow.wide.join(", ")}`
  ).toBeLessThanOrEqual(overflow.client + 1);
}

/** A signed-in page at 320 x 256 px with the fixture's data (removed again). */
async function withFixture(
  browser: Browser,
  body: (page: Page, fixture: Fixture) => Promise<void>
): Promise<void> {
  const { context, page } = await newPublicPage(browser, "light", 320);
  let cleanup: (() => Promise<void>) | undefined;
  try {
    await page.setViewportSize({ height: 256, width: 320 });
    const fixture = await seedAccount(page);
    ({ cleanup } = fixture);
    await body(page, fixture);
  } finally {
    await cleanup?.().catch(() => undefined);
    await context.close();
  }
}

test.describe("reflow at 320 x 256 px", () => {
  test.describe("guest routes", () => {
    const shared = useSharedGuestPage(320);
    for (const { name, path } of GUEST_ROUTES) {
      test(`${name} does not scroll sideways, in the light and the dark theme`, async () => {
        const page = shared.page();
        await page.setViewportSize({ height: 256, width: 320 });
        await openPublic(page, path);
        await expectNoHorizontalScroll(page, name);
        await page.evaluate(() =>
          document.documentElement.classList.add("dark")
        );
        await expectNoHorizontalScroll(page, `${name} [dark]`);
        await page.evaluate(() =>
          document.documentElement.classList.remove("dark")
        );
      });
    }
  });

  test.describe("the header's sign-in link and settings menu", () => {
    const shared = useSharedGuestPage(320);
    const link = (page: Page): Locator =>
      page.locator('header a[href^="/sign-in"]');
    const settings = (page: Page): Locator =>
      page.getByRole("banner").getByRole("button", { name: "Instellingen" });

    test("shows its icon and its label from md, beside the settings menu", async () => {
      const page = shared.page();
      await page.setViewportSize({ height: 800, width: 1280 });
      await openPublic(page, "/");
      const signIn = link(page);
      await expect(signIn.locator("svg")).toBeVisible();
      await expect(signIn).toHaveText("Aanmelden");
      await expect(settings(page)).toBeVisible();
    });

    for (const width of [390, 320] as const) {
      test(`on a phone (${width} px) the link gives way to the settings menu, which holds Sign in`, async () => {
        const page = shared.page();
        await page.setViewportSize({ height: 800, width });
        await openPublic(page, "/");
        await expect(link(page)).toBeHidden();
        await expect(settings(page)).toBeVisible();
        // Logo, menu, search and settings fit the header without sideways scroll.
        await expectNoHorizontalScroll(page, `header at ${width}`);
        await settings(page).click();
        await expect(
          page.getByRole("menuitem", { name: "Aanmelden" })
        ).toBeVisible();
      });
    }
  });

  test("the signed-in pages and a list fit too", async ({ browser }) => {
    test.setTimeout(STATES_MS);
    await withFixture(browser, async (page, fixture) => {
      for (const path of [
        "/my?tab=favorites",
        "/my?tab=lists",
        `/my?tab=lists&id=${fixture.listId}`,
        "/account",
        "/account?section=sign-in",
        "/account?section=privacy",
      ]) {
        // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
        await openPublic(page, path);
        await expectNoHorizontalScroll(page, path);
      }
    });
  });

  test("a shared list, by its view and its edit link, fits too", async ({
    browser,
  }) => {
    test.setTimeout(STATES_MS);
    await withFixture(browser, async (page, fixture) => {
      for (const path of [fixture.viewPath, fixture.editPath]) {
        // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
        await openPublic(page, path);
        await expectNoHorizontalScroll(page, path);
      }
    });
  });

  test("the open share sheet and delete dialog fit too", async ({
    browser,
  }) => {
    test.setTimeout(STATES_MS);
    await withFixture(browser, async (page, fixture) => {
      await openPublic(page, `/lists?id=${fixture.listId}`);
      await page
        .getByRole("region", { name: fixture.listName })
        .getByRole("button", { name: "Delen" })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Lijst delen" })
      ).toBeVisible();
      await expectNoHorizontalScroll(page, "share sheet");
      await page.keyboard.press("Escape");
      await expect(page.locator(`div[role="dialog"]`)).toBeHidden();
      await openPublic(page, "/account?section=privacy");
      await page
        .getByRole("button", { name: "Mijn account verwijderen" })
        .click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectNoHorizontalScroll(page, "delete dialog");
    });
  });

  test("the sponsor wizard's three steps and the consent banner fit", async ({
    browser,
  }) => {
    test.setTimeout(STATES_MS);
    const { context, page } = await newPublicPage(browser, "light", 320, {
      consent: false,
    });
    try {
      await page.setViewportSize({ height: 256, width: 320 });
      await page.goto("/sponsor?gesture=blij");
      await waitForApp(page);
      await expect(
        page.getByRole("region", { name: "Help SMOG verbeteren" })
      ).toBeVisible();
      await expectNoHorizontalScroll(page, "consent banner");
      // Taller than a 256 px viewport: the footer cannot clear it here, but
      // nothing is added after the footer either.
      await expectConsentOverlay(page, "consent banner at 400 %", {
        footerReachable: false,
      });
      await page.getByRole("button", { name: "Geen statistieken" }).click();
      await expectNoHorizontalScroll(page, "sponsor:1");
      await page.getByRole("button", { exact: true, name: "Doorgaan" }).click();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Je naam en contactgegevens",
        })
      ).toBeVisible();
      await expectNoHorizontalScroll(page, "sponsor:2");
      await page.getByLabel(VIDEO_NAME).fill("Bakkerij Jansen");
      await page.getByLabel(FULL_NAME).fill("Jan Jansen");
      await page.getByLabel(EMAIL).fill("reflow@example.test");
      await page
        .getByRole("button", { name: "Doorgaan naar voorbeeld" })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Bekijk je sponsoring" })
      ).toBeVisible();
      await expectNoHorizontalScroll(page, "sponsor:3");
    } finally {
      await context.close();
    }
  });

  test("the consent banner in French, the longest copy, at 320 px", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: "fr-BE",
      reducedMotion: "reduce",
      viewport: { height: 900, width: 320 },
    });
    try {
      const page = await context.newPage();
      await stubMux(page);
      await page.goto("/gestures");
      await waitForApp(page);
      await expectNoHorizontalScroll(page, "consent banner [fr]");
      await expectConsentOverlay(page, "consent banner [fr] at 320", {
        name: "Aidez-nous à améliorer SMOG",
      });
    } finally {
      await context.close();
    }
  });
});

/**
 * Text that a box cuts off (not an ellipsis the page chose on purpose):
 * an `overflow: hidden` or `clip` element whose content is larger than it.
 */
async function clipped(page: Page, scope: string): Promise<string[]> {
  return await page.evaluate((selector) => {
    const found: string[] = [];
    for (const root of document.querySelectorAll(selector)) {
      for (const node of [root, ...root.querySelectorAll("*")]) {
        const style = getComputedStyle(node);
        if (!(node instanceof HTMLElement && node.textContent?.trim())) {
          continue;
        }
        const clips =
          ["hidden", "clip"].includes(style.overflowX) ||
          ["hidden", "clip"].includes(style.overflowY);
        const intended =
          style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none";
        // A 1 px box is the screen-reader-only text (`sr-only`), not clipping.
        const hidden = node.clientWidth <= 1 && node.clientHeight <= 1;
        if (!clips || intended || hidden || style.display === "inline") {
          continue;
        }
        if (
          node.scrollHeight > node.clientHeight + 1 &&
          style.overflowY !== "visible"
        ) {
          found.push(
            `${node.tagName.toLowerCase()} height ${node.scrollHeight}>${node.clientHeight}: ${node.textContent.trim().slice(0, 40)}`
          );
        }
        if (
          node.scrollWidth > node.clientWidth + 1 &&
          style.overflowX !== "visible"
        ) {
          found.push(
            `${node.tagName.toLowerCase()} width ${node.scrollWidth}>${node.clientWidth}: ${node.textContent.trim().slice(0, 40)}`
          );
        }
      }
    }
    return found;
  }, scope);
}

/** Pairs of the scope's direct text-bearing children whose boxes overlap. */
async function overlapping(page: Page, scope: string): Promise<string[]> {
  return await page.evaluate((selector) => {
    const found: string[] = [];
    for (const root of document.querySelectorAll(selector)) {
      const boxes = [...root.children]
        .filter((child) => child.textContent?.trim())
        .map((child) => ({
          box: child.getBoundingClientRect(),
          name:
            child.tagName.toLowerCase() +
            (child.textContent ?? "").trim().slice(0, 20),
        }))
        .filter(({ box }) => box.width > 0 && box.height > 0);
      for (const [index, a] of boxes.entries()) {
        for (const b of boxes.slice(index + 1)) {
          const x =
            Math.min(a.box.right, b.box.right) -
            Math.max(a.box.left, b.box.left);
          const y =
            Math.min(a.box.bottom, b.box.bottom) -
            Math.max(a.box.top, b.box.top);
          if (x > 1 && y > 1) {
            found.push(`${a.name} overlaps ${b.name}`);
          }
        }
      }
    }
    return found;
  }, scope);
}

test.describe("text spacing (WCAG 1.4.12)", () => {
  for (const width of [320, 390, 1280]) {
    test.describe(`at ${width} px`, () => {
      const shared = useSharedGuestPage(width);
      for (const path of [
        "/",
        "/gestures",
        "/gestures/hond",
        "/sponsor?gesture=blij",
        "/sign-in",
      ]) {
        test(`header, cards and the footer of ${path} clip and overlap nothing`, async () => {
          const page = shared.page();
          await openPublic(page, path);
          await page.addStyleTag({ content: TEXT_SPACING });
          await expect
            .poll(() => clipped(page, "header, main, footer"), {
              message: path,
            })
            .toEqual([]);
          expect(await overlapping(page, "header > div"), path).toEqual([]);
          expect(await overlapping(page, "footer"), path).toEqual([]);
          await expectNoHorizontalScroll(page, `${path} spaced`);
        });
      }

      // The wizard's own step bar, with the spacing forced on step 2 as well.
      test("the sponsor wizard's step 2 clips nothing", async () => {
        const page = shared.page();
        await openPublic(page, "/sponsor?gesture=blij");
        await page
          .getByRole("button", { exact: true, name: "Doorgaan" })
          .click();
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Je naam en contactgegevens",
          })
        ).toBeVisible();
        await page.addStyleTag({ content: TEXT_SPACING });
        await expect
          .poll(() => clipped(page, "header, main, footer"), {
            message: "sponsor step 2",
          })
          .toEqual([]);
        await expectNoHorizontalScroll(page, "sponsor step 2 spaced");
      });
    });
  }
});

/** The longest animation or transition (in seconds) on the element and below it. */
function longestMotion(locator: Locator): Promise<number> {
  return locator.evaluate((root) => {
    const seconds = (value: string): number =>
      Math.max(...value.split(",").map((part) => Number.parseFloat(part) || 0));
    let longest = 0;
    for (const node of [root, ...root.querySelectorAll("*")]) {
      const style = getComputedStyle(node);
      longest = Math.max(
        longest,
        seconds(style.animationDuration),
        seconds(style.transitionDuration)
      );
    }
    return longest;
  });
}

test.describe("reduced motion", () => {
  test.describe("with the preference", () => {
    const shared = useSharedGuestPage(390);

    test("the context emulates the preference", async () => {
      // `themedContext` emulates `prefers-reduced-motion: reduce`.
      expect(
        await shared
          .page()
          .evaluate(
            () => matchMedia("(prefers-reduced-motion: reduce)").matches
          )
      ).toBe(true);
    });

    test("the favorite pop and the sheet do not move", async () => {
      const page = shared.page();
      await openPublic(page, "/gestures/hond");
      const heart = page
        .getByRole("main")
        .getByRole("button", { exact: true, name: "Favoriet" })
        .first();
      await heart.click();
      await expect(heart).toHaveAttribute("aria-pressed", "true");
      expect(await longestMotion(heart), "the favorite pop").toBe(0);
      await page.getByRole("button", { name: "Menu openen" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      expect(await longestMotion(sheet), "the sheet").toBe(0);
      await page.keyboard.press("Escape");
      await expect(page.locator(`div[role="dialog"]`)).toBeHidden();
    });

    test("the dialog, the menu and a header button's hover do not move", async () => {
      const page = shared.page();
      await openPublic(page, "/gestures/hond");
      await page.getByRole("button", { name: "Opslaan in lijst" }).click();
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();
      expect(await longestMotion(dialog), "the dialog").toBe(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "Instellingen" }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      expect(await longestMotion(menu), "the menu").toBe(0);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      // A button's colour change is instant too.
      expect(
        await longestMotion(
          page.getByRole("button", { name: "Zoeken" }).first()
        ),
        "a header button's hover transition"
      ).toBe(0);
    });

    // A toast: the analytics switch on the account page says it saved.
    test("the toast does not move", async () => {
      const page = shared.page();
      await openPublic(page, "/account?section=privacy");
      await page.getByRole("switch", { name: "Gebruiksstatistieken" }).click();
      const toast = page
        .getByRole("region", { name: "Meldingen" })
        .getByText("Je keuze is bewaard.");
      await expect(toast).toBeVisible();
      expect(
        await longestMotion(page.getByRole("region", { name: "Meldingen" })),
        "the toast"
      ).toBe(0);
    });
  });

  test("without the preference the same sheet, dialog and toast do move (the assertions are not vacuous)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: "nl-BE",
      reducedMotion: "no-preference",
      viewport: { height: 800, width: 390 },
    });
    try {
      const page = await context.newPage();
      await stubMux(page);
      await stubMuxStream(page);
      await decideConsent(page);
      await openPublic(page, "/");
      await page.getByRole("button", { name: "Menu openen" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      expect(await longestMotion(sheet)).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await openPublic(page, "/account?section=privacy");
      await page.getByRole("switch", { name: "Gebruiksstatistieken" }).click();
      const toasts = page.getByRole("region", { name: "Meldingen" });
      await expect(toasts.getByText("Je keuze is bewaard.")).toBeVisible();
      expect(await longestMotion(toasts)).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
