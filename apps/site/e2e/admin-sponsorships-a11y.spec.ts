import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  forEachThemeAndWidth,
  launchReviewBrowser,
  openAdmin,
  shotsDir,
  stubMuxMedia,
  THEMES,
  type Theme,
  themedContext,
  WIDTHS,
} from "./admin";
import { blockingViolations, watchErrors } from "./helpers";
import { signInAsAdmin } from "./maintenance";
import { ensureViewFixtures, openDetail, VIEW_IDS } from "./sponsorships";

/*
 * The admin sponsorship screens' axe matrix (phase 6 task 7, review I5):
 * one test per theme × width, in parallel. Every screen is checked in all
 * four; the dialogs (kit AlertDialog/Dialog) only in light at 1280 and dark
 * at 390, since contrast (theme) and reflow (width) are what change. No
 * idle waits: each stop waits for its own content. With ADMIN_SHOTS_DIR the
 * review screenshots are taken too. The fixtures are read-only and shared
 * (`ensureViewFixtures`).
 */

test.describe.configure({ mode: "parallel" });

/** The Mux player's own console noise when the (stubbed) stream is empty. */
const PLAYER_NOISE = /mux-player|getErrorFromHlsErrorData|net::ERR_FAILED/;
const HALLO_CARD = /Bakkerij Hallo/;

interface Visit {
  /** Open the dialogs too. */
  dialogs: boolean;
  /** Wait for the network to idle on each page (the screenshots). */
  settle: boolean;
}

/** The screens (and, with `dialogs`, their dialogs), calling `stop` at each. */
async function visitScreens(
  page: Page,
  { dialogs, settle }: Visit,
  stop: (name: string, overlay: boolean) => Promise<void>
): Promise<void> {
  // Its own locator: mux-player's error overlay is a `dialog` too.
  const alert = page.getByRole("alertdialog");
  const dialog = async (
    name: string,
    overlay: Locator,
    open: () => Promise<void>
  ): Promise<void> => {
    if (!dialogs) {
      return;
    }
    await open();
    await overlay.waitFor();
    await stop(name, true);
    await page.keyboard.press("Escape");
    await overlay.waitFor({ state: "hidden" });
  };
  const table = page.getByRole("table", { name: "Sponsorings" });

  await openAdmin(page, "/admin/sponsorships");
  await page.getByRole("link", { name: HALLO_CARD }).waitFor();
  await stop("sponsorships-review", false);
  await openAdmin(page, "/admin/sponsorships?tab=all");
  await table.getByText("E2E Dag").waitFor();
  await stop("sponsorships-all", false);
  await openAdmin(page, "/admin/sponsorships?tab=refund");
  await table.getByText("E2E Bang").waitFor();
  await stop("sponsorships-refund", false);
  await dialog(
    "sponsorships-export",
    page.getByRole("dialog", { name: "CSV exporteren" }),
    () => page.getByRole("button", { name: "CSV exporteren" }).click()
  );

  await openDetail(page, VIEW_IDS.hallo, { settle });
  await page.getByRole("img", { name: "Logo van Bakkerij Hallo" }).waitFor();
  await stop("sponsorship-review", false);
  await dialog("sponsorship-approve", alert, () =>
    page.getByRole("button", { name: "Goedkeuren" }).click()
  );
  await dialog("sponsorship-reject", alert, async () => {
    await page.getByRole("button", { name: "Afwijzen" }).click();
    await alert.getByRole("textbox").fill("Onleesbaar");
  });

  await openDetail(page, VIEW_IDS.dag, { settle });
  await stop("sponsorship-awaiting", false);
  await dialog("sponsorship-mark-paid", alert, () =>
    page.getByRole("button", { name: "Als betaald markeren" }).click()
  );
  await dialog("sponsorship-cancel", alert, () =>
    page.getByRole("button", { name: "Betaling annuleren" }).click()
  );

  await openDetail(page, VIEW_IDS.appel, { settle });
  await stop("sponsorship-live", false);
  await dialog("sponsorship-force-expire", alert, () =>
    page.getByRole("button", { name: "Nu beëindigen" }).click()
  );

  await openDetail(page, VIEW_IDS.bang, { settle });
  await stop("sponsorship-refund", false);
}

/** The two contexts that also check the dialogs. */
function checksDialogs(theme: Theme, width: number): boolean {
  return (
    (theme === "light" && width === 1280) || (theme === "dark" && width === 390)
  );
}

test.describe("admin sponsorships: accessibility", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInAsAdmin(page.request);
      await ensureViewFixtures(page);
    } finally {
      await page.close();
    }
  });

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: every sponsorship screen, ${theme} at ${width} px`, async ({
        browser,
      }) => {
        test.setTimeout(180_000);
        const context = await themedContext(browser, theme, 1280);
        try {
          const page = await context.newPage();
          await page.setViewportSize({ height: 900, width });
          const errors = watchErrors(page);
          await stubMuxMedia(page);
          await signInAsAdmin(page.request);
          const found: { id: string; nodes: string[]; where: string }[] = [];
          await visitScreens(
            page,
            { dialogs: checksDialogs(theme, width), settle: false },
            async (name) => {
              for (const violation of await blockingViolations(page)) {
                found.push({ ...violation, where: name });
              }
            }
          );
          expect(found).toEqual([]);
          expect(errors.filter((line) => !PLAYER_NOISE.test(line))).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }

  test("review screenshots", async () => {
    test.setTimeout(900_000);
    const dir = await shotsDir();
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    const browser = await launchReviewBrowser();
    try {
      await forEachThemeAndWidth(browser, async (page, theme, width) => {
        await visitScreens(
          page,
          { dialogs: true, settle: true },
          async (name, overlay) => {
            const path = join(dir ?? "", `${name}-${theme}-${width}.png`);
            if (!overlay) {
              await page.evaluate(() => window.scrollTo(0, 0));
            }
            await page.waitForTimeout(300);
            await page.screenshot({ fullPage: !overlay, path });
          }
        );
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
