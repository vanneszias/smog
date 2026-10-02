import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { stubMux, waitForHydration } from "./helpers";

const SCREENSHOTS = "e2e/__screenshots__";
const WIDTHS = [390, 1280] as const;
const THEMES = ["light", "dark"] as const;
const BLOCKING = new Set(["serious", "critical"]);
const SUCCESS_TOAST = /Melding tonen \(success\)/;
const NOTIFICATIONS = /Meldingen/;

/** Collects console errors and uncaught exceptions for the whole test. */
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
  // Hydrated: client-only state (the Chip toggles) responds.
  await page.waitForLoadState("networkidle");
  await waitForHydration(page);
}

async function blockingViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  const results = await (include
    ? builder.include(include)
    : builder
  ).analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    }));
}

test.describe("/dev/ui", () => {
  for (const width of WIDTHS) {
    test(`renders at ${width}px without console errors or serious axe violations`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await openGallery(page, width);

      for (const theme of THEMES) {
        const column = page.locator(`[data-theme-column="${theme}"]`);
        // biome-ignore lint/performance/noAwaitInLoops: screenshots scroll the page, so they run one at a time.
        await expect(column).toBeVisible();
        await column.screenshot({
          animations: "disabled",
          path: `${SCREENSHOTS}/dev-ui-${width}-${theme}.png`,
        });
      }

      expect(await blockingViolations(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("overlays open in their column's theme and pass axe", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openGallery(page, 1280);

    const dark = page.locator('[data-theme-column="dark"]');
    await dark.getByRole("button", { name: "Dialoog openen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Portalled inside the dark column, so it keeps the dark variables.
    await expect(dark.getByRole("dialog")).toBeVisible();
    expect(await blockingViolations(page, '[role="dialog"]')).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const light = page.locator('[data-theme-column="light"]');
    await light.locator('[aria-haspopup="menu"]').click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");

    await light.getByRole("button", { name: SUCCESS_TOAST }).click();
    await expect(
      page.getByRole("region", { name: NOTIFICATIONS }).getByText("Gekopieerd")
    ).toBeVisible();

    expect(errors).toEqual([]);
  });
});
