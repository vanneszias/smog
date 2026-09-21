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
/**
 * How many times to try opening the tooltip before giving up and letting the
 * caller's own assertion report the failure.
 */
const HOVER_ATTEMPTS = 5;

/** How long one attempt waits for the tooltip before hovering again. */
const HOVER_ATTEMPT_MS = 1000;

/**
 * Hovers the trigger until a tooltip is actually open.
 *
 * **It used to hover exactly once, despite the name, and that made this file
 * flaky as soon as the suite grew.** A server-rendered trigger is inert until
 * React hydrates it: the hover lands on markup Radix has not wired up yet,
 * nothing opens, and the caller's `toBeVisible` spends its whole timeout
 * waiting for a tooltip that was never going to appear — the mouse is already
 * inside the trigger, so no further pointer-enter is coming.
 *
 * It is the same hazard `FavoriteButton` grew its `data-ready` attribute for,
 * and it does not announce itself: the test passes on an idle machine and
 * fails on a busy one. Measured, when Stage 5's sponsor spec was added ahead
 * of this file: flaky in 2 of 2 full runs, clean in 3 of 3 runs of this spec
 * alone, and clean in a full run with only that spec excluded. The dev server
 * was simply slower to serve this route.
 *
 * Retrying does **not** weaken what the test proves. The caller still asserts
 * the tooltip is visible, and every assertion after it is untouched; this only
 * stops the test depending on hydration having finished before the first
 * hover. Each attempt moves the pointer away first, because a hover that is
 * already inside the element produces no new pointer-enter for Radix to see.
 */
async function hoverUntilTooltipOpens(
  page: Page,
  trigger: Locator
): Promise<void> {
  await trigger.scrollIntoViewIfNeeded();

  const tooltip = page.getByRole("tooltip");

  for (let attempt = 0; attempt < HOVER_ATTEMPTS; attempt += 1) {
    await trigger.hover();

    const box = await trigger.boundingBox();
    if (box === null) {
      throw new Error("the tooltip trigger has no box to hover");
    }
    await page.mouse.move(
      box.x + box.width / 2 + 1,
      box.y + box.height / 2 + 1
    );

    try {
      await expect(tooltip).toBeVisible({ timeout: HOVER_ATTEMPT_MS });
      return;
    } catch {
      // Away from the trigger, so the next `hover` is a fresh pointer-enter.
      await page.mouse.move(0, 0);
    }
  }

  // Deliberately no throw: the caller asserts visibility itself, and its
  // failure names the locator and shows the call log. A throw here would
  // replace that with a less useful message.
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
