import { expect, type Page, test } from "@playwright/test";
import {
  ADMIN_PAGES,
  adminRpc,
  hondId,
  openAdmin,
  stubMuxMedia,
  THEMES,
  themedContext,
  WIDTHS,
} from "./admin";
import { blockingViolations, e2eSeed, watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * Admin accessibility (phase 5 task 7): axe on every admin screen and its
 * dialogs and sheets, light and dark, at 390 and 1280 px, with no serious
 * or critical violation; then keyboard-only runs of the main flows, where
 * every dialog and sheet returns focus to what opened it. Read-only except
 * for the table editor run, which edits a hidden gesture of its own and
 * deletes it again.
 */

const SEED_ADMIN_EMAIL = "admin@smog.test";
/** The seeded admin's name: the users panel is named after the account. */
const SEED_ADMIN_NAME = "SMOG Admin";
const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
/** The Mux player's own console noise when the (stubbed) stream is empty. */
const PLAYER_NOISE = /mux-player|getErrorFromHlsErrorData|net::ERR_FAILED/;
/** Chromium refusing scripts in the sandboxed email preview (the point). */
const SANDBOX_BLOCKED =
  /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/;

interface Violation {
  id: string;
  nodes: string[];
  where: string;
}

/** Runs axe and labels each violation with the screen it was found on. */
async function axe(page: Page, where: string): Promise<Violation[]> {
  return (await blockingViolations(page)).map((violation) => ({
    ...violation,
    where,
  }));
}

/** The screen's `h1` is there (the data view rendered, not its skeleton). */
async function settled(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** Every admin screen, then its overlays, in one theme at one width. */
async function auditScreens(page: Page, width: number): Promise<Violation[]> {
  const found: Violation[] = [];
  for (const [name, path] of ADMIN_PAGES) {
    // biome-ignore lint/performance/noAwaitInLoops: one screen at a time.
    await openAdmin(page, path);
    await settled(page);
    found.push(...(await axe(page, name)));
  }

  await openAdmin(page, `/admin/gestures/${await hondId(page.request)}`);
  await settled(page);
  found.push(...(await axe(page, "gesture-editor")));
  await page.getByRole("tab", { name: "Bestaande kiezen" }).click();
  found.push(...(await axe(page, "gesture-editor:picker")));

  if (width < 768) {
    await page.getByRole("button", { name: "Beheermenu openen" }).click();
    await expect(page.getByRole("dialog", { name: "Beheer" })).toBeVisible();
    found.push(...(await axe(page, "rail-sheet")));
    await page.keyboard.press("Escape");
  }

  await openAdmin(page, "/admin/audit");
  await settled(page);
  await page
    .getByRole("table", { name: "Logboek" })
    .locator("tbody tr")
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  found.push(...(await axe(page, "audit:detail")));
  await page.keyboard.press("Escape");

  await openAdmin(page, "/admin/gestures?q=hond");
  await page.getByRole("button", { name: "Acties voor Hond" }).click();
  await page.getByRole("menuitem", { name: "QR-code" }).click();
  await expect(
    page.getByRole("dialog", { name: "QR-code voor Hond" })
  ).toBeVisible();
  found.push(...(await axe(page, "gestures:qr")));
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: "Hond selecteren" }).click();
  found.push(...(await axe(page, "gestures:bulk-bar")));
  await page.getByRole("button", { name: "Selectie wissen" }).click();
  await page.getByRole("button", { name: "Tabel bewerken" }).click();
  await expect(
    page.getByRole("heading", { name: "Tabeleditor" })
  ).toBeVisible();
  found.push(...(await axe(page, "gestures:table-editor")));

  await openAdmin(page, "/admin/categories");
  await settled(page);
  await page.getByRole("button", { name: "Nieuwe categorie" }).click();
  await expect(
    page.getByRole("dialog", { name: "Nieuwe categorie" })
  ).toBeVisible();
  found.push(...(await axe(page, "categories:create")));
  await page.keyboard.press("Escape");

  await openAdmin(
    page,
    `/admin/users?q=${encodeURIComponent(SEED_ADMIN_EMAIL)}`
  );
  await page
    .getByRole("table", { name: "Gebruikers" })
    .getByText(SEED_ADMIN_EMAIL)
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: SEED_ADMIN_NAME })
  ).toBeVisible();
  found.push(...(await axe(page, "users:panel")));
  await page.keyboard.press("Escape");

  await openAdmin(page, "/admin/emails?template=auth/otp");
  await settled(page);
  await page.getByRole("tab", { name: "Platte tekst" }).click();
  found.push(...(await axe(page, "emails:text")));
  return found;
}

test.describe("admin accessibility", () => {
  test.beforeAll(async ({ request }) => {
    // The audit log and the dashboard need at least one entry to open.
    await e2eSeed(request, [
      {
        data: { legacy: { note: "a11y" } },
        id: "e2e-a11y",
        op: "legacyAuditEntry",
        targetId: "e2e-a11y",
        targetType: "gesture",
      },
    ]);
  });

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: every admin screen, ${theme} at ${width} px`, async ({
        browser,
      }) => {
        test.setTimeout(240_000);
        const context = await themedContext(browser, theme, width);
        try {
          const page = await context.newPage();
          const errors = watchErrors(page);
          await stubMuxMedia(page);
          await signInAsAdmin(page.request);
          expect(await auditScreens(page, width)).toEqual([]);
          expect(
            errors.filter(
              (line) => !(PLAYER_NOISE.test(line) || SANDBOX_BLOCKED.test(line))
            )
          ).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }
});

test.describe("admin keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await stubMuxMedia(page);
    await signInAsAdmin(page.request);
  });

  test("the rail and its phone sheet, by keyboard; the sheet returns focus", async ({
    page,
  }) => {
    await openAdmin(page, "/admin");
    const rail = page.getByRole("navigation", { name: "Beheer" });
    const logboek = rail.getByRole("link", { name: "Logboek" });
    await logboek.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Logboek");

    await page.setViewportSize({ height: 844, width: 390 });
    const opener = page.getByRole("button", { name: "Beheermenu openen" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Beheer" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("an audit row opens its sheet with Enter; Escape returns focus to the row", async ({
    page,
  }) => {
    await openAdmin(page, "/admin/audit");
    const row = page
      .getByRole("table", { name: "Logboek" })
      .locator("tbody tr")
      .first();
    await row.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Gegevens");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(row).toBeFocused();
  });

  test("the row menu opens the QR dialog by keyboard; Escape returns focus to the menu button", async ({
    page,
  }) => {
    await openAdmin(page, "/admin/gestures?q=hond");
    const menu = page.getByRole("button", { name: "Acties voor Hond" });
    await menu.focus();
    await page.keyboard.press("Enter");
    const qr = page.getByRole("menuitem", { name: "QR-code" });
    await expect(qr).toBeVisible();
    // Arrow keys move through the menu until the QR item has focus.
    for (let step = 0; step < 6; step += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one key at a time.
      if (await qr.evaluate((node) => node === document.activeElement)) {
        break;
      }
      await page.keyboard.press("ArrowDown");
    }
    await expect(qr).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "QR-code voor Hond" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test("the users panel opens with Enter and returns focus to the row", async ({
    page,
  }) => {
    await openAdmin(
      page,
      `/admin/users?q=${encodeURIComponent(SEED_ADMIN_EMAIL)}`
    );
    const row = page
      .getByRole("table", { name: "Gebruikers" })
      .locator("tbody tr")
      .filter({ hasText: SEED_ADMIN_EMAIL })
      .first();
    await row.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", { name: SEED_ADMIN_NAME });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(row).toBeFocused();
  });

  test("the category dialog opens and closes by keyboard, returning focus", async ({
    page,
  }) => {
    await openAdmin(page, "/admin/categories");
    const create = page.getByRole("button", { name: "Nieuwe categorie" });
    await create.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Nieuwe categorie" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Naam" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(create).toBeFocused();
  });

  test("the table editor, keyboard only: edit, review, save", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const word = `zzkb${crypto
      .randomUUID()
      .slice(0, 8)
      .replace(/[^a-z]/g, "q")}`;
    const category = await adminRpc<{ id: string }>(
      page.request,
      "admin/categories/create",
      { name: `Zzcat ${word}`, published: false }
    );
    const gesture = await adminRpc<{ id: string; name: string }>(
      page.request,
      "admin/gestures/create",
      {
        categoryIds: [category.id],
        name: `Zztoets ${word}`,
        playbackId: SAMPLE_PLAYBACK_ID,
        published: false,
      }
    );
    try {
      await openAdmin(page, `/admin/gestures?q=${word}`);
      const start = page.getByRole("button", { name: "Tabel bewerken" });
      await start.focus();
      await page.keyboard.press("Enter");
      const name = page.getByRole("textbox", {
        name: `Naam van ${gesture.name}`,
      });
      await expect(name).toBeVisible();
      // Tab from the editor's heading region into the first editable cell.
      await name.focus();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type(`Zztoets bewerkt ${word}`);
      await page.keyboard.press("Tab");
      const save = page.getByRole("button", { name: "Wijzigingen opslaan" });
      await save.focus();
      await page.keyboard.press("Enter");
      const review = page.getByRole("dialog", {
        name: "Je wijzigingen nakijken",
      });
      await expect(review).toBeVisible();
      // Escape closes the review and hands focus back to its button.
      await page.keyboard.press("Escape");
      await expect(review).toBeHidden();
      await expect(save).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(review).toBeVisible();
      const confirm = review.getByRole("button", {
        name: "Wijzigingen opslaan",
      });
      await confirm.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("1 gebaar opgeslagen.", { exact: true })
      ).toBeVisible();
      const saved = await adminRpc<{ name: string }>(
        page.request,
        "admin/gestures/get",
        { id: gesture.id }
      );
      expect(saved.name).toBe(`Zztoets bewerkt ${word}`);
    } finally {
      const current = await adminRpc<{ name: string }>(
        page.request,
        "admin/gestures/get",
        { id: gesture.id }
      );
      await adminRpc(page.request, "admin/gestures/delete", {
        confirmName: current.name,
        id: gesture.id,
      });
      await adminRpc(page.request, "admin/categories/delete", {
        id: category.id,
      });
    }
  });
});
