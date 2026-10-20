import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  decideConsent,
  GUEST_ROUTES,
  newPublicPage,
  openPublic,
  seedAccount,
} from "./a11y-support";
import { settleForShot, stubMux, stubMuxStream, waitForApp } from "./helpers";

const VIDEO_NAME = /^Naam in de video/;
const FULL_NAME = /^Volledige naam/;
const EMAIL = /^E-mail$/;
const FAVORIETEN = /Favorieten/;
const GEBAAR = /gebaar/;
const NO_RESULTS = /geen|Geen/;
const SUBMIT = /Doorgaan|Account maken/;

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

test.describe("reflow at 320 x 256 px", () => {
  test("no guest route scrolls sideways, in the light and the dark theme", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { context, page } = await newPublicPage(browser, "light", 320);
    try {
      await page.setViewportSize({ height: 256, width: 320 });
      for (const { name, path } of GUEST_ROUTES) {
        // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
        await openPublic(page, path);
        await expectNoHorizontalScroll(page, name);
        await page.evaluate(() =>
          document.documentElement.classList.add("dark")
        );
        await expectNoHorizontalScroll(page, `${name} [dark]`);
        await page.evaluate(() =>
          document.documentElement.classList.remove("dark")
        );
      }
    } finally {
      await context.close();
    }
  });

  test("the signed-in pages, a list, a shared list and the open overlays fit too", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { context, page } = await newPublicPage(browser, "light", 320);
    let cleanup: (() => Promise<void>) | undefined;
    try {
      await page.setViewportSize({ height: 256, width: 320 });
      const fixture = await seedAccount(page);
      ({ cleanup } = fixture);
      for (const path of [
        "/favorites",
        "/lists",
        `/lists?id=${fixture.listId}`,
        fixture.viewPath,
        fixture.editPath,
        "/account",
      ]) {
        // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
        await openPublic(page, path);
        await expectNoHorizontalScroll(page, path);
      }
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
      await openPublic(page, "/account");
      await page
        .getByRole("button", { name: "Mijn account verwijderen" })
        .click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectNoHorizontalScroll(page, "delete dialog");
    } finally {
      await cleanup?.().catch(() => undefined);
      await context.close();
    }
  });

  test("the sponsor wizard's three steps and the consent banner fit", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
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
      await page.getByRole("button", { name: "Alleen noodzakelijke" }).click();
      await expectNoHorizontalScroll(page, "sponsor:1");
      await page.getByRole("button", { exact: true, name: "Doorgaan" }).click();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Configureer je sponsoring",
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
    test(`header, cards and the sponsor wizard clip and overlap nothing at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { context, page } = await newPublicPage(browser, "light", width);
      try {
        for (const path of [
          "/",
          "/gestures",
          "/gestures/hond",
          "/sponsor?gesture=blij",
          "/sign-in",
        ]) {
          // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
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
        }
        // The wizard's own step bar, with the spacing forced on step 2 as well.
        await openPublic(page, "/sponsor?gesture=blij");
        await page
          .getByRole("button", { exact: true, name: "Doorgaan" })
          .click();
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Configureer je sponsoring",
          })
        ).toBeVisible();
        await page.addStyleTag({ content: TEXT_SPACING });
        await expect
          .poll(() => clipped(page, "header, main, footer"), {
            message: "sponsor step 2",
          })
          .toEqual([]);
        await expectNoHorizontalScroll(page, "sponsor step 2 spaced");
      } finally {
        await context.close();
      }
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
  test("the favorite pop, the sheet, the dialog, the menu and the toast do not move", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    // `themedContext` emulates `prefers-reduced-motion: reduce`.
    const { context, page } = await newPublicPage(browser, "light", 390);
    try {
      expect(
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches
        )
      ).toBe(true);
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
      await page.getByRole("button", { name: "Opslaan in lijst" }).click();
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();
      expect(await longestMotion(dialog), "the dialog").toBe(0);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Acties voor Hond" }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      expect(await longestMotion(menu), "the menu").toBe(0);
      await page.keyboard.press("Escape");
      // A button's colour change is instant too.
      expect(
        await longestMotion(
          page.getByRole("button", { name: "Zoeken" }).first()
        ),
        "a header button's hover transition"
      ).toBe(0);

      // A toast: the analytics switch on the account page says it saved.
      await openPublic(page, "/account");
      await page.getByRole("switch", { name: "Gebruiksstatistieken" }).click();
      const toast = page
        .getByRole("region", { name: "Meldingen" })
        .getByText("Je keuze is bewaard.");
      await expect(toast).toBeVisible();
      expect(
        await longestMotion(page.getByRole("region", { name: "Meldingen" })),
        "the toast"
      ).toBe(0);
    } finally {
      await context.close();
    }
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
      await openPublic(page, "/account");
      await page.getByRole("switch", { name: "Gebruiksstatistieken" }).click();
      const toasts = page.getByRole("region", { name: "Meldingen" });
      await expect(toasts.getByText("Je keuze is bewaard.")).toBeVisible();
      expect(await longestMotion(toasts)).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});

const TITLED = [
  "/",
  "/gestures",
  "/gestures/hond",
  "/favorites",
  "/lists",
  "/account",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password?token=e2e",
  "/verify-email",
  "/privacy",
  "/terms",
  "/sponsor",
] as const;

test.describe("landmarks, titles and the language", () => {
  const LOCALES = [
    { accept: "nl-BE", lang: "nl", skip: "Naar de inhoud" },
    { accept: "en-GB", lang: "en", skip: "Skip to content" },
    { accept: "fr-BE", lang: "fr", skip: "Aller au contenu" },
  ] as const;

  for (const { accept, lang, skip } of LOCALES) {
    test(`every route has one main, a header, a footer, one h1 and its own ${lang} title`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const context = await browser.newContext({
        locale: accept,
        viewport: { height: 900, width: 1280 },
      });
      try {
        const page = await context.newPage();
        await stubMux(page);
        await stubMuxStream(page);
        const titles = new Map<string, string>();
        for (const path of TITLED) {
          // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
          await openPublic(page, path);
          await expect(page.locator("html")).toHaveAttribute("lang", lang);
          await expect(page.getByRole("main")).toHaveCount(1);
          await expect(page.getByRole("banner")).toHaveCount(1);
          await expect(page.getByRole("contentinfo")).toHaveCount(1);
          await expect(
            page.getByRole("heading", { level: 1 }),
            path
          ).toHaveCount(1);
          await expect(page.getByRole("link", { name: skip })).toHaveCount(1);
          const title = await page.title();
          expect(title.trim(), path).not.toBe("");
          expect(
            [...titles.values()],
            `${path}: "${title}" repeats`
          ).not.toContain(title);
          titles.set(path, title);
        }
        // Localised: a language's titles are not the Dutch ones.
        if (lang !== "nl") {
          expect(titles.get("/favorites")).not.toMatch(FAVORIETEN);
        }
      } finally {
        await context.close();
      }
    });
  }

  test("live regions exist for toasts and for the result count", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await openPublic(page, "/gestures?q=hond");
      const count = page.getByRole("status").filter({ hasText: GEBAAR });
      await expect(count.first()).toBeVisible();
      // The toast viewport is a named region, present before any toast.
      await expect(
        page.getByRole("region", { name: "Meldingen" })
      ).toBeAttached();
      await page
        .getByRole("searchbox", { name: "Zoek een gebaar" })
        .fill("zzzzqxj");
      await expect(
        page.getByRole("status").filter({ hasText: NO_RESULTS }).first()
      ).toBeAttached();
    } finally {
      await context.close();
    }
  });

  test("form errors are tied to their field with aria-describedby", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await openPublic(page, "/sign-up");
      await page
        .getByRole("textbox", { name: "E-mailadres" })
        .fill("geen-adres");
      await page.getByRole("button", { name: SUBMIT }).first().click();
      const email = page.getByRole("textbox", { name: "E-mailadres" });
      await expect(email).toHaveAttribute("aria-invalid", "true");
      const id = (await email.getAttribute("aria-describedby"))?.split(" ")[0];
      await expect(page.locator(`[id="${id}"]`)).toHaveAttribute(
        "role",
        "alert"
      );
      await expect(page.locator(`[id="${id}"]`)).not.toBeEmpty();
    } finally {
      await context.close();
    }
  });
});
