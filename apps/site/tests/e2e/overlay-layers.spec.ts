import { expect, type Locator, type Page, test } from "@playwright/test";

const KITCHEN_SINK = "http://localhost:3003/kitchen-sink";

/**
 * Puts the pointer on `trigger` and then nudges it one pixel.
 *
 * Radix opens a tooltip from `onPointerMove`, not from `pointerover`. A single
 * `hover()` on a page whose virtual mouse has never moved arrives at the
 * trigger without a move *over* it, and the tooltip silently stays shut — a
 * failure that looks exactly like the bug this file is about and is not.
 * Measured on chromium: hover alone opens nothing, hover plus one pixel opens
 * it every time.
 */
async function hoverUntilTooltipOpens(
  page: Page,
  trigger: Locator
): Promise<void> {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.hover();

  const box = await trigger.boundingBox();
  if (box === null) {
    throw new Error("the tooltip trigger has no box to hover");
  }
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1);
}

/**
 * The duplicate-layer regression.
 *
 * `@radix-ui/react-dismissable-layer` keeps the stack of open layers in a
 * module-level context. Install two copies and there are two stacks, each of
 * which believes its own newest layer is the top one. An open tooltip from
 * copy A then answers Escape first and calls `preventDefault()`, and the
 * dialog from copy B — which dismisses only `if (!event.defaultPrevented)` —
 * declines to close. The user presses Escape and nothing happens.
 *
 * Neither component's own tests can see this: both are correct in isolation.
 * It needs the two of them open at once in one document, which is what the
 * kitchen sink's layer probe exists for.
 */
test("Escape closes a dialog even while a tooltip is open", async ({
  page,
}) => {
  await page.goto(KITCHEN_SINK);

  const tooltipTrigger = page.getByTestId("layer-probe-tooltip-trigger");
  const dialogTrigger = page.getByTestId("layer-probe-dialog-trigger");
  const dialog = page.getByRole("dialog", { name: "Laag-probe" });

  await hoverUntilTooltipOpens(page, tooltipTrigger);
  await expect(page.getByRole("tooltip")).toBeVisible();

  // Open the dialog from the keyboard rather than with a click. A click moves
  // the pointer off the tooltip trigger, which closes the tooltip before the
  // dialog is up — so a click can never get the two layers on screen together,
  // and a test written that way passes whatever is installed. `press` leaves
  // the pointer where it is.
  await dialogTrigger.press("Enter");
  await expect(dialog).toBeVisible();

  // The tooltip must still be mounted at this point, or Escape has only one
  // layer to reach and the test proves nothing. Queried by attribute rather
  // than by role: Radix marks everything outside an open dialog
  // `aria-hidden`, so `getByRole("tooltip")` finds nothing here even while the
  // element — and its dismissable layer — is very much alive.
  await expect(page.locator('[role="tooltip"]')).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
