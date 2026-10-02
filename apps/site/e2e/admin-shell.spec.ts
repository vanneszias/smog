import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  blockingViolations,
  e2eSeed,
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

/** Sets a role through the dev Worker's seed endpoint (as `admin:grant`). */
async function setRole(
  request: APIRequestContext,
  email: string,
  role: "admin" | "user"
): Promise<void> {
  await e2eSeed(request, [{ email, op: "setRole", role }]);
}

const LONG_TARGET = `gesture-${"x".repeat(60)}`;

/**
 * An audit entry with a long target id and a long payload (no admin
 * mutation exists yet in Task 1), by a deleted actor, dated now.
 */
async function seedAuditEntry(request: APIRequestContext): Promise<void> {
  await e2eSeed(request, [
    {
      data: {
        legacy: {
          keywords: Array.from(
            { length: 40 },
            (_, index) => `trefwoord-${index}`
          ),
          note: "Een lange oude logregel ".repeat(12),
        },
      },
      id: "e2e-long",
      op: "legacyAuditEntry",
      targetId: LONG_TARGET,
      targetType: "gesture",
    },
  ]);
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
    await setRole(page.request, email, "admin");
    await page.goto("/admin");
    await waitForApp(page);
    const rail = page.getByRole("navigation", { name: "Beheer" });
    await expect(rail).toBeVisible();
    await setRole(page.request, email, "user");
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

    await seedAuditEntry(page.request);
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
    // The gestures screen (phase 5 task 4) replaced its placeholder.
    await expect(page.getByRole("link", { name: "Hond" })).toBeVisible();
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
