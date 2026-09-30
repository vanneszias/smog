import { readFile } from "node:fs/promises";
import {
  type APIRequestContext,
  expect,
  type Page,
  type Request,
  test,
} from "@playwright/test";
import {
  blockingViolations,
  ORIGIN,
  otpFor,
  uniqueEmail,
  verifyLinkFor,
  watchErrors,
} from "./helpers";

const STORE_KEY = "smog:guest:v1";
const EXPORT_FILE = /^smog-export-\d{4}-\d{2}-\d{2}\.json$/;
const BANNER = "Help SMOG verbeteren";
const ALLOW = "Statistieken toestaan";
const DECLINE = "Alleen noodzakelijke";
const PASSWORD = "e2e-password-1234";
const HEADERS = { origin: ORIGIN };

/** Every request to the analytics relay. */
function recordRelay(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/analytics") {
      requests.push(request);
    }
  });
  return requests;
}

function storedConsent(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).consent?.analytics : undefined;
  }, STORE_KEY);
}

/** One oRPC call over HTTP, as the site's client makes it. */
async function rpc(
  request: APIRequestContext,
  path: string,
  input: unknown = {}
): Promise<{ status: number; json: unknown }> {
  const response = await request.post(`/api/rpc/${path}`, {
    data: { json: input },
    headers: HEADERS,
  });
  const body = (await response.json()) as { json: unknown };
  return { json: body.json, status: response.status() };
}

async function firstGestureId(request: APIRequestContext): Promise<string> {
  const { json } = await rpc(request, "gestures/list", {});
  const [first] = (json as { items: { id: string }[] }).items;
  if (!first) {
    throw new Error("the dev seed has no gestures");
  }
  return first.id;
}

/** A new password account, verified by email and signed in on `page`. */
async function signUpWithPassword(page: Page): Promise<string> {
  const email = uniqueEmail();
  const signedUp = await page.request.post("/api/auth/sign-up/email", {
    data: { callbackURL: "/", email, name: "E2E", password: PASSWORD },
    headers: HEADERS,
  });
  expect(signedUp.ok()).toBe(true);
  await page.goto(await verifyLinkFor(page.request, email));
  return email;
}

/** Decides for the banner up front, so it does not cover the page. */
async function decideConsent(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify({
          consent: { analytics: false, decidedAt: Date.now() },
          favorites: [],
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
    }
  }, STORE_KEY);
}

/** Review screenshots (gitignored); `SCREENSHOTS_DIR` sends them elsewhere. */
const SCREENSHOTS = process.env.SCREENSHOTS_DIR ?? "e2e/__screenshots__";

async function setTheme(page: Page, theme: string): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "theme", url: ORIGIN, value: theme }]);
}

test.describe("screenshots", () => {
  for (const width of [390, 1280] as const) {
    test(`/account and the banner at ${width}px in light and dark`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ height: 900, width });
      for (const theme of ["light", "dark"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one theme after the other on the same page.
        await setTheme(page, theme);
        await page.goto("/account");
        await expect(page.getByRole("region", { name: BANNER })).toBeVisible({
          timeout: 15_000,
        });
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          animations: "disabled",
          path: `${SCREENSHOTS}/banner-${width}-${theme}.png`,
        });
        await page.screenshot({
          animations: "disabled",
          fullPage: true,
          path: `${SCREENSHOTS}/account-guest-${width}-${theme}.png`,
        });
      }
      await signUpWithPassword(page);
      // Signed in, the decision goes to the account: made once.
      await page
        .getByRole("region", { name: BANNER })
        .getByRole("button", { name: DECLINE })
        .click();
      for (const theme of ["light", "dark"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one theme after the other on the same page.
        await setTheme(page, theme);
        await page.goto("/account");
        await expect(
          page.getByRole("region", { name: "Profiel" })
        ).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          animations: "disabled",
          fullPage: true,
          path: `${SCREENSHOTS}/account-${width}-${theme}.png`,
        });
        await page
          .getByRole("button", { name: "Mijn account verwijderen" })
          .click();
        await page.getByLabel("Typ DELETE om te bevestigen").fill("DEL");
        await page.screenshot({
          animations: "disabled",
          path: `${SCREENSHOTS}/account-delete-${width}-${theme}.png`,
        });
        await page.keyboard.press("Escape");
      }
      expect(errors).toEqual([]);
    });
  }
});

test.describe("consent banner", () => {
  test("shows on a first visit and sends nothing until Allow", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const relay = recordRelay(page);
    await page.goto("/");
    const banner = page.getByRole("region", { name: BANNER });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(
      banner.getByRole("link", { name: "Lees het privacybeleid" })
    ).toHaveAttribute("href", "/privacy");
    expect(await blockingViolations(page)).toEqual([]);
    await page.waitForLoadState("networkidle");
    expect(relay).toHaveLength(0);

    await banner.getByRole("button", { name: ALLOW }).click();
    await expect(banner).toBeHidden();
    expect(await storedConsent(page)).toBe(true);
    // The held screen view goes out once consent is true.
    await expect.poll(() => relay.length).toBeGreaterThan(0);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: BANNER })).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("Only necessary closes it for good and sends nothing", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const relay = recordRelay(page);
    await page.goto("/");
    const banner = page.getByRole("region", { name: BANNER });
    await banner.getByRole("button", { name: DECLINE }).click();
    await expect(banner).toBeHidden();
    expect(await storedConsent(page)).toBe(false);

    await page.goto("/sign-in");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: BANNER })).toBeHidden();
    expect(relay).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test("the account page switch withdraws, and nothing is sent after", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const relay = recordRelay(page);
    await page.goto("/account");
    await page
      .getByRole("region", { name: BANNER })
      .getByRole("button", { name: ALLOW })
      .click();
    const toggle = page.getByRole("switch", { name: "Gebruiksstatistieken" });
    await expect(toggle).toBeChecked();
    await expect.poll(() => relay.length).toBeGreaterThan(0);

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    expect(await storedConsent(page)).toBe(false);
    await page.waitForTimeout(300);
    const withdrawn = relay.length;
    await page.getByRole("link", { name: "Aanmelden" }).first().click();
    await page.waitForLoadState("networkidle");
    expect(relay).toHaveLength(withdrawn);
    expect(errors).toEqual([]);
  });
});

test("a guest's account page: a sign-in prompt and the device preferences", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await decideConsent(page);
  await page.goto("/account");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Meld je aan om je account te beheren",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Voorkeuren" }).getByRole("radiogroup")
  ).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Profiel" })).toHaveCount(0);
  expect(await blockingViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the export downloads valid JSON (version 2)", async ({ page }) => {
  const errors = watchErrors(page);
  await decideConsent(page);
  const email = await signUpWithPassword(page);
  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Profiel" })).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Mijn gegevens downloaden" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(EXPORT_FILE);
  const path = await download.path();
  const data = JSON.parse(await readFile(path, "utf8"));
  expect(data).toMatchObject({
    exportVersion: 2,
    profile: { email, emailVerified: true },
  });
  expect(data.signInMethods.providers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ provider: "credential" }),
    ])
  );
  await expect(
    page.getByText("Je gegevens zijn gedownload.", { exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("deleting the account: its sessions end, sign-in fails, favorites are gone", async ({
  browser,
  page,
}) => {
  const errors = watchErrors(page);
  await decideConsent(page);
  const email = await signUpWithPassword(page);
  const gestureId = await firstGestureId(page.request);
  expect((await rpc(page.request, "favorites/add", { gestureId })).status).toBe(
    200
  );
  expect((await rpc(page.request, "favorites/ids")).json).toEqual([gestureId]);
  // A second device: the same session cookie in another browser context.
  const other = await browser.newContext({
    storageState: await page.context().storageState(),
  });

  await page.goto("/account");
  await page.getByRole("button", { name: "Mijn account verwijderen" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Je account definitief verwijderen?",
  });
  const confirm = dialog.getByRole("button", {
    name: "Mijn account verwijderen",
  });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Typ DELETE om te bevestigen").fill("DELETE");
  // The account has a password: it is asked, and a wrong one is refused.
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Je wachtwoord").fill("not-the-password");
  await confirm.click();
  await expect(dialog.getByText("Dat wachtwoord klopt niet.")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  await dialog.getByLabel("Je wachtwoord").fill(PASSWORD);
  await confirm.click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(
    page.getByText("Je account is definitief verwijderd.", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Aanmelden" }).first()
  ).toBeVisible();

  // The other device's session is gone at once.
  const session = await other.request.get("/api/auth/get-session");
  expect(await session.json()).toBeNull();
  await other.close();

  // The password no longer signs in.
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password: PASSWORD },
    headers: HEADERS,
  });
  expect(signIn.ok()).toBe(false);

  // Signing in with a code makes a new, empty account: no favorites.
  const sent = await page.request.post(
    "/api/auth/email-otp/send-verification-otp",
    { data: { email, type: "sign-in" }, headers: HEADERS }
  );
  expect(sent.ok()).toBe(true);
  const otp = await otpFor(page.request, email);
  const fresh = await page.request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp },
    headers: HEADERS,
  });
  expect(fresh.ok()).toBe(true);
  expect((await rpc(page.request, "favorites/ids")).json).toEqual([]);
  // Only the refused wrong password was logged (the 400 and the hook's log).
  expect(
    errors.filter(
      (error) =>
        !(
          error.includes("[account] Failed to delete the account") ||
          error.includes("status of 400")
        )
    )
  ).toEqual([]);
});
