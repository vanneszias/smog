import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  adminRpc,
  forEachThemeAndWidth,
  launchReviewBrowser,
  openAdmin,
  shotsDir,
  stubMuxMedia,
} from "./admin";
import { blockingViolations, e2eSeed, ORIGIN, watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The admin sponsorship screens (phase 6 task 7) on the dev D1, with
 * checkouts seeded in each state through `/dev/e2e-seed`
 * (`sponsorshipCheckout`): the Review queue → approve → the public page
 * credits the sponsor; request changes → the link, shown once, opens
 * `/sponsor/edit`; mark paid on a two-gesture payment; the CSV (18 columns,
 * BOM); the audit log. Then axe on every screen and dialog in light and
 * dark at 390 and 1280 px, keyboard focus, and (with ADMIN_SHOTS_DIR) the
 * review screenshots. The gestures below are this spec's own: no other
 * spec sponsors or checks them.
 */

const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const DAY = 86_400_000;
const SLUGS = [
  "vogel",
  "koffie",
  "eten",
  "drinken",
  "appel",
  "bang",
  "hallo",
  "dag",
] as const;
/** The Mux player's own console noise when the (stubbed) stream is empty. */
const PLAYER_NOISE = /mux-player|getErrorFromHlsErrorData|net::ERR_FAILED/;
const REEDIT_LINK = new RegExp(
  `^${ORIGIN.replace(/[.:/]/g, "\\$&")}/sponsor/edit\\?token=[A-Za-z0-9_-]{43}$`
);
const NAAM_IN_DE_VIDEO = /^Naam in de video/;
const REVIEW_TAB = /^Te beoordelen/;
const VOGEL_CARD = /E2E Vogel/;
const HALLO_CARD = /Bakkerij Hallo/;
const MARK_PAID_DONE = /Als betaald gemarkeerd|Mollie had deze betaling al/;
const ONE_HUNDRED = /100,00/;
const CSV_FILE = /^sponsorships-\d{4}-\d{2}-\d{2}\.csv$/;
const ETEN_EN_DRINKEN = /Drinken en Eten|Eten en Drinken/;

/** The fixtures' sponsorship ids: `<checkout id>-<n>`. */
const IDS = {
  appel: "e2e-adm-appel-0",
  bang: "e2e-adm-bang-0",
  dag: "e2e-adm-dag-0",
  eten: "e2e-adm-eten-0",
  hallo: "e2e-adm-hallo-0",
  koffie: "e2e-adm-koffie-0",
  vogel: "e2e-adm-vogel-0",
} as const;

/** Stores a logo through the public upload (the signed fallback in dev). */
async function uploadLogo(page: Page): Promise<string> {
  const body = await readFile(
    join(import.meta.dirname, "../public/icon-192.png")
  );
  const upload = await adminRpc<{
    headers: { "content-type": string };
    key: string;
    uploadUrl: string;
  }>(page.request, "sponsorships/uploadLogo", {
    contentType: "image/png",
    size: body.byteLength,
  });
  const response = await page.request.put(upload.uploadUrl, {
    data: body,
    headers: { ...upload.headers, origin: ORIGIN },
  });
  if (!response.ok()) {
    throw new Error(`[e2e] The logo upload answered ${response.status()}`);
  }
  return upload.key;
}

/** Every fixture checkout, fresh (the previous run's rows go first). */
async function seedFixtures(page: Page): Promise<void> {
  const logoKey = await uploadLogo(page);
  const inReview = {
    paymentStatus: "paid",
    status: "in_review",
    videoPlaybackId: SAMPLE_PLAYBACK_ID,
  };
  await e2eSeed(page.request, [
    { op: "resetSponsorships", slugs: [...SLUGS] },
    {
      ...inReview,
      displayName: "E2E Vogel",
      gestureSlugs: ["vogel"],
      id: "e2e-adm-vogel",
      op: "sponsorshipCheckout",
    },
    {
      ...inReview,
      displayName: "E2E Koffie",
      gestureSlugs: ["koffie"],
      id: "e2e-adm-koffie",
      op: "sponsorshipCheckout",
    },
    {
      ...inReview,
      displayName: "Bakkerij Hallo",
      gestureSlugs: ["hallo"],
      id: "e2e-adm-hallo",
      invoice: true,
      logo: true,
      logoKey,
      op: "sponsorshipCheckout",
    },
    {
      displayName: "E2E Eten",
      gestureSlugs: ["eten", "drinken"],
      id: "e2e-adm-eten",
      op: "sponsorshipCheckout",
      paymentStatus: "open",
      status: "awaiting_payment",
    },
    {
      displayName: "E2E Dag",
      gestureSlugs: ["dag"],
      id: "e2e-adm-dag",
      invoice: true,
      op: "sponsorshipCheckout",
      paymentStatus: "open",
      status: "awaiting_payment",
    },
    {
      displayName: "E2E Appel",
      endsAt: Date.now() + 200 * DAY,
      gestureSlugs: ["appel"],
      id: "e2e-adm-appel",
      op: "sponsorshipCheckout",
      paymentStatus: "paid",
      status: "live",
      videoPlaybackId: SAMPLE_PLAYBACK_ID,
    },
    {
      displayName: "E2E Bang",
      gestureSlugs: ["bang"],
      id: "e2e-adm-bang",
      op: "sponsorshipCheckout",
      paymentStatus: "refund_needed",
      status: "cancelled",
    },
  ]);
}

/** The detail's h1 is there (the data rendered, not its skeleton). */
async function openDetail(page: Page, id: string): Promise<void> {
  await openAdmin(page, `/admin/sponsorships/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    "Sponsorings"
  );
  await page.waitForLoadState("networkidle");
}

async function signedIn(page: Page): Promise<void> {
  await stubMuxMedia(page);
  await signInAsAdmin(page.request);
}

test.describe("admin sponsorships", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await seedFixtures(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ request }) => {
    await e2eSeed(request, [{ op: "resetSponsorships", slugs: [...SLUGS] }]);
  });

  test.beforeEach(async ({ page }) => {
    await signedIn(page);
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

  test("request changes shows the link once; it opens the sponsor's edit page", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDetail(page, IDS.koffie);
    await page.getByRole("button", { name: "Aanpassing vragen" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Aanpassing vragen" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Bewerklink voor E2E Koffie",
    });
    await expect(dialog).toBeVisible();
    const url = await dialog
      .getByRole("textbox", { name: "Link" })
      .inputValue();
    expect(url).toMatch(REEDIT_LINK);
    expect(await blockingViolations(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Link kopiëren" }).click();
    await expect(page.getByText("Link gekopieerd.").first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await dialog.getByRole("button", { name: "Klaar" }).click();
    await expect(dialog).toBeHidden();
    // Shown once: the page no longer holds the token.
    const token = new URL(url).searchParams.get("token") ?? "";
    expect(await page.content()).not.toContain(token);
    await expect(page.getByText("Aanpassing gevraagd").first()).toBeVisible();

    const response = await page.goto(url);
    test.skip(
      response?.status() === 404,
      "/sponsor/edit arrives with phase 6 task 8 (the link's shape is checked above)"
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Werk je video bij" })
    ).toBeVisible();
    await expect(page.getByLabel(NAAM_IN_DE_VIDEO)).toHaveValue("E2E Koffie");
  });

  test("mark paid names every gesture of the payment and its amount", async ({
    page,
  }) => {
    await openDetail(page, IDS.eten);
    const card = page.getByRole("region", { name: "Aankoop" });
    await expect(card).toContainText("Drinken");
    await card.getByRole("button", { name: "Als betaald markeren" }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toContainText(ONE_HUNDRED);
    await expect(alert).toContainText(ETEN_EN_DRINKEN);
    await alert
      .getByRole("textbox", { name: "Bankreferentie" })
      .fill("E2E-OVERSCHRIJVING");
    await alert.getByRole("button", { name: "Als betaald markeren" }).click();
    await expect(page.getByText(MARK_PAID_DONE).first()).toBeVisible();
    await expect(card.getByText("Betaald", { exact: true })).toBeVisible();
    const detail = await adminRpc<{ payments: { status: string }[] }>(
      page.request,
      "admin/sponsorships/get",
      { id: IDS.eten }
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
    expect(rows.some((row) => row.includes('"E2E Dag"'))).toBe(true);
    await expect(page.getByText("rijen geëxporteerd.").first()).toBeVisible();
  });

  test("the audit log lists the sponsorship actions", async ({ page }) => {
    for (const [action, target] of [
      ["sponsorship.approve", IDS.vogel],
      ["sponsorship.request_changes", IDS.koffie],
      ["sponsorship.mark_paid", IDS.eten],
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

  test("keyboard: a queue card opens with Enter; a dialog returns focus to its button", async ({
    page,
  }) => {
    await openAdmin(page, "/admin/sponsorships");
    const card = page.getByRole("link", { name: HALLO_CARD });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bakkerij Hallo" })
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
});

/** The screens and dialogs the axe run and the screenshots visit. */
async function visitScreens(
  page: Page,
  stop: (name: string, overlay: boolean) => Promise<void>
): Promise<void> {
  await openAdmin(page, "/admin/sponsorships");
  await expect(page.getByRole("link", { name: HALLO_CARD })).toBeVisible();
  await stop("sponsorships-review", false);
  await openAdmin(page, "/admin/sponsorships?tab=all");
  await expect(
    page.getByRole("table", { name: "Sponsorings" }).getByText("E2E Dag")
  ).toBeVisible();
  await stop("sponsorships-all", false);
  await openAdmin(page, "/admin/sponsorships?tab=refund");
  await expect(
    page.getByRole("table", { name: "Sponsorings" }).getByText("E2E Bang")
  ).toBeVisible();
  await stop("sponsorships-refund", false);
  await page.getByRole("button", { name: "CSV exporteren" }).click();
  await page.getByRole("dialog", { name: "CSV exporteren" }).waitFor();
  await stop("sponsorships-export", true);
  await page.keyboard.press("Escape");

  await openDetail(page, IDS.hallo);
  await expect(
    page.getByRole("img", { name: "Logo van Bakkerij Hallo" })
  ).toBeVisible();
  await stop("sponsorship-review", false);
  await page.getByRole("button", { name: "Goedkeuren" }).click();
  await page.getByRole("alertdialog").waitFor();
  await stop("sponsorship-approve", true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Afwijzen" }).click();
  await page.getByRole("alertdialog").getByRole("textbox").fill("Onleesbaar");
  await stop("sponsorship-reject", true);
  await page.keyboard.press("Escape");

  await openDetail(page, IDS.dag);
  await stop("sponsorship-awaiting", false);
  await page.getByRole("button", { name: "Als betaald markeren" }).click();
  await page.getByRole("alertdialog").waitFor();
  await stop("sponsorship-mark-paid", true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Betaling annuleren" }).click();
  await page.getByRole("alertdialog").waitFor();
  await stop("sponsorship-cancel", true);
  await page.keyboard.press("Escape");

  await openDetail(page, IDS.appel);
  await stop("sponsorship-live", false);
  await page.getByRole("button", { name: "Nu beëindigen" }).click();
  await page.getByRole("alertdialog").waitFor();
  await stop("sponsorship-force-expire", true);
  await page.keyboard.press("Escape");

  await openDetail(page, IDS.bang);
  await stop("sponsorship-refund", false);
}

test.describe("admin sponsorships: accessibility and screenshots", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInAsAdmin(page.request);
      await seedFixtures(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ request }) => {
    await e2eSeed(request, [{ op: "resetSponsorships", slugs: [...SLUGS] }]);
  });

  test("axe: every sponsorship screen and dialog, light and dark, 390 and 1280 px", async ({
    browser,
  }) => {
    test.setTimeout(600_000);
    const found: { id: string; nodes: string[]; where: string }[] = [];
    const errors: string[] = [];
    await forEachThemeAndWidth(browser, async (page, theme, width) => {
      errors.push(...watchErrors(page));
      await visitScreens(page, async (name) => {
        await page.waitForTimeout(150);
        for (const violation of await blockingViolations(page)) {
          found.push({ ...violation, where: `${name} ${theme} ${width}` });
        }
      });
    });
    expect(found).toEqual([]);
    expect(errors.filter((line) => !PLAYER_NOISE.test(line))).toEqual([]);
  });

  test("review screenshots", async () => {
    test.setTimeout(900_000);
    const dir = await shotsDir();
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    const browser = await launchReviewBrowser();
    try {
      await forEachThemeAndWidth(browser, async (page, theme, width) => {
        await visitScreens(page, async (name, overlay) => {
          const path = join(dir ?? "", `${name}-${theme}-${width}.png`);
          if (!overlay) {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForLoadState("networkidle");
          }
          await page.waitForTimeout(300);
          await page.screenshot({ fullPage: !overlay, path });
        });
        await openAdmin(page, "/admin");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          fullPage: true,
          path: join(dir ?? "", `dashboard-sponsorships-${theme}-${width}.png`),
        });
      });
    } finally {
      await browser.close();
    }
  });
});
