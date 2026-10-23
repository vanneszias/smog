import { type Browser, expect, type Page, test } from "@playwright/test";
import { adminRpc, openAdmin } from "./admin";
import {
  blockingViolations,
  e2eSeed,
  ORIGIN,
  signInWithApi,
  watchErrors,
} from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The legal texts (phase 10b task 7): an admin drafts, previews and publishes
 * the English terms and the public page shows the new text at once, then
 * restores version 1 (the shipped text) so the text every other spec reads is
 * unchanged; a translator sees the editor and the history but no restore.
 * The restore runs in `finally` through the same procedure. The effective
 * date is the shipped one (2026-09-30) so the date the page prints does not
 * change either.
 */

const LEGAL = "/admin/translation/legal?kind=terms&lang=en";
const SHIPPED_DATE = "2026-09-30";
const NEW_TITLE = "Terms of service (e2e edit)";
const PUBLISHED = /Versie \d+ gepubliceerd/;
const RESTORED = /Versie \d+ hersteld/;
const UPDATED = /Last updated on/;
const RESTORE_BUTTONS = /herstellen/;
const PUBLISHED_STATE = /Gepubliceerd: versie \d+,/;

async function axe(page: Page, where: string): Promise<string[]> {
  return (await blockingViolations(page)).map(
    (violation) => `${where}: ${violation.id} ${violation.nodes.join(" | ")}`
  );
}

/** The English terms are the shipped text again: version 1 restored when a later version is current. */
async function restoreShipped(page: Page): Promise<void> {
  await signInAsAdmin(page.request);
  const detail = await adminRpc<{
    published: { version: number } | null;
  }>(page.request, "translation/legal/get", { kind: "terms", locale: "en" });
  if (detail.published && detail.published.version > 1) {
    await adminRpc(page.request, "translation/legal/restore", {
      effectiveDate: SHIPPED_DATE,
      kind: "terms",
      locale: "en",
      version: 1,
    });
  }
}

/** What an English visitor (a fresh context, not the admin's) reads on /terms: its title and date line. */
async function publicTerms(
  browser: Browser
): Promise<{ date: string; title: string }> {
  const context = await browser.newContext({ baseURL: ORIGIN });
  try {
    await context.addCookies([{ name: "locale", url: ORIGIN, value: "en" }]);
    const reader = await context.newPage();
    await reader.goto("/terms");
    await expect(reader.getByRole("heading", { level: 1 })).toBeVisible();
    return {
      date: (await reader.getByText(UPDATED).textContent()) ?? "",
      title:
        (await reader.getByRole("heading", { level: 1 }).textContent()) ?? "",
    };
  } finally {
    await context.close();
  }
}

test.describe("legal texts", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await restoreShipped(page);
    } finally {
      await page.close();
    }
  });

  test("an admin drafts, publishes and restores; the public page follows without a deploy", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await signInAsAdmin(page.request);
    await openAdmin(page, LEGAL);
    await expect(
      page.getByRole("heading", { level: 1, name: "Juridische teksten" })
    ).toBeVisible();
    await expect(page.getByTestId("legal-state")).toContainText(
      PUBLISHED_STATE
    );
    await page.getByLabel("Titel van de tekst").fill(NEW_TITLE);
    await expect(page.getByText("Niet-opgeslagen wijzigingen")).toBeVisible();
    // The preview shows the edit before it is saved.
    await page.getByRole("tab", { name: "Voorbeeld" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: NEW_TITLE })
    ).toBeVisible();
    await page.getByRole("tab", { name: "Bewerken" }).click();
    await page.getByRole("button", { name: "Concept bewaren" }).click();
    await expect(page.getByText("Concept bewaard")).toBeVisible();
    // The draft is private: the public page still shows the old title.
    expect((await publicTerms(browser)).title).not.toBe(NEW_TITLE);
    await page.getByRole("button", { name: "Publiceren" }).click();
    const dialog = page.getByRole("dialog", { name: "Deze tekst publiceren" });
    await dialog.getByLabel("Ingangsdatum").fill("2026-11-01");
    await dialog.getByRole("button", { name: "Publiceren" }).click();
    await expect(page.getByText(PUBLISHED)).toBeVisible();
    // Shown at once, with the effective date.
    expect(await publicTerms(browser)).toEqual({
      date: "Last updated on 1 November 2026",
      title: NEW_TITLE,
    });
    // History: the new version is current, version 1 can be restored.
    await page.getByRole("tab", { name: "Geschiedenis" }).click();
    await expect(page.getByTestId("legal-version-1")).toBeVisible();
    await page.getByRole("button", { name: "Versie 1 herstellen" }).click();
    const restore = page.getByRole("dialog", { name: "Versie 1 herstellen" });
    await restore.getByLabel("Ingangsdatum").fill(SHIPPED_DATE);
    await restore.getByRole("button", { name: "Herstellen" }).click();
    await expect(page.getByText(RESTORED)).toBeVisible();
    expect((await publicTerms(browser)).title).not.toBe(NEW_TITLE);
    // Both steps are in the audit log.
    const audit = await adminRpc<{ items: { action: string }[] }>(
      page.request,
      "admin/audit/list",
      { targetType: "legal_text" }
    );
    const actions = audit.items.map((item) => item.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "legal.draft_save",
        "legal.publish",
        "legal.restore",
      ])
    );
    expect(errors).toEqual([]);
  });

  test("refuses an unsafe link next to the paragraph and keeps Save off", async ({
    page,
  }) => {
    await signInAsAdmin(page.request);
    await openAdmin(page, LEGAL);
    const block = page.getByTestId("legal-block").first();
    await block
      .getByRole("textbox")
      .fill("Read [more](javascript:alert(1)) here");
    await expect(
      page
        .getByText(
          "Links moeten naar https:, mailto: of een pagina van de site gaan."
        )
        .first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Concept bewaren" })
    ).toBeDisabled();
    await page.getByRole("button", { name: "Wijzigingen verwerpen" }).click();
    await expect(
      page.getByRole("button", { name: "Concept bewaren" })
    ).toBeDisabled();
  });

  test("has no serious accessibility violation in its states", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signInAsAdmin(page.request);
    await openAdmin(page, LEGAL);
    await expect(page.getByTestId("legal-section").first()).toBeVisible();
    const found: string[] = [];
    found.push(...(await axe(page, "legal:edit")));
    await page
      .getByTestId("legal-block")
      .first()
      .getByRole("textbox")
      .fill("See [x](http://example.test)");
    found.push(...(await axe(page, "legal:edit-error")));
    await page.getByRole("button", { name: "Wijzigingen verwerpen" }).click();
    await page.getByRole("tab", { name: "Voorbeeld" }).click();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    found.push(...(await axe(page, "legal:preview")));
    await page.getByRole("tab", { name: "Nederlandse bron" }).click();
    found.push(...(await axe(page, "legal:source")));
    await page.getByRole("tab", { name: "Geschiedenis" }).click();
    await expect(page.getByTestId("legal-version-1")).toBeVisible();
    found.push(...(await axe(page, "legal:history")));
    await page.getByRole("button", { name: "Voorbeeld van versie 1" }).click();
    await expect(page.getByRole("dialog", { name: "Versie 1" })).toBeVisible();
    found.push(...(await axe(page, "legal:version-preview")));
    await page.keyboard.press("Escape");
    expect(found).toEqual([]);
  });

  test("a translator edits and reads the history but cannot restore", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = await signInWithApi(page);
    await e2eSeed(page.request, [
      { email, op: "grantRole", role: "translator" },
    ]);
    await openAdmin(page, LEGAL);
    await expect(
      page.getByRole("heading", { level: 1, name: "Juridische teksten" })
    ).toBeVisible();
    await expect(page.getByTestId("legal-section").first()).toBeVisible();
    await page.getByRole("tab", { name: "Geschiedenis" }).click();
    await expect(page.getByTestId("legal-version-1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: RESTORE_BUTTONS })
    ).toHaveCount(0);
    await expect(
      page.getByText("Alleen een beheerder kan een eerdere versie herstellen.")
    ).toBeVisible();
    expect(await axe(page, "legal:translator")).toEqual([]);
    const refused = await page.request.post(
      "/api/rpc/translation/legal/restore",
      {
        data: {
          json: {
            effectiveDate: SHIPPED_DATE,
            kind: "terms",
            locale: "en",
            version: 1,
          },
        },
        headers: { origin: ORIGIN },
      }
    );
    expect(refused.status()).toBe(403);
  });
});
