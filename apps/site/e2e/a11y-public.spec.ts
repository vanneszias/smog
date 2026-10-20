import { devices, expect, type Page, test } from "@playwright/test";
import {
  byRule,
  closeWithEscape,
  type Finding,
  GUEST_ROUTES,
  newPublicPage,
  openPublic,
  scan,
  scanThemes,
  seedAccount,
} from "./a11y-support";
import { themedContext, WIDTHS } from "./admin";
import {
  signInWithApi,
  stubMux,
  stubMuxStream,
  waitForApp,
  watchErrors,
} from "./helpers";

const PLAYER_NOISE = /mux-player|getErrorFromHlsErrorData/;
const VIDEO_NAME = /^Naam in de video/;
const FULL_NAME = /^Volledige naam/;
const EMAIL = /^E-mail$/;

/*
 * Public accessibility (phase 9 task 5): axe over every public route and
 * state, light and dark at 390 and 1280 px, with no serious or critical
 * violation (and the blocking rules of helpers.ts). One test per width and
 * group: each page is loaded once and scanned in both themes
 * (`scanThemes`), so a failure names where and in which theme it happened.
 * Sponsor token pages are phase 9 task 7's; the web has no offline banner
 * (mobile only, DECISIONS) and the kit's is scanned by `dev-ui.spec.ts`.
 */

const IPHONE = devices["iPhone 15"].userAgent;
const CONSENT = "Help SMOG verbeteren";
const DECLINE = "Alleen noodzakelijke";

function quiet(errors: readonly string[]): string[] {
  // The Mux player's console noise when the (stubbed) stream has no segments.
  return errors.filter((line) => !PLAYER_NOISE.test(line));
}

/** Opens an overlay, scans it in both themes, closes it with Escape. */
async function overlay(
  page: Page,
  found: Finding[],
  where: string,
  open: () => Promise<unknown>,
  visible: () => Promise<unknown>
): Promise<void> {
  await open();
  await visible();
  // A menu is dismissed by axe's own run (it moves the focus): it is opened
  // again for the dark scan, and scanned as a menu (`blockingViolations`).
  const isMenu = (await page.getByRole("menu").count()) > 0;
  found.push(
    ...(await scanThemes(
      page,
      where,
      isMenu ? { menu: { open, visible } } : {}
    ))
  );
  await closeWithEscape(page);
}

test.describe("axe: guest routes", () => {
  for (const width of WIDTHS) {
    test(`every route at ${width} px, light and dark`, async ({ browser }) => {
      test.setTimeout(300_000);
      const { context, page } = await newPublicPage(browser, "light", width);
      try {
        const errors = watchErrors(page);
        const found: Finding[] = [];
        for (const { name, path } of GUEST_ROUTES) {
          const logged = errors.length;
          // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
          await openPublic(page, path);
          found.push(...(await scanThemes(page, name)));
          if (name === "not-found") {
            // The 404 document's own status is what Chromium logs as an error.
            errors.splice(logged);
          }
        }
        expect(byRule(found)).toEqual([]);
        expect(quiet(errors)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("axe: guest overlays and banners", () => {
  for (const width of WIDTHS) {
    test(`header menus, banners and dialogs at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const { context, page } = await newPublicPage(browser, "light", width);
      try {
        const errors = watchErrors(page);
        const found: Finding[] = [];
        await openPublic(page, "/gestures/hond");

        if (width < 768) {
          await overlay(
            page,
            found,
            "header:menu-sheet",
            () => page.getByRole("button", { name: "Menu openen" }).click(),
            () => expect(page.getByRole("dialog")).toBeVisible()
          );
        } else {
          await overlay(
            page,
            found,
            "header:language-menu",
            () => page.getByRole("button", { name: "Taal wijzigen" }).click(),
            () => expect(page.getByRole("menu")).toBeVisible()
          );
          await overlay(
            page,
            found,
            "header:theme-menu",
            () => page.getByRole("button", { name: "Thema wijzigen" }).click(),
            () => expect(page.getByRole("menu")).toBeVisible()
          );
        }
        await overlay(
          page,
          found,
          "gesture:actions-menu",
          () => page.getByRole("button", { name: "Acties voor Hond" }).click(),
          () => expect(page.getByRole("menu")).toBeVisible()
        );
        await overlay(
          page,
          found,
          "gesture:save-to-list-sign-in",
          () => page.getByRole("button", { name: "Opslaan in lijst" }).click(),
          () => expect(page.getByRole("dialog")).toBeVisible()
        );

        // The QR dialog (a lazy file of phase 9 task 6: findings go to the controller).
        await page.getByRole("button", { name: "Acties voor Hond" }).click();
        await overlay(
          page,
          found,
          "gesture:qr-dialog",
          () => page.getByRole("menuitem", { name: "QR-code" }).click(),
          () => expect(page.getByRole("dialog")).toBeVisible()
        );

        // A toast: the guest's favorite.
        await page
          .getByRole("main")
          .getByRole("button", { exact: true, name: "Favoriet" })
          .first()
          .click();
        found.push(...(await scanThemes(page, "gesture:favorited")));

        expect(byRule(found)).toEqual([]);
        expect(quiet(errors)).toEqual([]);
      } finally {
        await context.close();
      }
    });

    test(`the consent banner at ${width} px`, async ({ browser }) => {
      const { context, page } = await newPublicPage(browser, "light", width, {
        consent: false,
      });
      try {
        const found: Finding[] = [];
        await page.goto("/");
        await waitForApp(page);
        await expect(page.getByRole("region", { name: CONSENT })).toBeVisible();
        found.push(...(await scanThemes(page, "consent-banner:home")));
        await page.goto("/privacy");
        await waitForApp(page);
        await expect(page.getByRole("region", { name: CONSENT })).toBeVisible();
        found.push(...(await scanThemes(page, "consent-banner:privacy")));
        expect(byRule(found)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }

  test("the app banner and the open-in-app banner on a phone", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: "light",
      hasTouch: true,
      isMobile: true,
      locale: "nl-BE",
      reducedMotion: "reduce",
      userAgent: IPHONE,
      viewport: { height: 844, width: 390 },
    });
    try {
      const page = await context.newPage();
      await stubMux(page);
      await stubMuxStream(page);
      const found: Finding[] = [];
      await page.goto("/");
      await waitForApp(page);
      await page.getByRole("button", { name: DECLINE }).click();
      await expect(
        page.getByRole("region", {
          name: "SMOG is nu beschikbaar op je telefoon!",
        })
      ).toBeVisible();
      found.push(...(await scanThemes(page, "app-banner")));
      await page.goto("/gestures/hond");
      await waitForApp(page);
      await expect(
        page.getByRole("link", { name: "Open in de app" })
      ).toBeVisible();
      found.push(...(await scanThemes(page, "open-in-app-banner")));
      expect(byRule(found)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("the guest import sheet after sign-in", async ({ browser }) => {
    const { context, page } = await newPublicPage(browser, "light", 390, {
      consent: false,
    });
    try {
      await page.addInitScript(() => {
        localStorage.setItem(
          "smog:guest:v1",
          JSON.stringify({
            consent: { analytics: false, decidedAt: Date.now() },
            favorites: ["e2e-unknown-gesture"],
            lists: [],
            preferences: {
              importDismissedFor: [],
              locale: null,
              theme: "system",
            },
            recentSearches: [],
            version: 2,
          })
        );
      });
      await signInWithApi(page);
      await page.goto("/");
      await waitForApp(page);
      await expect(
        page.getByRole("dialog", { name: "Je gegevens meenemen?" })
      ).toBeVisible();
      const found = await scanThemes(page, "guest-import-sheet");
      expect(byRule(found)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

test("the axe helper is not blind: a button without a name is found", async ({
  page,
}) => {
  await page.setContent(
    '<!doctype html><html lang="nl"><title>t</title><main><h1>t</h1><button type="button"></button></main></html>'
  );
  const found = await scan(page, "self-test");
  expect(found.map((finding) => finding.id)).toContain("button-name");
});

test.describe("axe: the error boundary", () => {
  for (const width of WIDTHS) {
    test(`a failed page load at ${width} px`, async ({ browser }) => {
      const { context, page } = await newPublicPage(browser, "light", width);
      try {
        await openPublic(page, "/");
        // The client-side navigation's loader fails: the route's error state.
        await page.route("**/api/rpc/**", (route) => route.abort());
        await page
          .getByRole("link", { name: "Gebaren" })
          .first()
          .click()
          .catch(() =>
            page.getByRole("link", { name: "Gebaren" }).first().click()
          );
        await expect(
          page.getByRole("heading", { name: "Er ging iets mis" })
        ).toBeVisible();
        const found = await scanThemes(page, "error-boundary");
        expect(byRule(found)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("axe: sponsor wizard steps", () => {
  for (const width of WIDTHS) {
    test(`steps 1 to 3 at ${width} px`, async ({ browser }) => {
      test.setTimeout(300_000);
      const { context, page } = await newPublicPage(browser, "light", width);
      try {
        const found: Finding[] = [];
        await openPublic(page, "/sponsor?gesture=blij");
        found.push(...(await scanThemes(page, "sponsor:1-select")));
        await page
          .getByRole("button", { exact: true, name: "Doorgaan" })
          .click();
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Configureer je sponsoring",
          })
        ).toBeVisible();
        found.push(...(await scanThemes(page, "sponsor:2-details")));
        // The errors the form shows on an empty submit.
        await page
          .getByRole("button", { name: "Doorgaan naar voorbeeld" })
          .click();
        found.push(...(await scanThemes(page, "sponsor:2-details-errors")));
        await page.getByLabel(VIDEO_NAME).fill("Bakkerij Jansen");
        await page.getByLabel(FULL_NAME).fill("Jan Jansen");
        await page.getByLabel(EMAIL).fill("a11y-sponsor@example.test");
        await page
          .getByRole("button", { name: "Doorgaan naar voorbeeld" })
          .click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Bekijk je sponsoring" })
        ).toBeVisible();
        await page.waitForLoadState("networkidle");
        found.push(...(await scanThemes(page, "sponsor:3-review")));
        expect(byRule(found)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("axe: signed in", () => {
  for (const width of WIDTHS) {
    test(`favorites, lists, shared lists and account at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const { context, page } = await newPublicPage(browser, "light", width);
      let cleanup: (() => Promise<void>) | undefined;
      const visitors = [] as { close: () => Promise<void> }[];
      try {
        const errors = watchErrors(page);
        const found: Finding[] = [];
        await signInWithApi(page);
        for (const path of ["/favorites", "/lists", "/account"]) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
          await openPublic(page, path);
          found.push(...(await scanThemes(page, `${path} (empty)`)));
        }
        await overlay(
          page,
          found,
          "header:user-menu",
          () => page.getByRole("button", { name: "Accountmenu" }).click(),
          () => expect(page.getByRole("menu")).toBeVisible()
        );
        await page
          .getByRole("button", { name: "Mijn account verwijderen" })
          .click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        found.push(...(await scanThemes(page, "account:delete-dialog")));
        await page.getByLabel("Typ DELETE om te bevestigen").fill("DELETE");
        found.push(...(await scanThemes(page, "account:delete-dialog-ready")));
        await closeWithEscape(page);

        const fixture = await seedAccount(page);
        ({ cleanup } = fixture);
        for (const [name, path] of [
          ["favorites", "/favorites"],
          ["lists", "/lists"],
          ["list", `/lists?id=${fixture.listId}`],
        ] as const) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
          await openPublic(page, path);
          found.push(...(await scanThemes(page, `${name} (with items)`)));
        }

        // The list's own overlays.
        const detail = page.getByRole("region", { name: fixture.listName });
        await overlay(
          page,
          found,
          "list:actions-menu",
          () =>
            detail
              .getByRole("button", { name: "Acties voor de lijst" })
              .click(),
          () => expect(page.getByRole("menu")).toBeVisible()
        );
        await overlay(
          page,
          found,
          "list:item-menu",
          () =>
            detail.getByRole("button", { name: "Acties voor Hond" }).click(),
          () => expect(page.getByRole("menu")).toBeVisible()
        );
        await detail
          .getByRole("button", { name: "Acties voor de lijst" })
          .click();
        await page.getByRole("menuitem", { name: "Naam wijzigen" }).click();
        await expect(
          page.getByRole("dialog", { name: "Lijst bewerken" })
        ).toBeVisible();
        found.push(...(await scanThemes(page, "list:rename-dialog")));
        await closeWithEscape(page);
        await detail
          .getByRole("button", { name: "Acties voor de lijst" })
          .click();
        await page.getByRole("menuitem", { name: "Lijst verwijderen" }).click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        found.push(...(await scanThemes(page, "list:delete-dialog")));
        await closeWithEscape(page);
        await overlay(
          page,
          found,
          "list:share-sheet",
          () => detail.getByRole("button", { name: "Delen" }).click(),
          () =>
            expect(
              page.getByRole("dialog", { name: "Lijst delen" })
            ).toBeVisible()
        );

        // Save to list on a gesture page, and its toast.
        await openPublic(page, "/gestures/hond");
        await page.getByRole("button", { name: "Opslaan in lijst" }).click();
        const picker = page.getByRole("dialog", { name: "Opslaan in lijst" });
        await expect(picker).toBeVisible();
        found.push(...(await scanThemes(page, "gesture:save-to-list")));
        await picker.getByRole("checkbox", { name: fixture.listName }).click();
        await expect(
          page.getByText(`Verwijderd uit “${fixture.listName}”`, {
            exact: true,
          })
        ).toBeVisible();
        found.push(...(await scanThemes(page, "gesture:save-to-list-toast")));
        // The toast is the topmost layer: the first Escape dismisses it, the
        // second closes the dialog (Radix's layer stack).
        await page.keyboard.press("Escape");
        await expect(
          page.getByText(`Verwijderd uit “${fixture.listName}”`, {
            exact: true,
          })
        ).toBeHidden();
        await closeWithEscape(page);

        // Shared lists: the view link (a guest) and the edit link (another user).
        const guest = await themedContext(browser, "light", width);
        visitors.push(guest);
        const viewer = await guest.newPage();
        await stubMux(viewer);
        await stubMuxStream(viewer);
        await openPublic(viewer, fixture.viewPath);
        found.push(...(await scanThemes(viewer, "shared-list:view")));
        const other = await themedContext(browser, "light", width);
        visitors.push(other);
        const editor = await other.newPage();
        await stubMux(editor);
        await stubMuxStream(editor);
        await signInWithApi(editor);
        await openPublic(editor, fixture.editPath);
        found.push(...(await scanThemes(editor, "shared-list:edit")));
        await overlay(
          editor,
          found,
          "shared-list:add-sheet",
          () =>
            editor.getByRole("button", { name: "Gebaren toevoegen" }).click(),
          () => expect(editor.getByRole("dialog")).toBeVisible()
        );
        // A signed-out visitor of an edit link is asked to sign in.
        const stranger = await guest.newPage();
        await stubMux(stranger);
        await stubMuxStream(stranger);
        await openPublic(stranger, fixture.editPath);
        found.push(
          ...(await scanThemes(stranger, "shared-list:edit-signed-out"))
        );

        // A revoked or unknown token: the list's 404 state.
        await openPublic(viewer, "/lists/e2eUnknownShareToken0123456789abcdef");
        found.push(...(await scanThemes(viewer, "shared-list:not-found")));

        expect(byRule(found)).toEqual([]);
        expect(quiet(errors)).toEqual([]);
      } finally {
        await cleanup?.().catch(() => undefined);
        for (const visitor of visitors) {
          // biome-ignore lint/performance/noAwaitInLoops: two contexts.
          await visitor.close();
        }
        await context.close();
      }
    });
  }
});

test.describe("axe: sampled hover, focus and disabled states", () => {
  test("a hovered and a focused control keep their contrast, in both themes", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      const found: Finding[] = [];
      await openPublic(page, "/sign-in");
      const primary = page.getByRole("button", { name: "Doorgaan" }).first();
      await primary.hover();
      found.push(...(await scanThemes(page, "hover:primary-button")));
      await page.getByRole("link", { name: "Favorieten" }).first().hover();
      found.push(...(await scanThemes(page, "hover:nav-link")));
      await page.getByRole("link", { name: "Gebaren" }).first().focus();
      found.push(...(await scanThemes(page, "focus:nav-link")));
      // Disabled: the sponsor wizard's "Doorgaan" before a gesture is chosen.
      await openPublic(page, "/sponsor");
      await expect(
        page.getByRole("button", { exact: true, name: "Doorgaan" })
      ).toBeDisabled();
      found.push(...(await scanThemes(page, "disabled:sponsor-continue")));
      expect(byRule(found)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
