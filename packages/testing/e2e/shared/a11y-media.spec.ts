import { expect, test } from "@playwright/test";
import {
  byRule,
  newPublicPage,
  openPublic,
  scanThemes,
} from "../../support/e2e/a11y-support";
import { WIDTHS } from "../../support/e2e/admin";
import {
  createGesture,
  deleteGesture,
  letters,
  type MadeGesture,
  uploadClip,
} from "../../support/e2e/audio";
import { ORIGIN } from "../../support/e2e/helpers";
import { signInAsAdmin } from "../../support/e2e/maintenance";
import { mp3Bytes } from "../../support/translation/fixtures";

/*
 * The name over the video and the audio button (phase 10b task 6), in
 * Belgian Dutch: axe over a textless gesture page with the overlay, the
 * toggle and a clip (light and dark, 390 and 1280 px), the overlay as
 * decoration that never repeats the accessible name, and its fade that is
 * gone under `prefers-reduced-motion`. The pill behind the name is solid,
 * so the contrast does not depend on the video frame: axe's colour check
 * reads the pill, and the pair is in `@smog/styles/contrast`.
 */

const NAME = `Zz media ${letters(8)}`;
const OVERLAY = '[data-slot="video-name-overlay"]';
const PILL = `${OVERLAY} span`;

let made: MadeGesture | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
  made = await createGesture(request, {
    name: NAME,
    published: true,
    textless: true,
  });
  await uploadClip(request, {
    bytes: mp3Bytes(1),
    contentType: "audio/mpeg",
    gestureId: made.id,
    locale: "nl",
  });
});

test.afterAll(async ({ request }) => {
  if (made) {
    await signInAsAdmin(request);
    await deleteGesture(request, made);
    made = null;
  }
});

for (const width of WIDTHS) {
  test(`axe: the gesture page with the overlay, the toggle and the audio button at ${width} px, light and dark`, async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", width);
    try {
      await openPublic(page, `/gestures/${made?.slug}`);
      await expect(page.locator(OVERLAY)).toHaveText(NAME);
      await expect(
        page.getByRole("button", { name: "Uitspraak beluisteren" })
      ).toBeVisible();
      await expect(
        page.getByRole("switch", { name: "Naam in de video tonen" })
      ).toBeVisible();
      const found = await scanThemes(page, `gesture-media ${width}`);
      expect(byRule(found)).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("the overlay is decoration: the name has one accessible reading, not two", async ({
  browser,
}) => {
  const { context, page } = await newPublicPage(browser, "light", 1280);
  try {
    await openPublic(page, `/gestures/${made?.slug}`);
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toHaveAttribute("aria-hidden", "true");
    // The page's name is its h1 and the video frame's label; the overlay
    // is neither in the accessibility tree nor in the way of the controls.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
    await expect(page.getByRole("region", { name: NAME })).toHaveCount(1);
    await expect(page.getByText(NAME, { exact: true })).toHaveCount(2);
    expect(
      await overlay.evaluate((node) => getComputedStyle(node).pointerEvents)
    ).toBe("none");
  } finally {
    await context.close();
  }
});

test("the name fades in, and does not under prefers-reduced-motion", async ({
  browser,
}) => {
  const { context, page } = await newPublicPage(browser, "light", 1280);
  try {
    // The public contexts of this suite ask for reduced motion by default.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openPublic(page, `/gestures/${made?.slug}`);
    await expect(page.locator(PILL)).toBeVisible();
    const animated = await page
      .locator(PILL)
      .evaluate((node) => getComputedStyle(node).animationName);
    expect(animated).toContain("fade-in");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await openPublic(page, `/gestures/${made?.slug}`);
    await expect(page.locator(PILL)).toBeVisible();
    const still = await page
      .locator(PILL)
      .evaluate((node) => getComputedStyle(node).animationName);
    expect(still).toBe("none");
  } finally {
    await context.close();
  }
});

test("the page loads no source the CSP does not already allow", async ({
  browser,
}) => {
  const { context, page } = await newPublicPage(browser, "light", 1280);
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) {
      violations.push(message.text());
    }
  });
  try {
    await openPublic(page, `/gestures/${made?.slug}`);
    const [response] = await Promise.all([
      page.waitForResponse((candidate) =>
        candidate.url().includes("/api/audio/")
      ),
      page.getByRole("button", { name: "Uitspraak beluisteren" }).click(),
    ]);
    // Same origin: `media-src 'self'` covers it, no new source.
    expect(new URL(response.url()).origin).toBe(ORIGIN);
    expect(violations).toEqual([]);
  } finally {
    await context.close();
  }
});
