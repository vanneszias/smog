import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  newPublicPage,
  openPublic,
  rpc,
  seedAccount,
} from "../../support/e2e/a11y-support";
import { themedContext } from "../../support/e2e/admin";
import {
  signInWithApi,
  stubMux,
  stubMuxStream,
  tabTo,
  waitForApp,
} from "../../support/e2e/helpers";

const MAIN_HASH = /#main$/;
const NOT_DUTCH = /^(en|fr)$/;
const DARK_ITEM = /^(Dark|Sombre)$/;
const SETTINGS_BUTTON = /^(Settings|Paramètres)$/;
const MY_SPACE_URL = /\/my$/;
const KOFFIE_URL = /q=koffie$/;
const KOFFIE = /Koffie/;
const ANYTHING = /.+/;
const NON_BLANK = /\S/;

/*
 * Keyboard-only runs (phase 9 task 5): Tab, Shift+Tab, Enter, Space, Escape
 * and the arrows, no pointer. Every dialog and sheet traps focus, closes on
 * Escape and returns focus to what opened it; focus is always visible.
 */

/** Whether the focused element is inside `container`. */
function focusIsIn(container: Locator): Promise<boolean> {
  return container.evaluate((node) => node.contains(document.activeElement));
}

/** Tabs `times` forward and `times` back: the focus never leaves `container`. */
async function expectTrapped(
  page: Page,
  container: Locator,
  times = 8
): Promise<void> {
  expect(await focusIsIn(container)).toBe(true);
  for (let press = 0; press < times; press += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one key at a time.
    await page.keyboard.press("Tab");
    expect(await focusIsIn(container), `Tab ${press + 1}`).toBe(true);
  }
  for (let press = 0; press < times; press += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one key at a time.
    await page.keyboard.press("Shift+Tab");
    expect(await focusIsIn(container), `Shift+Tab ${press + 1}`).toBe(true);
  }
}

/** Opens with Enter from the opener, traps, closes with Escape, focus is back. */
async function dialogRun(
  page: Page,
  opener: Locator,
  dialog: Locator,
  key: "Enter" | "Space" = "Enter"
): Promise<void> {
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.keyboard.press(key);
  await expect(dialog).toBeVisible();
  await expectTrapped(page, dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
}

test.describe("keyboard: the shell", () => {
  test("the skip link is the first stop and lands on the main landmark", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await openPublic(page, "/gestures");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Naar de inhoud" });
    await expect(skip).toBeFocused();
    // Visible when focused: on screen, not clipped to nothing.
    const box = await skip.boundingBox();
    expect(box?.width).toBeGreaterThan(40);
    expect(box?.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(MAIN_HASH);
    const main = page.locator("main#main");
    await expect(main).toBeFocused();
    // One Tab later the focus is inside the page content, not back in the header.
    await page.keyboard.press("Tab");
    expect(await focusIsIn(main)).toBe(true);
  });

  test("the settings menu (language and theme) works with the keyboard alone", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await openPublic(page, "/");
    const language = page.getByRole("button", { name: "Instellingen" });
    const menu = page.getByRole("menu");
    // The first menu of a cold dev server can lose the key (Vite optimising a
    // dependency reloads the page): focus and press again until it is open,
    // never pressing on an open menu (Enter on its trigger closes it).
    await expect(async () => {
      if (await menu.isVisible()) {
        return;
      }
      await language.focus();
      await page.keyboard.press("Enter");
      await expect(menu).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 30_000 });
    // The arrows move the focus along the items; walk to French (each item
    // carries its own `lang`) and choose it with Enter. A key lost while the
    // menu settles on a slow runner costs one more press, not the wrong item.
    await expect(page.locator('[role^="menuitem"]:focus')).toBeVisible();
    await expect(async () => {
      const focused = await page.evaluate(() =>
        document.activeElement?.getAttribute("lang")
      );
      if (focused !== "fr") {
        await page.keyboard.press("ArrowDown");
      }
      expect(focused).toBe("fr");
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", NOT_DUTCH);
    await expect(menu).toBeHidden();
    const settings = page.getByRole("button", { name: SETTINGS_BUTTON });
    await expect(settings).toBeFocused();

    // The theme radios are in the same menu: Space opens it, Escape closes
    // it and returns the focus.
    await page.keyboard.press("Space");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: DARK_ITEM })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(settings).toBeFocused();
  });

  test("the phone menu sheet opens with Enter, traps focus, and Escape returns it", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 390);
    try {
      await openPublic(page, "/");
      await dialogRun(
        page,
        page.getByRole("button", { name: "Menu openen" }),
        page.getByRole("dialog")
      );
      // A link in the sheet is reached and followed by keyboard.
      await page.getByRole("button", { name: "Menu openen" }).focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByRole("dialog");
      await sheet.getByRole("link", { name: "Mijn ruimte" }).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(MY_SPACE_URL);
      await expect(sheet).toBeHidden();
    } finally {
      await context.close();
    }
  });
});

test.describe("keyboard: signed in", () => {
  test("search, open a result, favorite it and save it to a list", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { context, page } = await newPublicPage(browser, "light", 1280);
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const fixture = await seedAccount(page);
      ({ cleanup } = fixture);
      // Start with an unfavorited gesture the fixture does not hold.
      await openPublic(page, "/gestures");
      const field = page.getByRole("searchbox", { name: "Zoek een gebaar" });
      await field.focus();
      await page.keyboard.type("koffie");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(KOFFIE_URL);
      const result = page
        .getByRole("main")
        .getByRole("link", { name: KOFFIE })
        .first();
      await tabTo(page, result, 60);
      await page.keyboard.press("Enter");
      // At this width the gesture opens in the page's detail panel.
      const save = page.getByRole("button", { name: "Opslaan in lijst" });
      await expect(save).toBeVisible();
      await waitForApp(page);

      // The next stop after the result is its heart.
      const heart = page
        .getByRole("main")
        .getByRole("button", { exact: true, name: "Favoriet" })
        .first();
      await result.focus();
      await page.keyboard.press("Tab");
      await expect(heart).toBeFocused();
      await expect(heart).toHaveAttribute("aria-pressed", "false");
      await page.keyboard.press("Space");
      await expect(heart).toHaveAttribute("aria-pressed", "true");

      await tabTo(page, save, 60);
      await page.keyboard.press("Enter");
      const picker = page.getByRole("dialog", { name: "Opslaan in lijst" });
      await expect(picker).toBeVisible();
      await expectTrapped(page, picker, 6);
      const option = picker.getByRole("checkbox", { name: fixture.listName });
      await option.focus();
      await page.keyboard.press("Space");
      await expect(option).toBeChecked();
      const toast = page.getByText(`Toegevoegd aan “${fixture.listName}”`, {
        exact: true,
      });
      await expect(toast).toBeVisible();
      // The toast is the topmost layer: the first Escape dismisses it, the
      // second closes the dialog (Radix's layer stack). The second waits for
      // the first to have taken effect: a key pressed while the toast is
      // still leaving goes to the toast, not the dialog (headless shell).
      await page.keyboard.press("Escape");
      await expect(toast).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(picker).toBeHidden();
      await expect(save).toBeFocused();
      await rpc(page.request, "favorites/remove", {
        gestureId: (
          await rpc<{ id: string }>(page.request, "gestures/bySlug", {
            slug: "koffie",
          })
        ).id,
      });
    } finally {
      await cleanup?.().catch(() => undefined);
      await context.close();
    }
  });

  test("a list is reordered by keyboard and the move is announced", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { context, page } = await newPublicPage(browser, "light", 1280);
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const fixture = await seedAccount(page);
      ({ cleanup } = fixture);
      await openPublic(page, `/lists?id=${fixture.listId}`);
      const detail = page.getByRole("region", { name: fixture.listName });
      const links = detail.getByRole("listitem").getByRole("link");
      await expect(links).toHaveText(["Hond", "Kat", "Paard"]);
      const handle = detail.getByRole("button", {
        name: "Slepen om de volgorde te wijzigen: Hond",
      });
      await handle.focus();
      // The instructions are attached to the handle for screen readers.
      await expect(handle).toHaveAttribute("aria-describedby", ANYTHING);
      await page.keyboard.press("Space");
      await expect(handle).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("ArrowDown");
      const live = page.locator("[aria-live]").filter({
        hasText: "Hond verplaatst naar positie 2 van 3.",
      });
      await expect(live.first()).toBeAttached();
      await page.keyboard.press("Space");
      await expect(links).toHaveText(["Kat", "Hond", "Paard"]);
      // The row menu is the second way: no dragging at all.
      const menu = detail.getByRole("button", { name: "Acties voor Paard" });
      await menu.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: "Naar boven" }).focus();
      await page.keyboard.press("Enter");
      await expect(links).toHaveText(["Kat", "Paard", "Hond"]);
    } finally {
      await cleanup?.().catch(() => undefined);
      await context.close();
    }
  });

  test("every list dialog and sheet traps focus and returns it to its opener", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { context, page } = await newPublicPage(browser, "light", 1280);
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const fixture = await seedAccount(page);
      ({ cleanup } = fixture);
      await openPublic(page, "/lists");
      const create = page.getByRole("button", { name: "Nieuwe lijst" }).first();
      await dialogRun(
        page,
        create,
        page.getByRole("dialog", { name: "Nieuwe lijst" })
      );

      await openPublic(page, `/lists?id=${fixture.listId}`);
      const detail = page.getByRole("region", { name: fixture.listName });
      await dialogRun(
        page,
        detail.getByRole("button", { name: "Delen" }),
        page.getByRole("dialog", { name: "Lijst delen" })
      );

      // Menu item -> dialog: Escape returns to the menu's button.
      const actions = detail.getByRole("button", {
        name: "Acties voor de lijst",
      });
      await actions.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: "Naam wijzigen" }).focus();
      await page.keyboard.press("Enter");
      const rename = page.getByRole("dialog", { name: "Lijst bewerken" });
      await expect(rename).toBeVisible();
      await expectTrapped(page, rename, 6);
      await page.keyboard.press("Escape");
      await expect(rename).toBeHidden();
      await expect(actions).toBeFocused();

      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: "Lijst verwijderen" }).focus();
      await page.keyboard.press("Enter");
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toBeVisible();
      await expectTrapped(page, confirm, 6);
      await page.keyboard.press("Escape");
      await expect(confirm).toBeHidden();
      await expect(actions).toBeFocused();

      // The edit link's "add gestures" sheet, for another signed-in user.
      const other = await themedContext(browser, "light", 1280);
      try {
        const editor = await other.newPage();
        await stubMux(editor);
        await stubMuxStream(editor);
        await signInWithApi(editor);
        await openPublic(editor, fixture.editPath);
        await dialogRun(
          editor,
          editor.getByRole("button", { name: "Gebaren toevoegen" }),
          editor.getByRole("dialog")
        );
      } finally {
        await other.close();
      }
    } finally {
      await cleanup?.().catch(() => undefined);
      await context.close();
    }
  });

  test("the account's delete dialog traps focus and returns it", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await signInWithApi(page);
      await openPublic(page, "/account?section=privacy");
      await dialogRun(
        page,
        page.getByRole("button", { name: "Mijn account verwijderen" }),
        page.getByRole("alertdialog")
      );
      // The user menu: Enter opens, Escape closes and returns.
      const menuButton = page.getByRole("button", { name: "Accountmenu" });
      await menuButton.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toBeHidden();
      await expect(menuButton).toBeFocused();
    } finally {
      await context.close();
    }
  });
});

test.describe("keyboard: guests", () => {
  test("the guest's save-to-list prompt and the QR dialog return focus", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await openPublic(page, "/gestures/hond");
      await dialogRun(
        page,
        page.getByRole("button", { name: "Opslaan in lijst" }),
        // Not the Mux player's own (error) dialog.
        page.locator('div[role="dialog"]')
      );
      const actions = page.getByRole("button", { name: "QR-code" });
      await actions.focus();
      await page.keyboard.press("Enter");
      const qr = page.locator('div[role="dialog"]');
      await expect(qr).toBeVisible();
      await expectTrapped(page, qr, 6);
      await page.keyboard.press("Escape");
      await expect(qr).toBeHidden();
      await expect(actions).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test("the consent banner is reached and answered by keyboard", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280, {
      consent: false,
    });
    try {
      await page.goto("/privacy");
      await waitForApp(page);
      const banner = page.getByRole("region", { name: "Help SMOG verbeteren" });
      await expect(banner).toBeVisible();
      const decline = banner.getByRole("button", {
        name: "Alleen noodzakelijke",
      });
      await tabTo(page, decline, 60);
      await page.keyboard.press("Enter");
      await expect(banner).toBeHidden();
    } finally {
      await context.close();
    }
  });
});

test.describe("keyboard: sign-in", () => {
  test("a failed submit names the problem, ties it to the field and focuses it", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await openPublic(page, "/sign-in");
      const email = page.getByRole("textbox", { name: "E-mailadres" });
      await email.focus();
      await page.keyboard.type("geen-adres");
      await page.keyboard.press("Enter");
      const error = page
        .getByRole("alert")
        .filter({ hasText: NON_BLANK })
        .first();
      await expect(error).toBeVisible();
      await expect(email).toHaveAttribute("aria-invalid", "true");
      const describedBy = await email.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const described = page.locator(`[id="${describedBy?.split(" ")[0]}"]`);
      await expect(described).toHaveText(await error.innerText());
      // The failure leaves the focus on the field to correct, not on the page top.
      await expect(email).toBeFocused();
      // A second identical failure brings the focus back as well.
      await page.getByRole("button", { name: "Doorgaan" }).first().focus();
      await page.keyboard.press("Enter");
      await expect(email).toBeFocused();
    } finally {
      await context.close();
    }
  });
});

test.describe("keyboard: the sponsor cards", () => {
  test("a card toggles with Space and Enter, and by a click on its corner tick", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 390);
    try {
      await openPublic(page, "/sponsor");
      const card = page.getByRole("button", { exact: true, name: "Appel" });
      await expect(card).toHaveAttribute("data-state", "available");
      await card.focus();
      await page.keyboard.press("Space");
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Enter");
      await expect(card).toHaveAttribute("aria-pressed", "false");
      // The tick is painted over the button: a click on it still toggles.
      const box = await page.locator("li", { has: card }).boundingBox();
      await page.mouse.click(
        (box?.x ?? 0) + (box?.width ?? 0) - 20,
        (box?.y ?? 0) + 20
      );
      await expect(card).toHaveAttribute("aria-pressed", "true");
    } finally {
      await context.close();
    }
  });
});

test.describe("keyboard: focus is always visible", () => {
  /**
   * The ring: a 2 px shadow (offset 2 px) on the focused control, in the
   * `ring` colour, or in `sidebar-ring` (white) on the green header.
   */
  async function expectRing(
    page: Page,
    control: Locator,
    tokenName = "ring"
  ): Promise<void> {
    await control.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    const ring = await control.evaluate((node, name) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--color-${name})`;
      document.body.append(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(node);
      return {
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        shadow: style.boxShadow,
        token,
      };
    }, tokenName);
    const ringed =
      ring.shadow.includes(ring.token) &&
      ring.shadow.includes("0px 0px 0px 4px");
    const outlined =
      ring.outline.startsWith("solid") && ring.outline.endsWith("2px");
    expect(ringed || outlined, JSON.stringify(ring)).toBe(true);
  }

  test("a sample of controls shows the 2 px ring, in both themes", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await openPublic(page, "/sign-in");
      for (const theme of ["light", "dark"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one theme after the other.
        await page.evaluate((dark) => {
          document.documentElement.classList.toggle("dark", dark);
        }, theme === "dark");
        // The header is the green surface: its controls ring in `sidebar-ring`.
        for (const control of [
          page.getByRole("link", { name: "Gebaren" }).first(),
          page.getByRole("button", { name: "Zoeken" }).first(),
        ]) {
          // biome-ignore lint/performance/noAwaitInLoops: one control at a time.
          await expectRing(page, control, "sidebar-ring");
        }
        for (const control of [
          page.getByRole("textbox", { name: "E-mailadres" }),
          page.getByRole("button", { name: "Doorgaan" }).first(),
        ]) {
          // biome-ignore lint/performance/noAwaitInLoops: one control at a time.
          await expectRing(page, control);
        }
      }
    } finally {
      await context.close();
    }
  });

  test("the sponsor wizard's sticky selection bar keeps its ring and stays reachable", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await newPublicPage(browser, "light", 390);
    try {
      await openPublic(page, "/sponsor?gesture=blij");
      const bar = page.getByRole("button", { exact: true, name: "Doorgaan" });
      await expect(bar).toBeEnabled();
      await expectRing(page, bar);
      // Sticky: the focused control is on screen, not hidden under the bar or the header.
      const box = await bar.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect((box?.y ?? -1) + (box?.height ?? 0)).toBeLessThanOrEqual(
        viewport?.height ?? 0
      );
    } finally {
      await context.close();
    }
  });
});
