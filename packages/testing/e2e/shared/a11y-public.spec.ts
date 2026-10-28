import { devices, expect, type Page, test } from "@playwright/test";
import {
  byRule,
  type Finding,
  GUEST_ROUTES,
  newPublicPage,
  openPublic,
  overlay,
  quiet,
  STATES_MS,
  scan,
  scanThemes,
  useSharedGuestPage,
} from "../../support/e2e/a11y-support";
import { WIDTHS } from "../../support/e2e/admin";
import {
  signInWithApi,
  stubMux,
  stubMuxStream,
  waitForApp,
} from "../../support/e2e/helpers";

const VIDEO_NAME = /^Naam in de video/;
const FULL_NAME = /^Volledige naam/;
const EMAIL = /^E-mail$/;

/*
 * Public accessibility (phase 9 task 5): axe over every public route and
 * state, light and dark at 390 and 1280 px, with no serious or critical
 * violation (and the blocking rules of helpers.ts). One test per route or
 * state and width, so a failure or a hang names where it happened and each
 * test is bounded on its own (a runner a few times slower than a developer's
 * machine does not turn one long test into a timeout). Each page is loaded
 * once and scanned in both themes (`scanThemes`). Sponsor token pages are
 * phase 9 task 7's; the web has no offline banner (mobile only, DECISIONS)
 * and the kit's is scanned by `dev-ui.spec.ts`.
 */

const IPHONE = devices["iPhone 15"].userAgent;
const CONSENT = "Help SMOG verbeteren";
const DECLINE = "Alleen noodzakelijke";
/** The body of a test: the page, and where its findings go. */
type Body = (page: Page, found: Finding[]) => Promise<void>;

/** The shared guest page on `path`: runs `body`, then asserts what it found. */
async function onGuestPage(
  shared: ReturnType<typeof useSharedGuestPage>,
  path: string,
  body: Body
): Promise<void> {
  const page = shared.page();
  const found: Finding[] = [];
  await openPublic(page, path);
  await body(page, found);
  expect(byRule(found)).toEqual([]);
  expect(quiet(shared.errors)).toEqual([]);
}

test.describe("axe: guest routes", () => {
  for (const width of WIDTHS) {
    test.describe(`at ${width} px`, () => {
      const shared = useSharedGuestPage(width);
      for (const { name, path } of GUEST_ROUTES) {
        test(`${name}, light and dark`, async () => {
          const page = shared.page();
          await openPublic(page, path);
          const found = await scanThemes(page, name);
          expect(byRule(found)).toEqual([]);
          // The 404 document's own status is what Chromium logs as an error.
          if (name !== "not-found") {
            expect(quiet(shared.errors)).toEqual([]);
          }
        });
      }
    });
  }
});

test.describe("axe: guest overlays and banners", () => {
  for (const width of WIDTHS) {
    test.describe(`at ${width} px`, () => {
      const gesture = "/gestures/hond";
      // One page for the gesture-page states of this width (each test opens
      // the path again, so none depends on the one before).
      const shared = useSharedGuestPage(width);

      if (width < 768) {
        test(`the phone's menu sheet at ${width} px`, async () => {
          test.setTimeout(STATES_MS);
          await onGuestPage(shared, gesture, async (page, found) => {
            await overlay(
              page,
              found,
              "header:menu-sheet",
              () => page.getByRole("button", { name: "Menu openen" }).click(),
              () => expect(page.getByRole("dialog")).toBeVisible()
            );
          });
        });
      }

      // The one settings menu (phase 10a): Sign in, Sponsor, language, theme.
      test(`the settings menu at ${width} px`, async () => {
        test.setTimeout(STATES_MS);
        await onGuestPage(shared, gesture, async (page, found) => {
          await overlay(
            page,
            found,
            "header:settings-menu",
            () => page.getByRole("button", { name: "Instellingen" }).click(),
            () => expect(page.getByRole("menu")).toBeVisible()
          );
        });
      });

      test(`the save-to-list sign-in prompt at ${width} px`, async () => {
        test.setTimeout(STATES_MS);
        await onGuestPage(shared, gesture, async (page, found) => {
          await overlay(
            page,
            found,
            "gesture:save-to-list-sign-in",
            () =>
              page.getByRole("button", { name: "Opslaan in lijst" }).click(),
            () => expect(page.getByRole("dialog")).toBeVisible()
          );
        });
      });

      // The QR dialog (a lazy file of phase 9 task 6: findings go to the controller).
      test(`the QR dialog at ${width} px`, async () => {
        test.setTimeout(STATES_MS);
        await onGuestPage(shared, gesture, async (page, found) => {
          await overlay(
            page,
            found,
            "gesture:qr-dialog",
            () => page.getByRole("button", { name: "QR-code" }).click(),
            () => expect(page.getByRole("dialog")).toBeVisible()
          );
        });
      });

      // A toast: the guest's favorite.
      test(`the guest's favorite toast at ${width} px`, async () => {
        test.setTimeout(STATES_MS);
        await onGuestPage(shared, gesture, async (page, found) => {
          await page
            .getByRole("main")
            .getByRole("button", { exact: true, name: "Favoriet" })
            .first()
            .click();
          found.push(...(await scanThemes(page, "gesture:favorited")));
        });
      });

      test(`the consent banner at ${width} px`, async ({ browser }) => {
        const { context, page } = await newPublicPage(browser, "light", width, {
          consent: false,
        });
        try {
          const found: Finding[] = [];
          await page.goto("/");
          await waitForApp(page);
          await expect(
            page.getByRole("region", { name: CONSENT })
          ).toBeVisible();
          found.push(...(await scanThemes(page, "consent-banner:home")));
          await page.goto("/privacy");
          await waitForApp(page);
          await expect(
            page.getByRole("region", { name: CONSENT })
          ).toBeVisible();
          found.push(...(await scanThemes(page, "consent-banner:privacy")));
          expect(byRule(found)).toEqual([]);
        } finally {
          await context.close();
        }
      });
    });
  }

  test("the app banner and the open-in-app banner on a phone", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: "light",
      hasTouch: true,
      isMobile: true,
      locale: "nl-BE",
      reducedMotion: "reduce",
      userAgent: IPHONE,
      viewport: { height: 844, width: 390 },
    });
    try {
      const page = await context.newPage();
      await stubMux(page);
      await stubMuxStream(page);
      const found: Finding[] = [];
      await page.goto("/");
      await waitForApp(page);
      await page.getByRole("button", { name: DECLINE }).click();
      await expect(
        page.getByRole("region", {
          name: "SMOG is nu beschikbaar op je telefoon!",
        })
      ).toBeVisible();
      found.push(...(await scanThemes(page, "app-banner")));
      await page.goto("/gestures/hond");
      await waitForApp(page);
      await expect(
        page.getByRole("link", { name: "Open in de app" })
      ).toBeVisible();
      found.push(...(await scanThemes(page, "open-in-app-banner")));
      expect(byRule(found)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("the guest import sheet after sign-in", async ({ browser }) => {
    const { context, page } = await newPublicPage(browser, "light", 390, {
      consent: false,
    });
    try {
      await page.addInitScript(() => {
        localStorage.setItem(
          "smog:guest:v1",
          JSON.stringify({
            consent: { analytics: false, decidedAt: Date.now() },
            favorites: ["e2e-unknown-gesture"],
            lists: [],
            preferences: {
              importDismissedFor: [],
              locale: null,
              theme: "system",
            },
            recentSearches: [],
            version: 2,
          })
        );
      });
      await signInWithApi(page);
      await page.goto("/");
      await waitForApp(page);
      await expect(
        page.getByRole("dialog", { name: "Je gegevens meenemen?" })
      ).toBeVisible();
      const found = await scanThemes(page, "guest-import-sheet");
      expect(byRule(found)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

test("the axe helper is not blind: a button without a name is found", async ({
  page,
}) => {
  await page.setContent(
    '<!doctype html><html lang="nl"><title>t</title><main><h1>t</h1><button type="button"></button></main></html>'
  );
  const found = await scan(page, "self-test");
  expect(found.map((finding) => finding.id)).toContain("button-name");
});

test.describe("axe: the error boundary", () => {
  for (const width of WIDTHS) {
    test(`a failed page load at ${width} px`, async ({ browser }) => {
      const { context, page } = await newPublicPage(browser, "light", width);
      try {
        await openPublic(page, "/");
        // The client-side navigation's loader fails: the route's error state.
        await page.route("**/api/rpc/**", (route) => route.abort());
        await page
          .getByRole("link", { name: "Gebaren" })
          .first()
          .click()
          .catch(() =>
            page.getByRole("link", { name: "Gebaren" }).first().click()
          );
        await expect(
          page.getByRole("heading", { name: "Er ging iets mis" })
        ).toBeVisible();
        const found = await scanThemes(page, "error-boundary");
        expect(byRule(found)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("axe: sponsor wizard steps", () => {
  for (const width of WIDTHS) {
    test(`steps 1 to 3 at ${width} px`, async ({ browser }) => {
      test.setTimeout(STATES_MS);
      const { context, page } = await newPublicPage(browser, "light", width);
      try {
        const found: Finding[] = [];
        await openPublic(page, "/sponsor?gesture=blij");
        found.push(...(await scanThemes(page, "sponsor:1-select")));
        await page
          .getByRole("button", { exact: true, name: "Doorgaan" })
          .click();
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Configureer je sponsoring",
          })
        ).toBeVisible();
        found.push(...(await scanThemes(page, "sponsor:2-details")));
        // The errors the form shows on an empty submit.
        await page
          .getByRole("button", { name: "Doorgaan naar voorbeeld" })
          .click();
        found.push(...(await scanThemes(page, "sponsor:2-details-errors")));
        await page.getByLabel(VIDEO_NAME).fill("Bakkerij Jansen");
        await page.getByLabel(FULL_NAME).fill("Jan Jansen");
        await page.getByLabel(EMAIL).fill("a11y-sponsor@example.test");
        await page
          .getByRole("button", { name: "Doorgaan naar voorbeeld" })
          .click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Bekijk je sponsoring" })
        ).toBeVisible();
        await page.waitForLoadState("networkidle");
        found.push(...(await scanThemes(page, "sponsor:3-review")));
        expect(byRule(found)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("axe: sampled hover, focus and disabled states", () => {
  test("a hovered and a focused control keep their contrast, in both themes", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      const found: Finding[] = [];
      await openPublic(page, "/sign-in");
      const primary = page.getByRole("button", { name: "Doorgaan" }).first();
      await primary.hover();
      found.push(...(await scanThemes(page, "hover:primary-button")));
      await page.getByRole("link", { name: "Mijn ruimte" }).first().hover();
      found.push(...(await scanThemes(page, "hover:nav-link")));
      await page.getByRole("link", { name: "Gebaren" }).first().focus();
      found.push(...(await scanThemes(page, "focus:nav-link")));
      // Disabled: the sponsor wizard's "Doorgaan" before a gesture is chosen.
      await openPublic(page, "/sponsor");
      await expect(
        page.getByRole("button", { exact: true, name: "Doorgaan" })
      ).toBeDisabled();
      found.push(...(await scanThemes(page, "disabled:sponsor-continue")));
      expect(byRule(found)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
