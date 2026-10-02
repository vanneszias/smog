import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  type Browser,
  type BrowserContext,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { blockingViolations, ORIGIN, waitForApp, watchErrors } from "./helpers";
import {
  getBypass,
  maintenanceOff,
  PROPAGATION_MS,
  signInAsAdmin,
  statusOf,
  waitForStatus,
} from "./maintenance";

/*
 * The maintenance toggle and the bypass card (Task 6, ruling 9).
 * Maintenance is one site-wide KV flag, so this file is the `maintenance`
 * project (playwright.config.ts): one worker, after every other spec.
 * Every test leaves the site open (the file's `afterAll`, and `finally`
 * around each window). On its own: `bunx playwright test --project
 * maintenance --no-deps`.
 */

/** As playwright.config.ts: the preinstalled Chromium, launched by path. */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const ACTIVE_UNTIL = /^Actief tot /;
const PROPAGATION_NOTE = /binnen ongeveer 2 minuten/;
const MESSAGE_LABEL = /^Bericht/;

test.describe.configure({ mode: "serial" });

/** Turns maintenance off and waits until a cookieless visitor gets the site. */
async function reopen(browser: Browser): Promise<void> {
  const admin = await browser.newContext();
  const visitor = await browser.newContext();
  try {
    await signInAsAdmin(admin.request);
    await maintenanceOff(admin.request);
    await waitForStatus(visitor.request, "/", 200);
  } finally {
    await admin.close();
    await visitor.close();
  }
}

test.afterAll(async ({ browser }) => {
  await reopen(browser);
});

async function confirmIn(page: Page, action: string): Promise<void> {
  const alert = page.getByRole("alertdialog");
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: action }).click();
  await expect(alert).toBeHidden();
}

test.describe("admin settings: maintenance", () => {
  test("enable keeps the admin in while others get the 503; disable revokes the cookie", async ({
    browser,
    page,
  }) => {
    test.setTimeout(6 * PROPAGATION_MS);
    const errors = watchErrors(page);
    const opened: BrowserContext[] = [];
    const context = async (): Promise<BrowserContext> => {
      const created = await browser.newContext();
      opened.push(created);
      return created;
    };
    try {
      await signInAsAdmin(page.request);
      await maintenanceOff(page.request);
      const visitor = (await context()).request;

      await page.goto("/admin/settings");
      await waitForApp(page);
      await expect(page.getByText("Uit", { exact: true })).toBeVisible();
      await expect(page.getByText(PROPAGATION_NOTE)).toBeVisible();
      await page.getByLabel(MESSAGE_LABEL).fill("Nieuwe video's");
      await page.getByRole("button", { name: "Onderhoud aanzetten" }).click();
      await expect(
        page.getByText("Onderhoud staat aan", { exact: true })
      ).toBeVisible();
      await expect(page.getByText("Aan", { exact: true })).toBeVisible();
      await expect(page.getByText(ACTIVE_UNTIL)).toBeVisible();

      // The acting admin keeps the site; a fresh browser gets the 503.
      expect(await statusOf(page.request, "/admin")).toBe(200);
      await page.goto("/admin");
      await waitForApp(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await waitForStatus(visitor, "/", 503);
      expect(await statusOf(visitor, "/api/health")).toBe(200);
      const stale = (await page.context().cookies()).find(
        (cookie) => cookie.name === "smog_mx"
      );
      expect(stale).toBeDefined();

      // Disable: every bypass cookie is revoked, and the site opens.
      await page.goto("/admin/settings");
      await waitForApp(page);
      await page.getByRole("button", { name: "Onderhoud uitzetten" }).click();
      await expect(page.getByRole("alertdialog")).toContainText(
        "Elke omzeilcookie vervalt"
      );
      await confirmIn(page, "Onderhoud uitzetten");
      await expect(
        page.getByText("Onderhoud staat uit. Elke omzeilcookie is vervallen.", {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        page.getByText("Niet actief", { exact: true })
      ).toBeVisible();
      await waitForStatus(visitor, "/", 200);

      // A new window: the old cookie no longer bypasses, a new one does.
      const on = await page.request.post("/api/rpc/admin/maintenance/set", {
        data: { json: { enabled: true } },
        headers: { origin: ORIGIN },
      });
      expect(on.ok()).toBe(true);
      const current = await context();
      await signInAsAdmin(current.request);
      await getBypass(current.request);
      const holder = await context();
      await holder.addCookies([
        { name: "smog_mx", url: ORIGIN, value: stale?.value ?? "" },
      ]);
      // Once the isolates see the new window (the same 30 s cache).
      await waitForStatus(holder.request, "/", 503);
      // The positive control: the window is on, and a current cookie passes.
      expect(await statusOf(current.request, "/")).toBe(200);
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(opened.map((created) => created.close()));
      await reopen(browser);
    }
  });

  test("the bypass card gives this browser a 12 h cookie", async ({ page }) => {
    await signInAsAdmin(page.request);
    await page.goto("/admin/settings");
    await waitForApp(page);
    await page
      .getByRole("button", { name: "Omzeilen voor deze browser (12 u)" })
      .click();
    await expect(page.getByText(ACTIVE_UNTIL)).toBeVisible();
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === "smog_mx"
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(await blockingViolations(page)).toEqual([]);
  });
});

/**
 * The review screenshots (light/dark × 390/1280, reduced motion, nl-BE),
 * when ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test --project maintenance --no-deps`.
 */
test.describe("admin settings screenshots", () => {
  test("screenshots", async () => {
    const dir = process.env.ADMIN_SHOTS_DIR;
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    test.setTimeout(240_000);
    await mkdir(dir ?? "", { recursive: true });
    const browser = await chromium.launch({
      args: ["--lang=nl-BE"],
      env: { ...process.env, LANG: "nl_BE.UTF-8", LANGUAGE: "nl_BE" },
      ...(existsSync(PREINSTALLED_CHROMIUM)
        ? { executablePath: PREINSTALLED_CHROMIUM }
        : {}),
    });
    try {
      for (const theme of ["light", "dark"] as const) {
        for (const width of [390, 1280]) {
          // biome-ignore lint/performance/noAwaitInLoops: one browser context at a time.
          const context = await browser.newContext({
            colorScheme: theme,
            locale: "nl-BE",
            reducedMotion: "reduce",
            timezoneId: "Europe/Brussels",
            viewport: { height: 900, width },
          });
          try {
            await context.addCookies([
              { name: "theme", url: ORIGIN, value: theme },
            ]);
            const page = await context.newPage();
            await signInAsAdmin(page.request);
            await maintenanceOff(page.request);
            await page.goto("/admin/settings");
            await waitForApp(page);
            await page.waitForLoadState("networkidle");
            const decline = page.getByRole("button", {
              name: "Alleen noodzakelijke",
            });
            if (await decline.isVisible()) {
              await decline.click();
            }
            await page.screenshot({
              fullPage: true,
              path: `${dir}/settings-off-${theme}-${width}.png`,
            });
            const on = await page.request.post(
              "/api/rpc/admin/maintenance/set",
              {
                data: {
                  json: {
                    enabled: true,
                    message: "We zetten nieuwe video's klaar.",
                    until: new Date(
                      Date.now() + 2 * 60 * 60 * 1000
                    ).toISOString(),
                  },
                },
                headers: { origin: ORIGIN },
              }
            );
            expect(on.ok()).toBe(true);
            await page.reload();
            await waitForApp(page);
            await page.waitForLoadState("networkidle");
            await page.screenshot({
              fullPage: true,
              path: `${dir}/settings-on-${theme}-${width}.png`,
            });
            await page
              .getByRole("button", { name: "Onderhoud uitzetten" })
              .click();
            await page.getByRole("alertdialog").waitFor();
            await page.screenshot({
              path: `${dir}/settings-disable-${theme}-${width}.png`,
            });
          } finally {
            await maintenanceOff(context.request);
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  });
});
