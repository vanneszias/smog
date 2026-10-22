import { expect, type Page, test } from "@playwright/test";
import { openAdmin, THEMES, type Theme, themedContext, WIDTHS } from "./admin";
import {
  blockingViolations,
  e2eSeed,
  signInWithApi,
  watchErrors,
} from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * Accessibility of the translation screens' interactive states (phase 10b
 * task 4): axe with the cell editor open (and after a refused save), the
 * import dialog with its dry-run diff, the language dialog and the
 * translator's own view. The screens themselves are in `admin-a11y.spec.ts`
 * (ADMIN_PAGES). Read-only except for a rejected save, which writes nothing.
 */

const STRINGS = "/admin/translation/strings";

async function axe(page: Page, where: string): Promise<string[]> {
  return (await blockingViolations(page)).map(
    (violation) => `${where}: ${violation.id} ${violation.nodes.join(" | ")}`
  );
}

async function states(page: Page): Promise<string[]> {
  const found: string[] = [];
  await openAdmin(page, `${STRINGS}?q=kit.stepOf`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page
    .getByRole("button", { name: "Bewerk kit.stepOf in het English" })
    .click();
  await page
    .getByRole("textbox", { name: "Tekst van kit.stepOf in het English" })
    .fill("Step");
  found.push(...(await axe(page, "strings:editor")));
  await page.getByRole("button", { name: "Opslaan" }).click();
  await expect(
    page.getByText("De invulplaatsen moeten gelijk zijn aan de bron", {
      exact: false,
    })
  ).toBeVisible();
  found.push(...(await axe(page, "strings:editor-error")));
  await page.getByRole("button", { name: "Annuleren" }).click();

  await openAdmin(page, STRINGS);
  await page.getByRole("button", { name: "Importeren" }).click();
  const dialog = page.getByRole("dialog", { name: "Teksten importeren" });
  await dialog.getByLabel("Bestand", { exact: true }).setInputFiles({
    buffer: Buffer.from(
      JSON.stringify({
        "auth.errors.generic": "Same text, kept as is",
        "no.such.key": "x",
      })
    ),
    mimeType: "application/json",
    name: "a11y.json",
  });
  await dialog.getByRole("combobox", { name: "Taal van het bestand" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(dialog.getByTestId("import-plan")).toBeVisible();
  found.push(...(await axe(page, "strings:import-plan")));
  await page.keyboard.press("Escape");

  await openAdmin(page, "/admin/translation/languages");
  await page.getByRole("button", { name: "Taal toevoegen" }).click();
  await expect(
    page.getByRole("dialog", { name: "Taal toevoegen" })
  ).toBeVisible();
  found.push(...(await axe(page, "languages:dialog")));
  await page.keyboard.press("Escape");
  return found;
}

test.describe("translation screens' states", () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`have no serious violation (${theme}, ${width} px)`, async ({
        browser,
      }) => {
        test.setTimeout(180_000);
        const context = await themedContext(browser, theme as Theme, width);
        const page = await context.newPage();
        const errors = watchErrors(page);
        try {
          await signInAsAdmin(page.request);
          expect(await states(page)).toEqual([]);
        } finally {
          await context.close();
        }
        expect(errors).toEqual([]);
      });
    }
  }

  test("the translator's own view has none", async ({ page }) => {
    test.setTimeout(120_000);
    const email = await signInWithApi(page);
    await e2eSeed(page.request, [
      { email, op: "grantRole", role: "translator" },
    ]);
    await openAdmin(page, STRINGS);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await axe(page, "translator:strings")).toEqual([]);
  });
});
