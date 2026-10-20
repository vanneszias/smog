import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  GUEST_ROUTES,
  newPublicPage,
  openPublic,
  seedAccount,
} from "./a11y-support";
import { THEMES, WIDTHS } from "./admin";
import { settleForShot } from "./helpers";

/*
 * The visual review of the public site (spec §13, phase 9 task 5): every
 * public route in light and dark at 390 and 1280 px, reduced motion, nl-BE,
 * written as full-page PNGs when PUBLIC_SHOTS_DIR is set:
 * `PUBLIC_SHOTS_DIR=/tmp/public-shots bunx playwright test screenshots`.
 * Artifacts for a person to look at, not assertions (nothing is compared
 * with a baseline), so they never fail on a font or a browser version.
 * Read-only apart from the account the signed-in pages use.
 */

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
  await settleForShot(page);
  await page.screenshot({ fullPage: true, path });
}

test.describe("public screenshots", () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`every route, ${theme} at ${width} px`, async ({ browser }) => {
        test.setTimeout(600_000);
        const dir = process.env.PUBLIC_SHOTS_DIR;
        test.skip(!dir, "set PUBLIC_SHOTS_DIR to take the review screenshots");
        if (!dir) {
          return;
        }
        await mkdir(dir, { recursive: true });
        const { context, page } = await newPublicPage(browser, theme, width);
        let cleanup: (() => Promise<void>) | undefined;
        try {
          const name = (route: string): string =>
            join(dir, `${route}-${width}-${theme}.png`);
          for (const { name: route, path } of GUEST_ROUTES) {
            // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
            await openPublic(page, path);
            await shoot(page, name(route));
          }
          const fixture = await seedAccount(page);
          ({ cleanup } = fixture);
          for (const [route, path] of [
            ["favorites-items", "/favorites"],
            ["lists-items", "/lists"],
            ["list", `/lists?id=${fixture.listId}`],
            ["account-signed-in", "/account"],
          ] as const) {
            // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
            await openPublic(page, path);
            await shoot(page, name(route));
          }
          await openPublic(page, fixture.viewPath);
          await expect(page.getByRole("main")).toBeVisible();
          await shoot(page, name("shared-list"));
        } finally {
          await cleanup?.().catch(() => undefined);
          await context.close();
        }
      });
    }
  }
});
