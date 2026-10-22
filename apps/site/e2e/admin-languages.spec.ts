import { type APIRequestContext, expect, test } from "@playwright/test";
import { adminRpc, openAdmin } from "./admin";
import { watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The language screen (phase 10b task 4, admin only), in the serial project:
 * an added language shows in the language menu's data and as a column of
 * the strings table, and the spec removes it from every menu again by
 * disabling it (a language is never deleted: its translations stay). A
 * language the spec added before stays and is only enabled and disabled.
 */

const CODE = "pt-BR";
const NAME = "Português (Brasil)";
const LANGUAGES = "/admin/translation/languages";
const NAME_ROW = new RegExp(NAME);
const DUTCH_ROW = /Nederlands/;

interface LanguageRow {
  code: string;
  enabled: boolean;
}

async function disable(request: APIRequestContext): Promise<void> {
  const { items } = await adminRpc<{ items: LanguageRow[] }>(
    request,
    "translation/languages/list"
  );
  if (items.some((row) => row.code === CODE && row.enabled)) {
    await adminRpc(request, "translation/languages/update", {
      code: CODE,
      enabled: false,
    });
  }
}

async function menuCodes(request: APIRequestContext): Promise<string[]> {
  const catalogue = await adminRpc<{ languages: LanguageRow[] }>(
    request,
    "system/i18n",
    {}
  );
  return catalogue.languages.map((row) => row.code);
}

test.describe("languages", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInAsAdmin(page.request);
      await disable(page.request);
    } finally {
      await page.close();
    }
  });

  test("adds a language, shows it as a column and in the menu data, then disables it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await signInAsAdmin(page.request);
    try {
      await openAdmin(page, LANGUAGES);
      await expect(
        page.getByRole("heading", { level: 1, name: "Talen" })
      ).toBeVisible();
      const table = page.getByRole("table", { name: "Talen" });
      await expect(table.getByRole("row", { name: DUTCH_ROW })).toBeVisible();

      const existing = await table.getByRole("row", { name: NAME_ROW }).count();
      if (existing === 0) {
        await page.getByRole("button", { name: "Taal toevoegen" }).click();
        const dialog = page.getByRole("dialog", { name: "Taal toevoegen" });
        await dialog.getByLabel("Code").fill(CODE);
        await dialog.getByLabel("Naam").fill(NAME);
        await dialog.getByLabel("Intl-tag").fill(CODE);
        await dialog.getByRole("button", { name: "Opslaan" }).click();
        await expect(page.getByText("De taal is opgeslagen.")).toBeVisible();
      } else {
        await table
          .getByRole("switch", { name: `${NAME} inschakelen` })
          .check();
      }
      const row = table.getByRole("row", { name: NAME_ROW });
      await expect(row).toBeVisible();
      await expect(
        row.getByRole("switch", { name: `${NAME} inschakelen` })
      ).toBeChecked();
      expect(await menuCodes(page.request)).toContain(CODE);

      // A column of the strings table, with every text missing, and a coverage row.
      await openAdmin(page, "/admin/translation/strings");
      await expect(
        page.getByRole("columnheader", { name: NAME })
      ).toBeVisible();
      await expect(page.getByTestId(`coverage-${CODE}`)).toBeVisible();
      await expect(
        page.getByTestId(`coverage-${CODE}`).getByText("0% vertaald")
      ).toBeVisible();

      // The default language cannot be disabled; the new one can.
      await openAdmin(page, LANGUAGES);
      await expect(
        table.getByRole("switch", { name: "Nederlands inschakelen" })
      ).toBeDisabled();
      await table
        .getByRole("switch", { name: `${NAME} inschakelen` })
        .uncheck();
      await expect
        .poll(async () => await menuCodes(page.request))
        .not.toContain(CODE);
      await openAdmin(page, "/admin/translation/strings");
      await expect(page.getByRole("columnheader", { name: NAME })).toHaveCount(
        0
      );

      // Both changes are in the audit log.
      await openAdmin(page, "/admin/audit");
      await expect(page.getByText("Taal gewijzigd").first()).toBeVisible();
    } finally {
      await disable(page.request);
    }
    expect(errors).toEqual([]);
  });

  test("refuses a code that is taken and one that is not a language code", async ({
    page,
  }) => {
    await signInAsAdmin(page.request);
    await openAdmin(page, LANGUAGES);
    await page.getByRole("button", { name: "Taal toevoegen" }).click();
    const dialog = page.getByRole("dialog", { name: "Taal toevoegen" });
    await dialog.getByLabel("Code").fill("nl");
    await dialog.getByLabel("Naam").fill("Nederlands");
    await dialog.getByLabel("Intl-tag").fill("nl-BE");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(dialog.getByText("Deze taalcode bestaat al.")).toBeVisible();
    await dialog.getByLabel("Code").fill("pt-br");
    await dialog.getByLabel("Naam").fill("Portugees");
    await dialog.getByLabel("Intl-tag").fill("pt-BR");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(
      dialog.getByText("Gebruik een geldige taalcode.")
    ).toBeVisible();
  });
});
