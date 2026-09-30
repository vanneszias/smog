import { expect, type Page, test } from "@playwright/test";
import {
  blockingViolations,
  ORIGIN,
  signInWithApi,
  stubMux,
  watchErrors,
} from "./helpers";

const SCREENSHOTS = "e2e/__screenshots__";
const WIDTHS = [390, 1280] as const;
const THEMES = ["light", "dark"] as const;
const DARK = /\bdark\b/;

const PAGES = [
  {
    heading: "Gebaren die je spraak ondersteunen",
    name: "home",
    path: "/",
    signedIn: false,
  },
  {
    heading: "Aanmelden of registreren",
    name: "sign-in",
    path: "/sign-in",
    signedIn: false,
  },
  { heading: "Je account", name: "account", path: "/account", signedIn: true },
] as const;

async function setTheme(page: Page, theme: string): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "theme", url: ORIGIN, value: theme }]);
}

test.describe("app shell", () => {
  // The home page shows featured gestures: answer their Mux stills locally.
  test.beforeEach(async ({ page }) => {
    await stubMux(page);
  });

  for (const { heading, name, path, signedIn } of PAGES) {
    for (const width of WIDTHS) {
      test(`${name} at ${width}px in light and dark`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.setViewportSize({ height: 900, width });
        if (signedIn) {
          await signInWithApi(page);
        }
        for (const theme of THEMES) {
          // biome-ignore lint/performance/noAwaitInLoops: one theme after the other on the same page.
          await setTheme(page, theme);
          await page.goto(path);
          await expect(
            page.getByRole("heading", { level: 1, name: heading })
          ).toBeVisible();
          await page.waitForLoadState("networkidle");
          // The server set the class: no flash, no script needed.
          const dark = await page.evaluate(() =>
            document.documentElement.classList.contains("dark")
          );
          expect(dark).toBe(theme === "dark");
          await page.screenshot({
            animations: "disabled",
            fullPage: true,
            path: `${SCREENSHOTS}/${name}-${width}-${theme}.png`,
          });
          expect(await blockingViolations(page)).toEqual([]);
        }
        expect(errors).toEqual([]);
      });
    }
  }

  test("system theme follows prefers-color-scheme before hydration", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      )
    ).toBe(true);
  });

  test("the theme and language menus save a cookie and apply at once", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Thema wijzigen" }).click();
    await page.getByRole("menuitemradio", { name: "Donker" }).click();
    await expect(page.locator("html")).toHaveClass(DARK);

    await page.getByRole("button", { name: "Taal wijzigen" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("navigation", { name: "Main navigation" })
    ).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveClass(DARK);
    const cookies = await page.context().cookies();
    const theme = cookies.find((cookie) => cookie.name === "theme");
    expect(theme?.value).toBe("dark");
    expect(theme?.sameSite).toBe("Lax");
    expect(errors).toEqual([]);
  });

  test("signed in, the language menu also saves the account's language (account.updateProfile)", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signInWithApi(page);
    await page.setViewportSize({ height: 900, width: 1280 });
    const calls: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/")) {
        calls.push(pathname);
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/account/updateProfile") &&
        response.ok()
    );
    await page.getByRole("button", { name: "Taal wijzigen" }).click();
    await page.getByRole("menuitemradio", { name: "Français" }).click();
    await saved;
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect(calls).not.toContain("/api/auth/update-user");

    // Another browser of this account, with no locale cookie: French.
    await page.context().clearCookies({ name: "locale" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect(errors).toEqual([]);
  });

  test("the mobile menu opens the sections in a sheet", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 390 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Menu openen" }).click();
    const sheet = page.getByRole("dialog", { name: "SMOG & Co" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Favorieten" })).toBeVisible();
    await sheet.getByRole("radio", { name: "Donker" }).click();
    await expect(page.locator("html")).toHaveClass(DARK);
  });
});
