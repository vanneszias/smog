import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Page, test } from "@playwright/test";
import {
  blockingViolations,
  ORIGIN,
  signInWithApi,
  stubMux,
  waitForApp,
  watchErrors,
} from "./helpers";

/** The dev seed's admin (packages/db/seed/dev.sql); a dev-only password. */
const ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
const SIGN_IN_BACK_TO_AUDIT = /\/sign-in\?redirect=%2Fadmin%2Faudit$/;
const FROM_IN_URL = /from=2026-01-01/;

const SITE_DIR = fileURLToPath(new URL("..", import.meta.url));
/** As playwright.config.ts: the preinstalled Chromium, launched by path. */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

/** Runs SQL on the dev server's local D1 (as `admin:grant` does). */
function d1(command: string): void {
  execFileSync(
    "bunx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--env",
      "dev",
      "--local",
      "--command",
      command,
    ],
    { cwd: SITE_DIR, stdio: "ignore" }
  );
}

function setRole(email: string, role: "admin" | "user"): void {
  d1(`UPDATE user SET role = '${role}' WHERE email = '${email}'`);
}

const LONG_TARGET = `gesture-${"x".repeat(60)}`;

/**
 * An audit entry with a long target id and a long payload (no admin
 * mutation exists yet in Task 1), by a deleted actor, dated now.
 */
function seedAuditEntry(): void {
  const data = JSON.stringify({
    legacy: {
      keywords: Array.from({ length: 40 }, (_, index) => `trefwoord-${index}`),
      note: "Een lange oude logregel ".repeat(12),
    },
  });
  d1(
    `INSERT OR REPLACE INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('e2e-long', NULL, 'legacy', 'gesture', '${LONG_TARGET}', '${data}', CAST(unixepoch('subsec') * 1000 AS INTEGER))`
  );
}

/** Client-side navigation (no document request), as a link click does. */
async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function signInAsAdmin(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: ADMIN,
    headers: { origin: ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

test.describe("admin shell", () => {
  test("a guest opening /admin is sent to sign-in, with the way back", async ({
    page,
  }) => {
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(SIGN_IN_BACK_TO_AUDIT);
  });

  test("a signed-in user gets the 404 page, and no Admin menu entry", async ({
    page,
  }) => {
    await signInWithApi(page);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Pagina niet gevonden" })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Beheer" })).toHaveCount(
      0
    );
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: "Accountmenu" }).click();
    await expect(page.getByRole("menuitem", { name: "Beheer" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A client-side navigation gets the same 404, and no admin rpc runs.
    const adminCalls: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/rpc/admin")) {
        adminCalls.push(request.url());
      }
    });
    await navigateInApp(page, "/admin");
    await expect(
      page.getByRole("heading", { name: "Pagina niet gevonden" })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Beheer" })).toHaveCount(
      0
    );
    expect(adminCalls).toEqual([]);
  });

  test("a demoted admin's next click in the rail is a 404", async ({
    page,
  }) => {
    const email = await signInWithApi(page);
    setRole(email, "admin");
    await page.goto("/admin");
    await waitForApp(page);
    const rail = page.getByRole("navigation", { name: "Beheer" });
    await expect(rail).toBeVisible();
    setRole(email, "user");
    await rail.getByRole("link", { name: "Logboek" }).click();
    await expect(
      page.getByRole("heading", { name: "Pagina niet gevonden" })
    ).toBeVisible();
  });

  test("the seeded admin sees the dashboard and the audit log", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    // The home page's gesture cards load Mux thumbnails.
    await stubMux(page);
    await signInAsAdmin(page);
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: "Accountmenu" }).click();
    await page.getByRole("menuitem", { name: "Beheer" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/admin`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Overzicht"
    );
    await expect(page.getByRole("heading", { name: "Gebaren" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recente acties" })
    ).toBeVisible();
    const rail = page.getByRole("navigation", { name: "Beheer" });
    await expect(rail.getByRole("link", { name: "Overzicht" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(await blockingViolations(page)).toEqual([]);

    seedAuditEntry();
    await rail.getByRole("link", { name: "Logboek" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/admin/audit`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Logboek");
    const table = page.getByRole("table", { name: "Logboek" });
    await expect(table).toBeVisible();
    // A row opens the entry: its data, and the deleted actor.
    await table.getByText(LONG_TARGET).click();
    const sheet = page.getByRole("dialog", { name: "Oude logregel" });
    await expect(sheet.getByLabel("Gegevens")).toContainText("trefwoord-39");
    await expect(sheet).toContainText("Verwijderd account");
    expect(await blockingViolations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // The filters live in the URL.
    await page.getByLabel("Van", { exact: true }).fill("2026-01-01");
    await expect(page).toHaveURL(FROM_IN_URL);
    await page.reload();
    await expect(page.getByLabel("Van", { exact: true })).toHaveValue(
      "2026-01-01"
    );
    expect(await blockingViolations(page)).toEqual([]);

    await rail.getByRole("link", { name: "Gebaren" }).click();
    await expect(page.getByText("Komt in deze fase")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("on a phone the rail is a sheet", async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await signInAsAdmin(page);
    await page.goto("/admin");
    await waitForApp(page);
    await expect(page.getByRole("navigation", { name: "Beheer" })).toBeHidden();
    await page.getByRole("button", { name: "Beheermenu openen" }).click();
    const sheet = page.getByRole("dialog", { name: "Beheer" });
    await sheet.getByRole("link", { name: "Logboek" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/admin/audit`);
    await expect(sheet).toBeHidden();
  });
});

/*
 * Review screenshots (light/dark × 390/1280), only when ADMIN_SHOTS_DIR is
 * set: `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test admin-shell`.
 * Chromium's own UI (the date inputs) in Belgian Dutch, and no motion, so
 * the sheet is shot where it stops.
 */
test.describe("admin shell screenshots", () => {
  test("screenshots", async () => {
    const dir = process.env.ADMIN_SHOTS_DIR;
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    await mkdir(dir ?? "", { recursive: true });
    // Its own browser: `--lang` is a launch option (per worker in the config).
    // Chromium formats the date inputs in its own UI language (LANG).
    const browser = await chromium.launch({
      args: ["--lang=nl-BE"],
      env: { ...process.env, LANG: "nl_BE.UTF-8", LANGUAGE: "nl_BE" },
      ...(existsSync(PREINSTALLED_CHROMIUM)
        ? { executablePath: PREINSTALLED_CHROMIUM }
        : {}),
    });
    seedAuditEntry();
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
        await context.addCookies([
          { name: "theme", url: ORIGIN, value: theme },
        ]);
        const page = await context.newPage();
        await signInAsAdmin(page);
        for (const [name, path] of [
          ["dashboard", "/admin"],
          ["audit", "/admin/audit"],
        ] as const) {
          // biome-ignore lint/performance/noAwaitInLoops: the pages are shot one after another.
          await page.goto(path);
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
            path: `${dir}/${name}-${theme}-${width}.png`,
          });
        }
        // The long entry's sheet, once it has stopped moving.
        await page.getByText(LONG_TARGET).first().click();
        const sheet = page.getByRole("dialog");
        await sheet.getByRole("button", { name: "Sluiten" }).waitFor();
        await page.screenshot({
          path: `${dir}/audit-detail-${theme}-${width}.png`,
        });
        await context.close();
      }
    }
    await browser.close();
  });
});
