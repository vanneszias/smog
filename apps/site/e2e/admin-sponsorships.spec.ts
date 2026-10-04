import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { adminRpc, openAdmin, stubMuxMedia } from "./admin";
import { blockingViolations, ORIGIN, tabTo } from "./helpers";
import { signInAsAdmin } from "./maintenance";
import {
  FLOW_IDS,
  openDetail,
  resetFlowFixtures,
  seedFlowFixtures,
} from "./sponsorships";

/*
 * The admin sponsorship flows (phase 6 task 7) on the dev D1, with
 * checkouts seeded through `/dev/e2e-seed` (`sponsorshipCheckout`): the
 * keyboard path; the Review queue → approve → the public page credits the
 * sponsor; request changes → the link, shown once, opens `/sponsor/edit`;
 * mark paid on a two-gesture payment; the CSV (18 columns, BOM); retry a
 * failed render (phase 7 task 7, `RENDER_MODE=fake`); the audit log of all
 * of it. Serial: the audit test reads what the others did, so a
 * failure skips it instead of reporting a confusing miss. The gestures are
 * this spec's own; the screens' axe matrix and screenshots are
 * `admin-sponsorships-a11y.spec.ts`.
 */

test.describe.configure({ mode: "serial" });

const REEDIT_LINK = new RegExp(
  `^${ORIGIN.replace(/[.:/]/g, "\\$&")}/sponsor/edit\\?token=[A-Za-z0-9_-]{43}$`
);
const NAAM_IN_DE_VIDEO = /^Naam in de video/;
const REVIEW_TAB = /^Te beoordelen/;
const VOGEL_CARD = /E2E Vogel/;
/** The fixture has no Mollie id: only the by-hand outcome is right. */
const MARK_PAID_DONE = "Als betaald gemarkeerd. De video’s worden gemaakt.";
const ONE_HUNDRED = /100,00/;
const CSV_FILE = /^sponsorships-\d{4}-\d{2}-\d{2}\.csv$/;
const ETEN_EN_DRINKEN = /Drinken en Eten|Eten en Drinken/;
/** The error the `render_failed` fixture's job carries (`e2e-seed.ts`). */
const SEEDED_RENDER_ERROR = "renderer answered 500";
const RETRY_RENDER = "Video opnieuw maken";
const RETRY_DONE = "De video wordt opnieuw gemaakt (poging 2).";

test.describe("admin sponsorships", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await seedFlowFixtures(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await resetFlowFixtures(page);
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await stubMuxMedia(page);
    await signInAsAdmin(page.request);
  });

  test("keyboard: a queue card opens with Enter; a dialog returns focus to its button", async ({
    page,
  }) => {
    await openAdmin(page, "/admin/sponsorships");
    const card = page.getByRole("link", { name: VOGEL_CARD });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Vogel" })
    ).toBeVisible();
    const reject = page.getByRole("button", { name: "Afwijzen" });
    await reject.focus();
    await page.keyboard.press("Enter");
    const alert = page.getByRole("alertdialog");
    await expect(alert).toBeVisible();
    // The reason is required: the confirm waits for it.
    await expect(
      alert.getByRole("button", { name: "Afwijzen" })
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(alert).toBeHidden();
    await expect(reject).toBeFocused();
  });

  test("a paid checkout waits in Review; approving it credits the sponsor on the gesture page", async ({
    page,
  }) => {
    await openAdmin(page, "/admin/sponsorships");
    const review = page.getByRole("tab", { name: REVIEW_TAB });
    await expect(review).toHaveAttribute("aria-selected", "true");
    const card = page.getByRole("link", { name: VOGEL_CARD });
    await expect(card).toContainText("Vogel");
    await expect(card).toContainText("Geen factuur");
    await card.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Vogel" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Goedkeuren" }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toContainText("E2E Vogel");
    await expect(alert).toContainText("50,00");
    await alert.getByRole("button", { name: "Goedkeuren" }).click();
    await expect(
      page.getByText("E2E Vogel is goedgekeurd en live.").first()
    ).toBeVisible();
    await expect(
      page.locator("main").getByText("Live", { exact: true }).first()
    ).toBeVisible();

    await page.goto("/gestures/vogel");
    await expect(page.getByText("E2E Vogel").first()).toBeVisible();
  });

  test("request changes (keyboard only) shows the link once; it opens the sponsor's edit page", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDetail(page, FLOW_IDS.koffie);
    // The moderation action and the token dialog, by keyboard only.
    const request = page.getByRole("button", { name: "Aanpassing vragen" });
    await request.focus();
    await page.keyboard.press("Enter");
    const confirm = page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Aanpassing vragen" });
    await tabTo(page, confirm);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Bewerklink voor E2E Koffie",
    });
    await expect(dialog).toBeVisible();
    const url = await dialog
      .getByRole("textbox", { name: "Link" })
      .inputValue();
    expect(url).toMatch(REEDIT_LINK);
    expect(await blockingViolations(page)).toEqual([]);
    await tabTo(page, dialog.getByRole("button", { name: "Link kopiëren" }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("Link gekopieerd.").first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await tabTo(page, dialog.getByRole("button", { name: "Klaar" }));
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    // Shown once: the page no longer holds the token.
    const token = new URL(url).searchParams.get("token") ?? "";
    expect(await page.content()).not.toContain(token);
    await expect(page.getByText("Aanpassing gevraagd").first()).toBeVisible();

    const response = await page.goto(url);
    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole("heading", { level: 1, name: "Werk je video bij" })
    ).toBeVisible();
    await expect(page.getByLabel(NAAM_IN_DE_VIDEO)).toHaveValue("E2E Koffie");
  });

  test("mark paid names every gesture of the payment and its amount", async ({
    page,
  }) => {
    await openDetail(page, FLOW_IDS.eten);
    const card = page.getByRole("region", { name: "Aankoop" });
    await expect(card).toContainText("Drinken");
    await card.getByRole("button", { name: "Als betaald markeren" }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toContainText(ONE_HUNDRED);
    await expect(alert).toContainText(ETEN_EN_DRINKEN);
    await expect(alert).toContainText("E2E Eten");
    await alert
      .getByRole("textbox", { name: "Bankreferentie" })
      .fill("E2E-OVERSCHRIJVING");
    await alert.getByRole("button", { name: "Als betaald markeren" }).click();
    await expect(page.getByText(MARK_PAID_DONE).first()).toBeVisible();
    await expect(card.getByText("Betaald", { exact: true })).toBeVisible();
    const detail = await adminRpc<{ payments: { status: string }[] }>(
      page.request,
      "admin/sponsorships/get",
      { id: FLOW_IDS.eten }
    );
    expect(detail.payments[0]?.status).toBe("paid");
  });

  test("the CSV downloads with its BOM and the 18 columns", async ({
    page,
  }) => {
    await openAdmin(page, "/admin/sponsorships");
    await page.getByRole("button", { name: "CSV exporteren" }).click();
    const dialog = page.getByRole("dialog", { name: "CSV exporteren" });
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Downloaden" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(CSV_FILE);
    const bytes = await readFile(await download.path());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.subarray(3).toString("utf8");
    const [header = "", ...rows] = text.split("\r\n");
    expect(header.split('","')).toHaveLength(18);
    expect(header.startsWith('"ID","Status"')).toBe(true);
    expect(rows.some((row) => row.includes('"E2E Eten"'))).toBe(true);
    await expect(page.getByText("rijen geëxporteerd.").first()).toBeVisible();
  });

  test("a failed render is retried: attempt 2 runs (fake render) and the sponsorship reaches review", async ({
    page,
  }) => {
    await openDetail(page, FLOW_IDS.kat);
    const jobs = page.getByRole("region", { name: "Videotaken" });
    await expect(jobs).toContainText(SEEDED_RENDER_ERROR);
    const retry = jobs.getByRole("button", { name: RETRY_RENDER });
    await retry.focus();
    await page.keyboard.press("Enter");
    const alert = page.getByRole("alertdialog");
    await expect(alert).toContainText("E2E Kat");
    await alert.getByRole("button", { name: RETRY_RENDER }).click();
    await expect(page.getByText(RETRY_DONE).first()).toBeVisible();
    // `RENDER_MODE=fake`: the queued job completes at once with the
    // gesture's own video, so the sponsorship moves on to review.
    await expect
      .poll(
        async () =>
          (
            await adminRpc<{ sponsorship: { status: string } }>(
              page.request,
              "admin/sponsorships/get",
              { id: FLOW_IDS.kat }
            )
          ).sponsorship.status,
        { timeout: 20_000 }
      )
      .toBe("in_review");
    await openDetail(page, FLOW_IDS.kat);
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Kat" })
    ).toBeVisible();
    await expect(page.getByText("Ter beoordeling").first()).toBeVisible();
    const trail = page.getByRole("list", { name: "Geschiedenis" });
    await expect(trail).toContainText("Video opnieuw gestart");
    await expect(trail).toContainText("Poging 2");
    await expect(
      page.getByRole("region", { name: "Videotaken" })
    ).toContainText("Poging 2");
    await expect(page.getByRole("button", { name: RETRY_RENDER })).toHaveCount(
      0
    );
  });

  test("the audit log lists the sponsorship actions", async ({ page }) => {
    for (const [action, target] of [
      ["sponsorship.approve", FLOW_IDS.vogel],
      ["sponsorship.request_changes", FLOW_IDS.koffie],
      ["sponsorship.mark_paid", FLOW_IDS.eten],
      ["sponsorship.retry_render", FLOW_IDS.kat],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one filter at a time.
      await openAdmin(page, `/admin/audit?action=${action}`);
      await expect(
        page.getByRole("table", { name: "Logboek" }).getByText(target).first()
      ).toBeVisible();
    }
    await openAdmin(page, "/admin/audit?action=export.sponsorships_csv");
    await expect(
      page
        .getByRole("table", { name: "Logboek" })
        .getByText("Sponsorings geëxporteerd (CSV)")
        .first()
    ).toBeVisible();
  });
});
