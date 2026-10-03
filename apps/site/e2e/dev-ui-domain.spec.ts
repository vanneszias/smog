import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { stubMux, waitForHydration, withoutAxeExcluded } from "./helpers";

const SCREENSHOTS = "e2e/__screenshots__";
const WIDTHS = [390, 1280] as const;
const THEMES = ["light", "dark"] as const;
const BLOCKING = new Set(["serious", "critical"]);
const SAVE_TO_LIST = "Opslaan in lijst";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function openGallery(page: Page, width: number): Promise<void> {
  await stubMux(page);
  await page.setViewportSize({ height: 900, width });
  await page.goto("/dev/ui");
  await expect(
    page.getByRole("heading", { level: 1, name: "Componentengalerij" })
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForHydration(page);
}

async function blockingViolations(page: Page, include: string) {
  const results = await withoutAxeExcluded(new AxeBuilder({ page }))
    .include(include)
    .analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    }));
}

test.describe("/dev/ui domain sections", () => {
  for (const width of WIDTHS) {
    test(`render at ${width}px without console errors or serious axe violations`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await openGallery(page, width);
      for (const theme of THEMES) {
        const domain = page.locator(
          `[data-theme-column="${theme}"] [data-gallery="domain"]`
        );
        // biome-ignore lint/performance/noAwaitInLoops: screenshots scroll the page, so they run one at a time.
        await expect(domain).toBeVisible();
        await domain.screenshot({
          animations: "disabled",
          path: `${SCREENSHOTS}/dev-ui-domain-${width}-${theme}.png`,
        });
        // One image per section too: the whole column is too tall to review.
        const sections = domain.locator(":scope > section");
        const count = await sections.count();
        for (let index = 0; index < count; index += 1) {
          const section = sections.nth(index);
          // biome-ignore lint/performance/noAwaitInLoops: screenshots scroll the page, so they run one at a time.
          await section.scrollIntoViewIfNeeded();
          // Thumbnails load lazily, once they are near the viewport.
          await section.evaluate((element) =>
            Promise.all(
              [...element.querySelectorAll("img")].map((image) =>
                image.complete
                  ? undefined
                  : image.decode().catch(() => undefined)
              )
            )
          );
          await section.screenshot({
            animations: "disabled",
            path: `${SCREENSHOTS}/dev-ui-domain-${width}-${theme}-${index}.png`,
          });
        }
      }
      expect(await blockingViolations(page, '[data-gallery="domain"]')).toEqual(
        []
      );
      expect(errors).toEqual([]);
    });
  }

  test("the ListPicker sheet opens in its column's theme", async ({ page }) => {
    const errors = watchErrors(page);
    await openGallery(page, 390);
    const dark = page.locator('[data-theme-column="dark"]');
    await dark.getByRole("button", { name: SAVE_TO_LIST }).click();
    const sheet = page.getByRole("dialog", { name: SAVE_TO_LIST });
    await expect(sheet).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: `${SCREENSHOTS}/dev-ui-domain-list-picker-dark.png`,
    });
    expect(await blockingViolations(page, '[role="dialog"]')).toEqual([]);
    expect(errors).toEqual([]);
  });
});
