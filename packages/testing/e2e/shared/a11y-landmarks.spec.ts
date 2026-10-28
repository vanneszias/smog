import { expect, test } from "@playwright/test";
import {
  newPublicPage,
  openPublic,
  STATES_MS,
  STEP_MS,
  useSharedPage,
} from "../../support/e2e/a11y-support";
import { stubMux, stubMuxStream } from "../../support/e2e/helpers";

const MIJN_RUIMTE = /Mijn ruimte/;
const GEBAAR = /gebaar/;
const NO_RESULTS = /geen|Geen/;
const SUBMIT = /Doorgaan|Account maken/;

/*
 * Landmarks, titles and the language (phase 9 task 5): the page structure
 * every route shares (one `main`, a header and a footer, one `h1`, a
 * localised and unique title, `lang` follows the language), live regions
 * and form errors tied to their field.
 */

const TITLED = [
  "/",
  "/gestures",
  "/gestures/hond",
  "/my",
  "/account",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password?token=e2e",
  "/verify-email",
  "/privacy",
  "/terms",
  "/sponsor",
] as const;

test.describe("landmarks, titles and the language", () => {
  const LOCALES = [
    { accept: "nl-BE", lang: "nl", skip: "Naar de inhoud" },
    { accept: "en-GB", lang: "en", skip: "Skip to content" },
    { accept: "fr-BE", lang: "fr", skip: "Aller au contenu" },
  ] as const;

  for (const { accept, lang, skip } of LOCALES) {
    test.describe(`in ${lang}`, () => {
      const shared = useSharedPage(async (browser) => {
        const context = await browser.newContext({
          locale: accept,
          viewport: { height: 900, width: 1280 },
        });
        context.setDefaultTimeout(STEP_MS);
        const page = await context.newPage();
        await stubMux(page);
        await stubMuxStream(page);
        return { context, page };
      });

      for (const path of TITLED) {
        test(`${path} has one main, a header, a footer, one h1 and a ${lang} title`, async () => {
          const page = shared.page();
          await openPublic(page, path);
          await expect(page.locator("html")).toHaveAttribute("lang", lang);
          await expect(page.getByRole("main")).toHaveCount(1);
          await expect(page.getByRole("banner")).toHaveCount(1);
          await expect(page.getByRole("contentinfo")).toHaveCount(1);
          await expect(
            page.getByRole("heading", { level: 1 }),
            path
          ).toHaveCount(1);
          await expect(page.getByRole("link", { name: skip })).toHaveCount(1);
          expect((await page.title()).trim(), path).not.toBe("");
          // Localised: a language's titles are not the Dutch ones.
          if (lang !== "nl" && path === "/my") {
            expect(await page.title()).not.toMatch(MIJN_RUIMTE);
          }
        });
      }

      test("no two routes share a title", async () => {
        test.setTimeout(STATES_MS);
        const page = shared.page();
        const titles = new Map<string, string>();
        for (const path of TITLED) {
          // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
          await openPublic(page, path);
          const title = await page.title();
          expect(
            [...titles.values()],
            `${path}: "${title}" repeats`
          ).not.toContain(title);
          titles.set(path, title);
        }
      });
    });
  }

  test("live regions exist for toasts and for the result count", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await openPublic(page, "/gestures?q=hond");
      const count = page.getByRole("status").filter({ hasText: GEBAAR });
      await expect(count.first()).toBeVisible();
      // The toast viewport is a named region, present before any toast.
      await expect(
        page.getByRole("region", { name: "Meldingen" })
      ).toBeAttached();
      await page
        .getByRole("searchbox", { name: "Zoek een gebaar" })
        .fill("zzzzqxj");
      await expect(
        page.getByRole("status").filter({ hasText: NO_RESULTS }).first()
      ).toBeAttached();
    } finally {
      await context.close();
    }
  });

  test("form errors are tied to their field with aria-describedby", async ({
    browser,
  }) => {
    const { context, page } = await newPublicPage(browser, "light", 1280);
    try {
      await openPublic(page, "/sign-up");
      await page
        .getByRole("textbox", { name: "E-mailadres" })
        .fill("geen-adres");
      await page.getByRole("button", { name: SUBMIT }).first().click();
      const email = page.getByRole("textbox", { name: "E-mailadres" });
      await expect(email).toHaveAttribute("aria-invalid", "true");
      const id = (await email.getAttribute("aria-describedby"))?.split(" ")[0];
      await expect(page.locator(`[id="${id}"]`)).toHaveAttribute(
        "role",
        "alert"
      );
      await expect(page.locator(`[id="${id}"]`)).not.toBeEmpty();
    } finally {
      await context.close();
    }
  });
});
