import { readFile } from "node:fs/promises";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { adminRpc, openAdmin } from "./admin";
import { e2eSeed, ORIGIN, signInWithApi, watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The translation screens (phase 10b task 4): editing a string (saved,
 * shown at once, audited, reverted), the import's dry run and apply, the
 * export file, the coverage card, and a translator who signs in and sees
 * only the translation screens. Every override the specs write is reverted
 * in `finally` through the same procedure, so no text stays changed for
 * the specs that run after. The language screen (it adds a language the
 * menu shows) is `admin-languages.spec.ts`, in the serial project.
 *
 * The strings edited are English texts of emails nobody else's spec reads
 * (the specs run in Dutch).
 */

const KEY = "email.auth.magicLink.preheader";
const OTHER_KEY = "email.auth.otp.preheader";
const EDIT_BUTTON = `Bewerk ${KEY} in het English`;
const EDIT_LABEL = `Tekst van ${KEY} in het English`;
const STRINGS = "/admin/translation/strings";
const HAS_QUERY = /q=/;
const STRINGS_URL = /\/admin\/translation\/strings/;
const MISSING_URL = /status=missing/;
const TOTAL = /Aantal teksten: 1[7-9]\d\d/;

interface Cell {
  overridden: boolean;
  updatedAt: number | null;
  value: string | null;
}

interface Row {
  cells: Record<string, Cell>;
  key: string;
}

/** The English cell of `key`, read through the procedure. */
async function englishCell(
  request: APIRequestContext,
  key: string
): Promise<Cell> {
  const page = await adminRpc<{ items: Row[] }>(
    request,
    "translation/strings/list",
    { limit: 20, search: key }
  );
  const row = page.items.find((item) => item.key === key);
  const cell = row?.cells.en;
  if (!cell) {
    throw new Error(`[e2e] no English cell for ${key}`);
  }
  return cell;
}

/** Back to the shipped text, whatever a test left. */
async function revert(
  request: APIRequestContext,
  ...keys: string[]
): Promise<void> {
  for (const key of keys) {
    // biome-ignore lint/performance/noAwaitInLoops: each revert reads the row it removes.
    const cell = await englishCell(request, key);
    if (cell.overridden) {
      await adminRpc(request, "translation/strings/save", {
        expectedUpdatedAt: cell.updatedAt,
        key,
        locale: "en",
        value: null,
      });
    }
  }
}

async function filter(page: Page, text: string): Promise<void> {
  await page.getByRole("searchbox", { name: "Zoeken" }).fill(text);
  await expect(page).toHaveURL(HAS_QUERY);
}

test.describe("translation strings", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInAsAdmin(page.request);
      await revert(page.request, KEY, OTHER_KEY);
    } finally {
      await page.close();
    }
  });

  test("edits a text, shows it at once, audits it and reverts it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await signInAsAdmin(page.request);
    try {
      await openAdmin(page, STRINGS);
      await expect(
        page.getByRole("heading", { level: 1, name: "Teksten" })
      ).toBeVisible();
      await filter(page, KEY);
      const edit = page.getByRole("button", { name: EDIT_BUTTON });
      await expect(edit).toBeVisible();
      await edit.click();
      const box = page.getByRole("textbox", { name: EDIT_LABEL });
      await box.fill("Open the link to sign in (edited)");
      await page.getByRole("button", { name: "Opslaan" }).click();
      // Shown at once, and stored: a reload shows it too.
      await expect(
        page.getByText("Open the link to sign in (edited)")
      ).toBeVisible();
      await expect
        .poll(async () => (await englishCell(page.request, KEY)).value)
        .toBe("Open the link to sign in (edited)");
      await page.reload();
      await filter(page, KEY);
      await expect(
        page.getByText("Open the link to sign in (edited)")
      ).toBeVisible();

      // The audit log names it, without the text.
      await openAdmin(page, "/admin/audit");
      await expect(
        page.getByText("Interfacetekst vertaald").first()
      ).toBeVisible();
      expect(await page.content()).not.toContain(
        "Open the link to sign in (edited)"
      );

      // Revert: the shipped text is back.
      await openAdmin(page, `${STRINGS}?q=${KEY}`);
      await page.getByRole("button", { name: EDIT_BUTTON }).click();
      await page
        .getByRole("button", { name: "Terug naar de standaardtekst" })
        .click();
      await expect
        .poll(async () => (await englishCell(page.request, KEY)).overridden)
        .toBe(false);
    } finally {
      await revert(page.request, KEY);
    }
    expect(errors).toEqual([]);
  });

  test("refuses broken placeholders in the editor and keeps what was typed", async ({
    page,
  }) => {
    await signInAsAdmin(page.request);
    await openAdmin(page, `${STRINGS}?q=kit.stepOf`);
    await page
      .getByRole("button", { name: "Bewerk kit.stepOf in het English" })
      .click();
    const box = page.getByRole("textbox", {
      name: "Tekst van kit.stepOf in het English",
    });
    await box.fill("Step");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(
      page.getByText("De invulplaatsen moeten gelijk zijn aan de bron", {
        exact: false,
      })
    ).toBeVisible();
    await expect(box).toHaveValue("Step");
    expect((await englishCell(page.request, "kit.stepOf")).overridden).toBe(
      false
    );
  });

  test("shows the other version when somebody saved first", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page.request);
    try {
      await openAdmin(page, `${STRINGS}?q=${KEY}`);
      await page.getByRole("button", { name: EDIT_BUTTON }).click();
      const box = page.getByRole("textbox", { name: EDIT_LABEL });
      // Somebody else saves the same text meanwhile.
      await adminRpc(page.request, "translation/strings/save", {
        expectedUpdatedAt: null,
        key: KEY,
        locale: "en",
        value: "Their version",
      });
      await box.fill("My version");
      await page.getByRole("button", { name: "Opslaan" }).click();
      const editor = page.getByTestId("editor-en");
      await expect(editor.getByText("Iemand was je voor")).toBeVisible();
      await expect(editor.getByText("Their version")).toBeVisible();
      await editor
        .getByRole("button", { name: "Toch mijn versie opslaan" })
        .click();
      await editor.getByRole("button", { name: "Opslaan" }).click();
      await expect
        .poll(async () => (await englishCell(page.request, KEY)).value)
        .toBe("My version");
    } finally {
      await revert(page.request, KEY);
    }
  });

  test("imports a file: dry run first, then applies, audited", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page.request);
    try {
      await openAdmin(page, STRINGS);
      await page.getByRole("button", { name: "Importeren" }).click();
      const dialog = page.getByRole("dialog", {
        name: "Teksten importeren",
      });
      const before = (await englishCell(page.request, OTHER_KEY)).value;
      await dialog.getByLabel("Bestand").setInputFiles({
        buffer: Buffer.from(
          JSON.stringify({
            [OTHER_KEY]: "Your code is {{code}} (imported).",
            "no.such.key": "x",
          })
        ),
        mimeType: "application/json",
        name: "texts-en.json",
      });
      await dialog
        .getByRole("combobox", { name: "Taal van het bestand" })
        .click();
      await page.getByRole("option", { name: "English" }).click();
      // The dry run: one change, one skipped line, nothing written yet.
      const plan = dialog.getByTestId("import-plan");
      await expect(plan.getByText("Gewijzigd: 1")).toBeVisible();
      await expect(plan.getByText("Overgeslagen: 1")).toBeVisible();
      await expect(plan.getByText("onbekende sleutel")).toBeVisible();
      expect((await englishCell(page.request, OTHER_KEY)).value).toBe(before);

      await dialog.getByRole("button", { name: "Importeren" }).click();
      await expect(page.getByText("Teksten opgeslagen: 1")).toBeVisible();
      await expect
        .poll(async () => (await englishCell(page.request, OTHER_KEY)).value)
        .toBe("Your code is {{code}} (imported).");

      await openAdmin(page, "/admin/audit");
      await expect(
        page.getByText("Interfaceteksten geïmporteerd").first()
      ).toBeVisible();
    } finally {
      await revert(page.request, OTHER_KEY);
    }
  });

  test("refuses a file it cannot read and one with the wrong placeholders, before writing", async ({
    page,
  }) => {
    await signInAsAdmin(page.request);
    await openAdmin(page, STRINGS);
    await page.getByRole("button", { name: "Importeren" }).click();
    const dialog = page.getByRole("dialog", { name: "Teksten importeren" });
    await dialog.getByLabel("Bestand").setInputFiles({
      buffer: Buffer.from("{ not json"),
      mimeType: "application/json",
      name: "broken.json",
    });
    await expect(
      dialog.getByText("Dit is geen geldig JSON-bestand.")
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Importeren" })
    ).toBeDisabled();
    await dialog.getByLabel("Bestand").setInputFiles({
      buffer: Buffer.from(
        JSON.stringify({ [OTHER_KEY]: "No placeholders here" })
      ),
      mimeType: "application/json",
      name: "wrong.json",
    });
    await dialog
      .getByRole("combobox", { name: "Taal van het bestand" })
      .click();
    await page.getByRole("option", { name: "English" }).click();
    await expect(
      dialog.getByTestId("import-plan").getByText("invulplaatsen kloppen niet")
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Importeren" })
    ).toBeDisabled();
  });

  test("exports a language as a JSON file", async ({ page }) => {
    await signInAsAdmin(page.request);
    await openAdmin(page, STRINGS);
    await page.getByRole("button", { name: "Exporteren" }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "English (JSON)" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("smog-strings-en.json");
    const path = await download.path();
    const texts = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      string
    >;
    expect(typeof texts["auth.errors.generic"]).toBe("string");
    expect(Object.keys(texts).length).toBeGreaterThan(1700);
  });

  test("shows the coverage on the dashboard and above the strings", async ({
    page,
  }) => {
    await signInAsAdmin(page.request);
    await openAdmin(page, "/admin");
    const card = page.getByTestId("coverage-card");
    await expect(
      card.getByRole("heading", { name: "Vertaaldekking" })
    ).toBeVisible();
    await Promise.all(
      ["nl", "en", "fr"].map((language) =>
        expect(card.getByTestId(`coverage-${language}`)).toBeVisible()
      )
    );
    await expect(
      card.getByTestId("coverage-nl").getByText("100% vertaald")
    ).toBeVisible();
    await openAdmin(page, STRINGS);
    await expect(page.getByTestId("coverage-card")).toBeVisible();
  });

  test("filters by status and language and pages the table", async ({
    page,
  }) => {
    await signInAsAdmin(page.request);
    await openAdmin(page, STRINGS);
    await expect(page.getByText(TOTAL)).toBeVisible();
    // 100 rows a page, so the table has pages.
    await expect(
      page.getByRole("navigation", { name: "Paginering" })
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Toon" }).click();
    await page.getByRole("option", { name: "Ontbrekend" }).click();
    await expect(page).toHaveURL(MISSING_URL);
    await expect(page.getByText("Aantal teksten: 0")).toBeVisible();
    await expect(
      page.getByText("Geen teksten voor deze filters.")
    ).toBeVisible();
  });
});

test.describe("a translator", () => {
  test("lands on the strings and sees only the translation screens", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = await signInWithApi(page);
    await e2eSeed(page.request, [
      { email, op: "grantRole", role: "translator" },
    ]);
    await page.goto("/admin");
    await expect(page).toHaveURL(STRINGS_URL);
    await expect(
      page.getByRole("heading", { level: 1, name: "Teksten" })
    ).toBeVisible();
    // The rail: the translation group and the strings, nothing else.
    const rail = page.getByRole("navigation", { name: "Beheer" });
    await expect(rail.getByRole("link", { name: "Teksten" })).toBeVisible();
    await Promise.all(
      [
        "Overzicht",
        "Gebaren",
        "Gebruikers",
        "Logboek",
        "Instellingen",
        "Talen",
      ].map((hidden) =>
        expect(rail.getByRole("link", { name: hidden })).toHaveCount(0)
      )
    );
    // Every other admin screen is the 404 page, and the languages too.
    const notFound = await Promise.all(
      ["/admin/users", "/admin/audit", "/admin/translation/languages"].map(
        async (path) => [path, (await page.request.get(path)).status()]
      )
    );
    expect(notFound).toEqual([
      ["/admin/users", 404],
      ["/admin/audit", 404],
      ["/admin/translation/languages", 404],
    ]);
    // The procedures refuse an admin call; the translation ones answer.
    const refused = await page.request.post("/api/rpc/admin/dashboard", {
      data: { json: null },
      headers: { origin: ORIGIN },
    });
    expect(refused.status()).toBe(403);
    const allowed = await page.request.post(
      "/api/rpc/translation/strings/list",
      { data: { json: { limit: 1 } }, headers: { origin: ORIGIN } }
    );
    expect(allowed.status()).toBe(200);
    const languages = await page.request.post(
      "/api/rpc/translation/languages/create",
      {
        data: { json: { code: "pt", intlTag: "pt-PT", name: "Português" } },
        headers: { origin: ORIGIN },
      }
    );
    expect(languages.status()).toBe(403);
  });
});
