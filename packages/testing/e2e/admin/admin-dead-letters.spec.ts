import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  openAdmin,
  THEMES,
  type Theme,
  themedContext,
  WIDTHS,
} from "../../support/e2e/admin";
import {
  blockingViolations,
  e2eSeed,
  ORIGIN,
  watchErrors,
} from "../../support/e2e/helpers";
import { signInAsAdmin } from "../../support/e2e/maintenance";

/*
 * The dead-letter screen and card (phase 9 task 4): rows seeded through
 * `/dev/e2e-seed` (`deadLetter`, which builds the stored body itself: the
 * request never carries one), the replay reaching the dev email consumer,
 * the discard, no body on the screen, the axe matrix and a keyboard-only
 * run with focus return. Every row is removed in `finally`.
 */

test.describe.configure({ mode: "serial" });

const RENDER_ROW = /render\.requested/;
const OTP_ROW = /auth\/otp/;
const WELCOME_ROW = /transactional\/welcome/;
const EMAIL_FILTER_URL = /\/admin\/dead-letters\?.*queue=email/;
const ADDRESS = "e2e-dead-letter@smog.test";
const REPLAYED = "Het bericht staat weer in de wachtrij.";
const DISCARDED = "Het bericht is verwijderd.";

const EMAIL = "e2e-dl-email";
const EVENTS = "e2e-dl-events";
const SECRET = "e2e-dl-secret";

const ROWS = [
  { id: EMAIL, kind: "email", op: "deadLetter" },
  { id: EVENTS, kind: "events", op: "deadLetter" },
  { id: SECRET, kind: "secret", op: "deadLetter" },
] as const;

async function seedRows(request: APIRequestContext): Promise<void> {
  await e2eSeed(request, [{ op: "resetDeadLetters" }, ...ROWS]);
}

async function reset(request: APIRequestContext): Promise<void> {
  await e2eSeed(request, [{ op: "resetDeadLetters" }]);
}

interface StateRow {
  discarded: number;
  id: string;
  replayed: number;
}

/** The seeded rows and whether each was replayed or discarded (a read seed). */
async function states(request: APIRequestContext): Promise<StateRow[]> {
  const response = await request.post("/dev/e2e-seed", {
    data: [{ op: "deadLetterState" }],
    headers: { origin: ORIGIN },
  });
  return ((await response.json()) as { rows: StateRow[] }).rows;
}

/** The dev mailbox's messages to `address` (what `/dev/mail.json` shows). */
async function mailboxTo(
  request: APIRequestContext,
  address: string
): Promise<{ subject: string; to: string }[]> {
  const response = await request.get("/dev/mail.json");
  const { messages } = (await response.json()) as {
    messages: { subject: string; to: string }[];
  };
  return messages.filter((message) => message.to === address);
}

function replayButton(page: Page, type: string) {
  return page.getByRole("button", { name: `${type} opnieuw afspelen` });
}

function discardButton(page: Page, type: string) {
  return page.getByRole("button", { name: `${type} verwijderen` });
}

test.describe("admin dead letters", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInAsAdmin(page.request);
      await reset(page.request);
    } finally {
      await page.close();
    }
  });

  test("lists the dead letters without a body, and replays an email through the queue", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page.request);
    try {
      await seedRows(page.request);
      await openAdmin(page, "/admin/dead-letters");
      const table = page.getByRole("table", { name: "Dead letters" });
      await expect(table.getByRole("row", { name: RENDER_ROW })).toBeVisible();
      await expect(table.getByRole("row", { name: OTP_ROW })).toBeVisible();

      // The sign-in code email has no body and cannot be replayed: Discard only.
      await expect(
        table.getByText("Inhoud niet bewaard", { exact: false })
      ).toBeVisible();
      await expect(replayButton(page, "auth/otp")).toHaveCount(0);
      await expect(discardButton(page, "auth/otp")).toBeVisible();
      // No stored address or body anywhere on the page.
      expect(await page.content()).not.toContain(ADDRESS);

      await replayButton(page, "transactional/welcome").click();
      const dialog = page.getByRole("alertdialog", {
        name: "Dit bericht opnieuw afspelen?",
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Opnieuw afspelen" }).click();
      await expect(page.getByText(REPLAYED, { exact: true })).toBeVisible();
      await expect(table.getByRole("row", { name: WELCOME_ROW })).toHaveCount(
        0
      );

      // The dev email consumer sent it (the original idempotency key rode along).
      await expect
        .poll(async () => (await mailboxTo(page.request, ADDRESS)).length)
        .toBe(1);
      expect((await mailboxTo(page.request, ADDRESS))[0]?.subject).toBe(
        "Welkom bij SMOG & Co"
      );
      expect(await states(page.request)).toEqual(
        expect.arrayContaining([
          { discarded: 0, id: EMAIL, replayed: 1 },
          { discarded: 0, id: EVENTS, replayed: 0 },
        ])
      );

      // The replayed one is in its own list, with no actions.
      await page.getByRole("combobox", { name: "Status" }).click();
      await page.getByRole("option", { name: "Opnieuw afgespeeld" }).click();
      const replayedRow = table.getByRole("row", {
        name: WELCOME_ROW,
      });
      await expect(replayedRow).toBeVisible();
      await expect(replayedRow.getByRole("button")).toHaveCount(0);
    } finally {
      await reset(page.request);
    }
  });

  test("discards a message, audited, and replays an event", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page.request);
    try {
      await seedRows(page.request);
      await openAdmin(page, "/admin/dead-letters");

      await discardButton(page, "auth/otp").click();
      const dialog = page.getByRole("alertdialog", {
        name: "Dit bericht verwijderen?",
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Verwijderen" }).click();
      await expect(page.getByText(DISCARDED, { exact: true })).toBeVisible();

      await replayButton(page, "render.requested").click();
      await page
        .getByRole("alertdialog", { name: "Dit bericht opnieuw afspelen?" })
        .getByRole("button", { name: "Opnieuw afspelen" })
        .click();
      await expect(page.getByText(REPLAYED, { exact: true })).toBeVisible();

      expect(await states(page.request)).toEqual(
        expect.arrayContaining([
          { discarded: 1, id: SECRET, replayed: 0 },
          { discarded: 0, id: EVENTS, replayed: 1 },
        ])
      );

      // Both are in the audit log, with the queue and type and nothing else.
      await openAdmin(page, "/admin/audit");
      await expect(
        page.getByText("Dead letter verwijderd").first()
      ).toBeVisible();
      await expect(
        page.getByText("Dead letter opnieuw afgespeeld").first()
      ).toBeVisible();
      expect(await page.content()).not.toContain(ADDRESS);
    } finally {
      await reset(page.request);
    }
  });

  test("the dashboard card counts what waits, per queue, and links to the screen", async ({
    page,
  }) => {
    await signInAsAdmin(page.request);
    try {
      await seedRows(page.request);
      await openAdmin(page, "/admin");
      const card = page
        .getByRole("heading", { level: 2, name: "Dead letters" })
        .locator("xpath=ancestor::div[contains(@class,'gap-1')][1]/..");
      await expect(
        card.getByRole("link", { name: "2 e-mails wachten" })
      ).toBeVisible();
      await expect(
        card.getByRole("link", { name: "1 gebeurtenis wacht" })
      ).toBeVisible();
      await card.getByRole("link", { name: "2 e-mails wachten" }).click();
      await expect(page).toHaveURL(EMAIL_FILTER_URL);
      await expect(
        page.getByRole("table", { name: "Dead letters" }).getByRole("row", {
          name: WELCOME_ROW,
        })
      ).toBeVisible();
    } finally {
      await reset(page.request);
    }
  });

  test("works with the keyboard alone, and returns the focus", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page.request);
    try {
      await seedRows(page.request);
      await openAdmin(page, "/admin/dead-letters");
      const replay = replayButton(page, "transactional/welcome");
      await replay.waitFor();

      // Tab to the button the way a keyboard user reaches it, open the dialog.
      for (let presses = 0; presses < 60; presses += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one key at a time.
        if (await replay.evaluate((node) => node === document.activeElement)) {
          break;
        }
        await page.keyboard.press("Tab");
      }
      await expect(replay).toBeFocused();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("alertdialog", {
        name: "Dit bericht opnieuw afspelen?",
      });
      await expect(dialog).toBeVisible();

      // Escape cancels and the focus returns to the button that opened it.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(replay).toBeFocused();

      // Open it again and confirm with the keyboard (Tab to the action, Enter).
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      const confirm = dialog.getByRole("button", { name: "Opnieuw afspelen" });
      for (let presses = 0; presses < 5; presses += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one key at a time.
        if (await confirm.evaluate((node) => node === document.activeElement)) {
          break;
        }
        await page.keyboard.press("Tab");
      }
      await expect(confirm).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByText(REPLAYED, { exact: true })).toBeVisible();

      // The replayed row left the open list: the focus goes to the list, not the page.
      await expect(
        page.getByRole("region", { name: "Dead letters" })
      ).toBeFocused();
    } finally {
      await reset(page.request);
    }
  });
});

test.describe("admin dead letters: accessibility", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInAsAdmin(page.request);
      await seedRows(page.request);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInAsAdmin(page.request);
      await reset(page.request);
    } finally {
      await page.close();
    }
  });

  /** Light at 1280 and dark at 390 also check the dialog (theme and reflow). */
  function checksDialog(theme: Theme, width: number): boolean {
    return (
      (theme === "light" && width === 1280) ||
      (theme === "dark" && width === 390)
    );
  }

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: the screen, the dashboard card and the dialogs, ${theme} at ${width} px`, async ({
        browser,
      }) => {
        test.setTimeout(120_000);
        const context = await themedContext(browser, theme, width);
        try {
          const page = await context.newPage();
          const errors = watchErrors(page);
          await signInAsAdmin(page.request);
          const found: { id: string; nodes: string[]; where: string }[] = [];
          const check = async (where: string): Promise<void> => {
            for (const violation of await blockingViolations(page)) {
              found.push({ ...violation, where });
            }
          };

          await openAdmin(page, "/admin/dead-letters");
          const table = page.getByRole("table", { name: "Dead letters" });
          await expect(table.getByRole("row", { name: OTP_ROW })).toBeVisible();
          await check("dead-letters");

          if (checksDialog(theme, width)) {
            await replayButton(page, "transactional/welcome").click();
            const dialog = page.getByRole("alertdialog", {
              name: "Dit bericht opnieuw afspelen?",
            });
            await expect(dialog).toBeVisible();
            await check("dead-letters-replay");
            await page.keyboard.press("Escape");
            await expect(dialog).toBeHidden();
            await discardButton(page, "auth/otp").click();
            await expect(
              page.getByRole("alertdialog", {
                name: "Dit bericht verwijderen?",
              })
            ).toBeVisible();
            await check("dead-letters-discard");
            await page.keyboard.press("Escape");
          }

          await openAdmin(page, "/admin");
          await expect(
            page.getByRole("heading", { level: 2, name: "Dead letters" })
          ).toBeVisible();
          await check("dashboard");

          expect(found).toEqual([]);
          expect(errors).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }
});
