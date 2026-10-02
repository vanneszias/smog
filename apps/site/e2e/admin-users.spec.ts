import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  blockingViolations,
  ORIGIN,
  signInWithApi,
  waitForApp,
  watchErrors,
} from "./helpers";

/** The dev seed's admin (packages/db/seed/dev.sql); a dev-only password. */
const ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
const PANEL_IN_URL = /user=/;

async function signInAsAdmin(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: ADMIN,
    headers: { origin: ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

/** An admin rpc call over HTTP, as the admin client sends it. */
async function dashboardStatus(page: Page): Promise<number> {
  const response = await page.request.post("/api/rpc/admin/dashboard", {
    data: { json: null },
    headers: { origin: ORIGIN },
  });
  return response.status();
}

/** A second browser with its own cookies: a new account, signed in. */
async function memberPage(browser: Browser): Promise<{
  email: string;
  page: Page;
}> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = await signInWithApi(page);
  return { email, page };
}

/** Opens the account's panel from a search on its email. */
async function openPanel(page: Page, email: string): Promise<void> {
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await waitForApp(page);
  const table = page.getByRole("table", { name: "Gebruikers" });
  await table.getByText(email).first().click();
  await expect(page.getByRole("dialog", { name: email })).toBeVisible();
}

/** A toast's title (the live region repeats it, prefixed). */
function toastText(page: Page, text: string) {
  return page.getByText(text, { exact: true });
}

async function confirmIn(page: Page, action: string): Promise<void> {
  const alert = page.getByRole("alertdialog");
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: action }).click();
  await expect(alert).toBeHidden();
}

test.describe("admin users", () => {
  test("promote, open /admin, demote: the next navigation is a 404 and the next call FORBIDDEN", async ({
    browser,
    page,
  }) => {
    const errors = watchErrors(page);
    await signInAsAdmin(page);
    const member = await memberPage(browser);
    expect((await member.page.goto("/admin"))?.status()).toBe(404);

    // The seeded admin promotes the account from its panel.
    await openPanel(page, member.email);
    const panel = page.getByRole("dialog", { name: member.email });
    await panel.getByRole("button", { name: "Beheerder maken" }).click();
    await confirmIn(page, "Beheerder maken");
    await expect(
      toastText(page, `${member.email} is nu beheerder.`)
    ).toBeVisible();
    await expect(panel.getByText("Beheerder", { exact: true })).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);

    // The member's next page is the admin.
    const opened = await member.page.goto("/admin");
    expect(opened?.status()).toBe(200);
    await expect(member.page.getByRole("heading", { level: 1 })).toHaveText(
      "Overzicht"
    );
    expect(await dashboardStatus(member.page)).toBe(200);

    // Demoted: the next navigation is a 404, the next call FORBIDDEN.
    await panel.getByRole("button", { name: "Beheerdersrol afnemen" }).click();
    await confirmIn(page, "Beheerdersrol afnemen");
    await expect(
      toastText(page, `${member.email} is geen beheerder meer.`)
    ).toBeVisible();
    const after = await member.page.goto("/admin");
    expect(after?.status()).toBe(404);
    await expect(
      member.page.getByRole("heading", { name: "Pagina niet gevonden" })
    ).toBeVisible();
    expect(await dashboardStatus(member.page)).toBe(403);

    // Better Auth's own admin routes are off over HTTP (ruling 6).
    const direct = await page.request.post("/api/auth/admin/set-role", {
      data: { role: "admin", userId: "anyone" },
      headers: { origin: ORIGIN },
    });
    expect(direct.status()).toBe(404);
    expect(errors).toEqual([]);
  });

  test("ban and lift the ban; the banned session is refused at once", async ({
    browser,
    page,
  }) => {
    await signInAsAdmin(page);
    const member = await memberPage(browser);
    await openPanel(page, member.email);
    const panel = page.getByRole("dialog", { name: member.email });
    await panel.getByRole("button", { name: "Blokkeren" }).click();
    const alert = page.getByRole("alertdialog");
    await alert.getByLabel("Reden").fill("Spam in gedeelde lijsten");
    await confirmIn(page, "Blokkeren");
    await expect(
      toastText(page, `${member.email} is geblokkeerd.`)
    ).toBeVisible();
    await expect(panel.getByText("Spam in gedeelde lijsten")).toBeVisible();

    const session = await member.page.request.get("/api/auth/get-session");
    expect(await session.json()).toBeNull();

    await panel.getByRole("button", { name: "Blokkering opheffen" }).click();
    await confirmIn(page, "Blokkering opheffen");
    await expect(
      toastText(page, `De blokkering van ${member.email} is opgeheven.`)
    ).toBeVisible();
  });

  test("delete through the panel: type the email, the panel closes, the session ends", async ({
    browser,
    page,
  }) => {
    await signInAsAdmin(page);
    const member = await memberPage(browser);
    await openPanel(page, member.email);
    const panel = page.getByRole("dialog", { name: member.email });
    await panel.getByRole("button", { name: "Account verwijderen" }).click();
    const alert = page.getByRole("alertdialog");
    const confirm = alert.getByRole("button", { name: "Account verwijderen" });
    await expect(confirm).toBeDisabled();
    await alert.getByRole("textbox").fill("iemand-anders@smog.test");
    await expect(confirm).toBeDisabled();
    await alert.getByRole("textbox").fill(member.email.toUpperCase());
    await confirmIn(page, "Account verwijderen");
    await expect(toastText(page, "Het account is verwijderd.")).toBeVisible();
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(PANEL_IN_URL);
    await expect(
      page.getByRole("table", { name: "Gebruikers" }).getByText(member.email)
    ).toHaveCount(0);
    const session = await member.page.request.get("/api/auth/get-session");
    expect(await session.json()).toBeNull();
  });

  test("the admin's own row has its actions disabled, with the reason", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/users?q=${encodeURIComponent(ADMIN.email)}`);
    await waitForApp(page);
    await page
      .getByRole("table", { name: "Gebruikers" })
      .getByText(ADMIN.email)
      .first()
      .click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Dit is je eigen account.")).toBeVisible();
    for (const name of [
      "Beheerdersrol afnemen",
      "Blokkeren",
      "Account verwijderen",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one assertion per button.
      await expect(panel.getByRole("button", { name })).toBeDisabled();
    }
  });
});
