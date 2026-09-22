import { expect, test } from "@playwright/test";
import { getPayload } from "payload";
import config from "../../src/payload.config.js";
import { withBusyRetry } from "../helpers/d1Retry";
import { seedConsent } from "../helpers/seedConsent";

const SITE = "http://localhost:3003";
const DAY = 24 * 60 * 60 * 1000;

/**
 * The sponsor wizard's first three screens, in a real browser.
 *
 * **Nothing else covers these pages.** `sponsorships.int.test.ts` drives the
 * endpoints through `handleEndpoints`, which proves the handlers and proves
 * nothing at all about the forms that reach them — and this wizard leans on
 * two pieces of plain HTML that a unit test cannot see: `formaction` /
 * `formmethod` on the submit buttons, which is what lets one form both filter
 * the list and post the order, and checkboxes surviving a page turn because
 * they travel in the GET the pager submits. Both work with scripting off and
 * both are invisible to Vitest.
 *
 * It stops at the review screen and never presses "Betalen": the next step is
 * a real `POST https://api.mollie.com/v2/payments`, which a test suite has no
 * business making. `sponsorships.int.test.ts` stubs Mollie at `fetch` and
 * covers everything past that button.
 */
test.describe("Sponsor wizard", () => {
  const run = crypto.randomUUID().slice(0, 8);
  const categoryName = `E2E sponsor ${run}`;
  let categoryId = "";
  let soldGestureName = "";

  test.beforeAll(async () => {
    const payload = await getPayload({ config });

    /*
     * Its own category, so the spec can filter the list down to rows it put
     * there. The dev server's D1 at `.wrangler/state/v3` is whatever the last
     * person left behind, and a wizard spec that ticks "the first two cards"
     * of a shared list is a spec that passes on one machine.
     */
    const category = await withBusyRetry(
      "create the sponsor e2e category",
      () =>
        payload.create({
          collection: "categories",
          data: { isActive: true, name: categoryName },
          locale: "nl",
        })
    );
    categoryId = String(category.id);

    const gesture = (name: string, slug: string) =>
      withBusyRetry(`create sponsor e2e gesture ${slug}`, () =>
        payload.create({
          collection: "gestures",
          data: {
            categories: [category.id],
            isActive: true,
            name,
            playbackId: `pb-e2e-sponsor-${run}-${slug}`,
          },
          locale: "nl",
        })
      );

    // Thirteen, so the list runs to a second page at twelve per page and the
    // "a tick survives the pager" test has somewhere to go.
    for (let index = 0; index < 13; index += 1) {
      await gesture(`E2E te sponsoren ${index} ${run}`, String(index));
    }

    /*
     * The sold one is named so that it sorts *first* — `fetchGestures` orders
     * by `["name", "id"]`, so a "99" would land on page two and this spec's
     * assertions about page one would be about nothing at all. It is the kind
     * of fixture detail that makes a test pass by never reaching its subject.
     */
    soldGestureName = `E2E al vergeven ${run}`;
    const sold = await gesture(soldGestureName, "sold");

    await withBusyRetry("sponsor one of them", () =>
      payload.create({
        collection: "sponsorships",
        data: {
          contactFullName: "Jan Janssens",
          durationYears: 1,
          endDate: new Date(Date.now() + 300 * DAY).toISOString(),
          gesture: sold.id,
          originalVideoPlaybackId: `pb-e2e-sponsor-${run}-sold`,
          overlayText: `Al vergeven ${run}`,
          paymentAmount: 5000,
          sponsorEmail: `sold-${run}@example.test`,
          sponsorName: `Al vergeven ${run}`,
          startDate: new Date().toISOString(),
          status: "active",
        },
      })
    );
  });

  const filtered = `${SITE}/nl/sponsor?category=`;

  test("walks a selection through to the review step", async ({ page }) => {
    // Not what this test is about — see `seedConsent`'s own comment.
    await seedConsent(page);
    await page.goto(`${filtered}${categoryId}`);

    const boxes = page.getByTestId("sponsor-gesture-checkbox");
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByTestId("sponsor-continue").click();

    // Step 2 names both gestures, out of the URL and nothing else.
    await expect(page).toHaveURL(/\/nl\/sponsor\/details\?gestures=/);
    await expect(page.getByTestId("sponsor-chosen").locator("li")).toHaveCount(
      2
    );

    await page.getByTestId("sponsor-name").fill("Acme NV");
    await page.getByTestId("sponsor-contact").fill("Jan Janssens");
    await page.getByTestId("sponsor-email").fill("jan@example.test");
    await page.getByTestId("sponsor-to-preview").click();

    await expect(page).toHaveURL(`${SITE}/nl/sponsor/preview`);
    // The details crossed the redirect, which is the draft cookie working.
    await expect(page.getByTestId("review-sponsor-name")).toHaveText("Acme NV");
    // Two gestures at €50 each, the price `lib/pricing.ts` transcribes.
    await expect(page.getByTestId("sponsor-total")).toContainText("100,00");
    // One preview per gesture, each showing the overlay text as HTML over the
    // *original* video — the Stage 5 half of `lib/renderPreview.ts`'s seam.
    await expect(page.getByTestId("sponsor-preview-overlay")).toHaveCount(2);
    await expect(
      page.getByTestId("sponsor-preview-overlay").first()
    ).toHaveText("Acme NV");
  });

  test("keeps a ticked gesture when the sponsor turns the page", async ({
    page,
  }) => {
    await page.goto(`${filtered}${categoryId}`);

    const first = page.getByTestId("sponsor-gesture-checkbox").first();
    await first.check();
    const chosen = await first.inputValue();

    await page.getByRole("button", { exact: true, name: "2" }).click();

    await expect(page).toHaveURL(/page=2/);
    // Present, not merely "not unticked": the gesture is off this page
    // entirely, so what has to exist is a hidden field carrying it. Asserting
    // the checkbox is still checked would pass on a page that renders neither.
    await expect(
      page.locator(`input[name="gestureId"][value="${chosen}"]`)
    ).toHaveCount(1);
  });

  test("offers no checkbox for a gesture that is already sponsored", async ({
    page,
  }) => {
    await page.goto(`${filtered}${categoryId}`);

    const sold = page.getByRole("list", { name: "Al gesponsorde gebaren" });

    // The positive assertion first: the gesture is on the page, under the
    // heading that says why. A `toBeHidden()` on the checkbox alone would be
    // satisfied by a page that rendered nothing at all.
    await expect(sold).toContainText(soldGestureName);
    await expect(sold.locator("> li")).toHaveCount(1);
    await expect(sold.locator('input[type="checkbox"]')).toHaveCount(0);
    // And the rest of the page is selectable, so the split is a split rather
    // than a page that dropped everything. Twelve rows a page, one of them
    // sold, leaves eleven with a checkbox.
    await expect(
      page.getByRole("list", { name: "Beschikbare gebaren" }).locator("> li")
    ).toHaveCount(11);
  });

  test("sends an empty selection back with a reason", async ({ page }) => {
    await page.goto(`${filtered}${categoryId}`);

    await page.getByTestId("sponsor-continue").click();

    await expect(page).toHaveURL(`${SITE}/nl/sponsor?error=empty`);
    await expect(page.getByTestId("sponsor-error")).toHaveText(
      "Kies minstens een gebaar om te sponsoren."
    );
  });

  test("sends a sponsor with no draft back to the beginning", async ({
    page,
  }) => {
    // Step 3 has nothing to show without the cookie step 2 sets — a bookmark,
    // an expired hour, or somebody typing the URL. The only useful answer is
    // the start of the wizard, and a 404 would be the wrong one.
    await page.context().clearCookies();
    await page.goto(`${SITE}/nl/sponsor/preview`);

    await expect(page).toHaveURL(`${SITE}/nl/sponsor`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sponsor een gebaar"
    );
  });

  /**
   * The re-edit link, which is the one page on this wizard nobody arrives at
   * by walking the steps: it is a capability URL out of a mail, weeks later,
   * with no cookie and no session behind it.
   */
  test("lets a token holder resubmit, and kills the link behind them", async ({
    page,
  }) => {
    // Not what this test is about — see `seedConsent`'s own comment.
    await seedConsent(page);

    const payload = await getPayload({ config });
    const token = crypto.randomUUID();

    const gesture = await withBusyRetry("create the re-edit gesture", () =>
      payload.create({
        collection: "gestures",
        data: {
          // `Number`, not the id as it arrives: `isValidID` requires
          // `typeof value === "number"` for a numeric key.
          categories: [Number(categoryId)],
          isActive: true,
          name: `E2E herwerken ${run}`,
          playbackId: `pb-e2e-re-edit-${run}`,
        },
        locale: "nl",
      })
    );

    const sponsorship = await withBusyRetry("create the re-edit row", () =>
      payload.create({
        collection: "sponsorships",
        data: {
          contactFullName: "Jan Janssens",
          durationYears: 1,
          endDate: new Date(Date.now() + 300 * DAY).toISOString(),
          gesture: gesture.id,
          originalVideoPlaybackId: `pb-e2e-re-edit-${run}`,
          overlayText: "Acme NV",
          paymentAmount: 5000,
          reEditToken: token,
          reEditTokenExpiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
          sponsorEmail: `re-edit-${run}@example.test`,
          sponsorName: "Acme NV",
          startDate: new Date().toISOString(),
          status: "pending_resubmission",
        },
      })
    );

    await page.context().clearCookies();
    await page.goto(`${SITE}/nl/sponsor/re-edit?token=${token}`);

    await expect(page.getByTestId("re-edit-for")).toHaveText(
      `E2E herwerken ${run}`
    );
    await page.getByTestId("re-edit-name").fill("Acme herwerkt");
    await page.getByTestId("re-edit-submit").click();

    await expect(page).toHaveURL(`${SITE}/nl/sponsor/re-edit?notice=sent`);
    await expect(page.getByTestId("re-edit-sent")).toBeVisible();

    const row = await withBusyRetry("read the resubmitted row", () =>
      payload.findByID({
        collection: "sponsorships",
        id: sponsorship.id,
        overrideAccess: true,
      })
    );

    expect(row.status).toBe("pending_approval");
    expect(row.sponsorName).toBe("Acme herwerkt");

    // And the link is spent. Not `toBeHidden()` on the form — that would pass
    // on a page that rendered nothing at all — but the sentence the page
    // shows instead.
    await page.goto(`${SITE}/nl/sponsor/re-edit?token=${token}`);
    await expect(page.getByTestId("re-edit-invalid")).toBeVisible();
  });

  test("tells a stranger with no token the same thing as a spent one", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto(`${SITE}/nl/sponsor/re-edit`);

    await expect(page.getByTestId("re-edit-invalid")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Deze link werkt niet meer"
    );
  });
});
