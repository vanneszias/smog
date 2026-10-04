import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  forEachThemeAndWidth,
  launchReviewBrowser,
  openAdmin,
  shotsDir,
} from "./admin";
import {
  blockingViolations,
  ORIGIN,
  otpFor,
  waitForApp,
  watchErrors,
} from "./helpers";
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

const ACTIVE_UNTIL = /^Actief tot /;
const PROPAGATION_NOTE = /binnen ongeveer 2 minuten/;
const MESSAGE_LABEL = /^Bericht/;
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
/** The real script, by path (run with `bun` from the repository root). */
const ADMIN_GRANT = join(REPO_ROOT, "scripts", "admin-grant.ts");
const SAME_ORIGIN = { origin: ORIGIN };

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

/*
 * The first production admin (phase 8 ruling 18): `bun run admin:grant
 * --create` makes a verified admin with no password on the dev server's
 * local D1 (the real script and wrangler), and that admin signs in with an
 * email code while maintenance is on, then gets the bypass cookie.
 */
test.describe("the first admin (admin:grant --create)", () => {
  test("signs in with an email code during maintenance and bypasses it", async ({
    browser,
  }) => {
    test.setTimeout(6 * PROPAGATION_MS);
    const email = `e2e-first-admin-${crypto.randomUUID()}@example.test`;
    const opened: BrowserContext[] = [];
    const context = async (): Promise<BrowserContext> => {
      const created = await browser.newContext();
      opened.push(created);
      return created;
    };
    try {
      const output = execFileSync(
        "bun",
        [ADMIN_GRANT, "--env", "dev", "--create", email],
        { cwd: REPO_ROOT, encoding: "utf8" }
      );
      expect(output).toContain("created_id");

      // The seeded admin opens a window (and keeps a bypass to read mail).
      const admin = (await context()).request;
      await signInAsAdmin(admin);
      await getBypass(admin);
      const on = await admin.post("/api/rpc/admin/maintenance/set", {
        data: { json: { enabled: true } },
        headers: SAME_ORIGIN,
      });
      expect(on.ok()).toBe(true);

      const first = (await context()).request;
      await waitForStatus(first, "/", 503);
      const sent = await first.post(
        "/api/auth/email-otp/send-verification-otp",
        { data: { email, type: "sign-in" }, headers: SAME_ORIGIN }
      );
      expect(sent.status()).toBe(200);
      // /dev/mail.json is closed too: read it through the bypass.
      const otp = await otpFor(admin, email);
      const signedIn = await first.post("/api/auth/sign-in/email-otp", {
        data: { email, otp },
        headers: SAME_ORIGIN,
      });
      expect(signedIn.status()).toBe(200);
      expect(await statusOf(first, "/admin")).toBe(503);
      await getBypass(first);
      expect(await statusOf(first, "/admin")).toBe(200);
      expect(await statusOf(first, "/account")).toBe(200);
    } finally {
      await Promise.all(opened.map((created) => created.close()));
      await reopen(browser);
    }
  });
});

/**
 * The settings review screenshots with maintenance on and off (light/dark
 * × 390/1280, reduced motion, nl-BE), when ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test --project maintenance --no-deps`.
 * Every other admin screen is shot by `admin-screenshots.spec.ts`.
 */
test.describe("admin settings screenshots", () => {
  test("screenshots", async () => {
    const dir = await shotsDir();
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    test.setTimeout(240_000);
    const browser = await launchReviewBrowser();
    try {
      await forEachThemeAndWidth(browser, async (page, theme, width) => {
        const file = (name: string): string =>
          `${dir}/settings-${name}-${theme}-${width}.png`;
        try {
          await maintenanceOff(page.request);
          await openAdmin(page, "/admin/settings");
          await page.waitForLoadState("networkidle");
          await page.screenshot({ fullPage: true, path: file("off") });
          const on = await page.request.post("/api/rpc/admin/maintenance/set", {
            data: {
              json: {
                enabled: true,
                message: "We zetten nieuwe video's klaar.",
                until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
              },
            },
            headers: { origin: ORIGIN },
          });
          expect(on.ok()).toBe(true);
          await page.reload();
          await waitForApp(page);
          await page.waitForLoadState("networkidle");
          await page.screenshot({ fullPage: true, path: file("on") });
          await page
            .getByRole("button", { name: "Onderhoud uitzetten" })
            .click();
          await page.getByRole("alertdialog").waitFor();
          await page.screenshot({ path: file("disable") });
        } finally {
          await maintenanceOff(page.request);
        }
      });
    } finally {
      await browser.close();
    }
  });
});
