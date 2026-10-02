import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  ADMIN_PAGES,
  forEachThemeAndWidth,
  hondId,
  launchReviewBrowser,
  openAdmin,
  shotsDir,
} from "./admin";
import { e2eSeed, signInWithApi } from "./helpers";

/*
 * The review screenshots of every admin screen and its dialogs and sheets
 * (light/dark × 390/1280, reduced motion, nl-BE), only when ADMIN_SHOTS_DIR
 * is set: `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test admin-screenshots`.
 * Read-only: the table edit is discarded and nothing is saved. The settings
 * page with maintenance on is shot by `admin-settings.spec.ts` (the
 * `maintenance` project).
 */

const MUX_FAKE_URL = `http://localhost:${process.env.E2E_MUX_PORT ?? 4010}`;
const LONG_TARGET = `gesture-${"x".repeat(60)}`;
const VIDEO = {
  buffer: Buffer.from("not really a video, the fake does not care"),
  mimeType: "video/mp4",
  name: "zwaaien.mp4",
};

/** A full-page shot, once every (stubbed) still has loaded. */
async function shoot(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    // A full-page shot of a scrolled page paints the sticky header mid-page.
    window.scrollTo(0, 0);
    for (const image of document.querySelectorAll("img")) {
      image.loading = "eager";
    }
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  await page.screenshot({ fullPage: true, path });
}

/** A viewport shot, for an open dialog or sheet (it covers the page). */
async function shootOverlay(page: Page, path: string): Promise<void> {
  await page.waitForTimeout(300);
  await page.screenshot({ path });
}

test.describe("admin screenshots", () => {
  test("every admin screen", async ({ request }) => {
    test.setTimeout(1_800_000);
    const dir = await shotsDir();
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    await e2eSeed(request, [
      {
        data: {
          legacy: {
            keywords: Array.from({ length: 40 }, (_, i) => `trefwoord-${i}`),
            note: "Een lange oude logregel ".repeat(12),
          },
        },
        id: "e2e-long",
        op: "legacyAuditEntry",
        targetId: LONG_TARGET,
        targetType: "gesture",
      },
    ]);
    const seeded = await fetch(`${MUX_FAKE_URL}/__fake/assets`, {
      body: JSON.stringify({ count: 6 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(seeded.ok).toBe(true);
    const browser = await launchReviewBrowser();
    try {
      const memberContext = await browser.newContext();
      const member = await signInWithApi(await memberContext.newPage());
      await memberContext.close();

      await forEachThemeAndWidth(browser, async (page, theme, width) => {
        const file = (name: string): string =>
          join(dir ?? "", `${name}-${theme}-${width}.png`);

        for (const [name, path] of ADMIN_PAGES) {
          // biome-ignore lint/performance/noAwaitInLoops: one screen at a time.
          await openAdmin(page, path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await shoot(page, file(name));
        }
        if (width < 768) {
          await page.getByRole("button", { name: "Beheermenu openen" }).click();
          await page.getByRole("dialog", { name: "Beheer" }).waitFor();
          await shootOverlay(page, file("rail-sheet"));
          await page.keyboard.press("Escape");
        }

        // The audit log's long entry.
        await openAdmin(page, "/admin/audit");
        await page.getByText(LONG_TARGET).first().click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Sluiten" })
          .waitFor();
        await shootOverlay(page, file("audit-detail"));

        // The gestures list: a selection, the row menu's QR dialog, the
        // table editor with one change and its review.
        await openAdmin(page, "/admin/gestures");
        await page.getByRole("checkbox", { name: "Hond selecteren" }).click();
        await shoot(page, file("gestures-selected"));
        await page.getByRole("button", { name: "Selectie wissen" }).click();
        await page.getByRole("button", { name: "Acties voor Hond" }).click();
        await page.getByRole("menuitem", { name: "QR-code" }).click();
        await page.getByRole("dialog", { name: "QR-code voor Hond" }).waitFor();
        await shootOverlay(page, file("gestures-qr"));
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Tabel bewerken" }).click();
        await page
          .getByRole("textbox", { name: "Naam van Hond" })
          .fill("Hond (bewerkt)");
        // Focus elsewhere, so the shot shows the changed style, not the ring.
        await page.getByRole("heading", { name: "Tabeleditor" }).focus();
        await shoot(page, file("gestures-table-editor"));
        await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
        await page
          .getByRole("dialog", { name: "Je wijzigingen nakijken" })
          .waitFor();
        await shootOverlay(page, file("gestures-table-changes"));
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Verwerpen (1)" }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Verwerpen" })
          // Only when the discard asks first; locator clicks never time out.
          .click({ timeout: 3000 })
          .catch(() => undefined);

        // The editor: a gesture with a name another has, then the new one's
        // validation and the video field's states.
        await openAdmin(page, `/admin/gestures/${await hondId(page.request)}`);
        await page.getByRole("textbox", { name: "Naam" }).fill("Kat");
        await expect(page.getByText("Mogelijk dubbel")).toBeVisible();
        await shoot(page, file("gesture-editor"));
        await openAdmin(page, "/admin/gestures/new");
        await page.getByRole("button", { name: "Gebaar aanmaken" }).click();
        await shoot(page, file("gesture-new-invalid"));
        await page.getByTestId("mux-file-input").setInputFiles(VIDEO);
        await expect(page.getByTestId("mux-upload-announcer")).toHaveText(
          "De video is klaar.",
          { timeout: 20_000 }
        );
        await shoot(page, file("video-ready"));
        await page.getByRole("tab", { name: "Bestaande kiezen" }).click();
        await expect(page.getByTestId("mux-asset").first()).toBeVisible();
        await shoot(page, file("video-picker"));
        await page.getByRole("tab", { name: "Playback-id" }).click();
        await page
          .getByRole("textbox", { name: "Playback-id" })
          .fill("geen geldige id!");
        await page
          .getByRole("button", { name: "Deze video gebruiken" })
          .click();
        await shoot(page, file("video-playback-invalid"));

        // Categories: the create dialog.
        await openAdmin(page, "/admin/categories");
        await page.getByRole("button", { name: "Nieuwe categorie" }).click();
        await page.getByRole("dialog", { name: "Nieuwe categorie" }).waitFor();
        await shootOverlay(page, file("categories-create"));
        await page.keyboard.press("Escape");

        // Users: a member's panel, the ban and delete confirmations.
        await openAdmin(page, `/admin/users?q=${encodeURIComponent(member)}`);
        await page
          .getByRole("table", { name: "Gebruikers" })
          .getByText(member)
          .first()
          .click();
        const panel = page.getByRole("dialog", { name: member });
        await panel.getByRole("button", { name: "Sluiten" }).waitFor();
        await shootOverlay(page, file("users-panel"));
        await panel.getByRole("button", { name: "Blokkeren" }).click();
        await page.getByRole("alertdialog").waitFor();
        await shootOverlay(page, file("users-ban"));
        await page.keyboard.press("Escape");
        await panel
          .getByRole("button", { name: "Account verwijderen" })
          .click();
        await page.getByRole("alertdialog").waitFor();
        await shootOverlay(page, file("users-delete"));
        await page.keyboard.press("Escape");

        // Emails: the plain-text view.
        await openAdmin(page, "/admin/emails?template=auth/otp");
        await page.getByRole("tab", { name: "Platte tekst" }).click();
        await shoot(page, file("emails-text"));

        // Without Mux the editor offers the playback id only.
        await page.route("**/api/rpc/admin/mux/status**", (route) =>
          route.fulfill({
            contentType: "application/json",
            json: { json: { configured: false }, meta: [] },
          })
        );
        await openAdmin(page, "/admin/gestures/new");
        await expect(
          page.getByText("Video-uploads zijn niet ingesteld")
        ).toBeVisible();
        await shoot(page, file("video-not-configured"));
      });
    } finally {
      await browser.close();
    }
  });
});
