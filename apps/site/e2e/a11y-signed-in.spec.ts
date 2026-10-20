import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  boundedContext,
  byRule,
  closeWithEscape,
  type Finding,
  type Fixture,
  newPublicPage,
  openPublic,
  overlay,
  quiet,
  STATES_MS,
  scanThemes,
  seedAccount,
} from "./a11y-support";
import { WIDTHS } from "./admin";
import { signInWithApi, stubMux, stubMuxStream, watchErrors } from "./helpers";

/*
 * Signed-in accessibility (phase 9 task 5): axe over the signed-in pages,
 * a list, the shared lists and their overlays, light and dark at 390 and
 * 1280 px, one test per state (a hang or a finding names its state).
 */

/**
 * A signed-in user at `width` (a new account, as every spec's), with the
 * fixture's favorites and shared list when `seed` is set (removed again at
 * the end), and its own tab's console errors checked.
 */
async function signedIn(
  browser: Browser,
  width: number,
  body: (page: Page, found: Finding[], fixture: Fixture) => Promise<void>,
  { seed = true }: { seed?: boolean } = {}
): Promise<void> {
  const { context, page } = await newPublicPage(browser, "light", width);
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const errors = watchErrors(page);
    const found: Finding[] = [];
    let fixture: Fixture | undefined;
    if (seed) {
      fixture = await seedAccount(page);
      ({ cleanup } = fixture);
    } else {
      await signInWithApi(page);
    }
    await body(page, found, fixture as Fixture);
    expect(byRule(found)).toEqual([]);
    expect(quiet(errors)).toEqual([]);
  } finally {
    await cleanup?.().catch(() => undefined);
    await context.close();
  }
}

/** Another visitor's page at `width`, in the signed-in test's browser. */
async function visitorPage(
  browser: Browser,
  width: number,
  { signedInUser = false }: { signedInUser?: boolean } = {}
) {
  const context = await boundedContext(browser, "light", width);
  const page = await context.newPage();
  await stubMux(page);
  await stubMuxStream(page);
  if (signedInUser) {
    await signInWithApi(page);
  }
  return { context, page };
}

test.describe("axe: signed in", () => {
  for (const width of WIDTHS) {
    test(`the empty favorites, lists and account at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(STATES_MS);
      await signedIn(
        browser,
        width,
        async (page, found) => {
          for (const path of ["/favorites", "/lists", "/account"]) {
            // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
            await openPublic(page, path);
            found.push(...(await scanThemes(page, `${path} (empty)`)));
          }
        },
        { seed: false }
      );
    });

    test(`the user menu and the account's delete dialog at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(STATES_MS);
      await signedIn(
        browser,
        width,
        async (page, found) => {
          await openPublic(page, "/account");
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
          found.push(
            ...(await scanThemes(page, "account:delete-dialog-ready"))
          );
          await closeWithEscape(page);
        },
        { seed: false }
      );
    });

    test(`favorites, lists and a list with items at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(STATES_MS);
      await signedIn(browser, width, async (page, found, fixture) => {
        for (const [name, path] of [
          ["favorites", "/favorites"],
          ["lists", "/lists"],
          ["list", `/lists?id=${fixture.listId}`],
        ] as const) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
          await openPublic(page, path);
          found.push(...(await scanThemes(page, `${name} (with items)`)));
        }
      });
    });

    test(`a list's menus and dialogs at ${width} px`, async ({ browser }) => {
      test.setTimeout(STATES_MS);
      await signedIn(browser, width, async (page, found, fixture) => {
        await openPublic(page, `/lists?id=${fixture.listId}`);
        const detail = page.getByRole("region", { name: fixture.listName });
        const listActions = detail.getByRole("button", {
          name: "Acties voor de lijst",
        });
        await overlay(
          page,
          found,
          "list:actions-menu",
          () => listActions.click(),
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
        await listActions.click();
        await page.getByRole("menuitem", { name: "Naam wijzigen" }).click();
        await expect(
          page.getByRole("dialog", { name: "Lijst bewerken" })
        ).toBeVisible();
        found.push(...(await scanThemes(page, "list:rename-dialog")));
        await closeWithEscape(page);
        await listActions.click();
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
      });
    });

    test(`save to list on a gesture page, and its toast at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(STATES_MS);
      await signedIn(browser, width, async (page, found, fixture) => {
        await openPublic(page, "/gestures/hond");
        await page.getByRole("button", { name: "Opslaan in lijst" }).click();
        const picker = page.getByRole("dialog", { name: "Opslaan in lijst" });
        await expect(picker).toBeVisible();
        found.push(...(await scanThemes(page, "gesture:save-to-list")));
        await picker.getByRole("checkbox", { name: fixture.listName }).click();
        const toast = page.getByText(`Verwijderd uit “${fixture.listName}”`, {
          exact: true,
        });
        await expect(toast).toBeVisible();
        found.push(...(await scanThemes(page, "gesture:save-to-list-toast")));
        // The toast is the topmost layer: the first Escape dismisses it, the
        // second closes the dialog (Radix's layer stack).
        await page.keyboard.press("Escape");
        await expect(toast).toBeHidden();
        await closeWithEscape(page);
      });
    });

    // Shared lists: the view link (a guest) and the edit link (another user).
    test(`a shared list: the view link and the edit link at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(STATES_MS);
      await signedIn(browser, width, async (_page, found, fixture) => {
        const guest = await visitorPage(browser, width);
        const other = await visitorPage(browser, width, {
          signedInUser: true,
        });
        try {
          await openPublic(guest.page, fixture.viewPath);
          found.push(...(await scanThemes(guest.page, "shared-list:view")));
          await openPublic(other.page, fixture.editPath);
          found.push(...(await scanThemes(other.page, "shared-list:edit")));
          await overlay(
            other.page,
            found,
            "shared-list:add-sheet",
            () =>
              other.page
                .getByRole("button", { name: "Gebaren toevoegen" })
                .click(),
            () => expect(other.page.getByRole("dialog")).toBeVisible()
          );
        } finally {
          await guest.context.close();
          await other.context.close();
        }
      });
    });

    test(`a shared list: signed out, and a revoked link at ${width} px`, async ({
      browser,
    }) => {
      test.setTimeout(STATES_MS);
      await signedIn(browser, width, async (_page, found, fixture) => {
        const guest = await visitorPage(browser, width);
        try {
          // A signed-out visitor of an edit link is asked to sign in.
          await openPublic(guest.page, fixture.editPath);
          found.push(
            ...(await scanThemes(guest.page, "shared-list:edit-signed-out"))
          );
          // A revoked or unknown token: the list's 404 state.
          await openPublic(
            guest.page,
            "/lists/e2eUnknownShareToken0123456789abcdef"
          );
          found.push(
            ...(await scanThemes(guest.page, "shared-list:not-found"))
          );
        } finally {
          await guest.context.close();
        }
      });
    });
  }
});
