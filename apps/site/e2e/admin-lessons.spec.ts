import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { adminRpc, openAdmin, stubMuxMedia, themedContext } from "./admin";
import { blockingViolations, e2eSeed, ORIGIN, signInWithApi } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * Lessons (phase 10c task 4), in Belgian Dutch. A teacher is taken from the
 * dashboard to the lessons, creates a lesson, picks two gestures in the
 * picker, reorders them with the keyboard, adds a section and moves a
 * gesture into it, and finds all of it after a reload; another teacher sees
 * the lesson read-only and copies it; the copy is deleted after a
 * confirmation. A learner and a translator have no lessons (404 page,
 * refused procedures). The lists and the builder pass axe, at 320 px too.
 * The gestures and every lesson are the spec's own and removed afterwards.
 */

const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const STEP_MS = 15_000;

function letters(length: number): string {
  return Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
}

const WORD = `ls${letters(8)}`;
const FIRST = `Zz${WORD} een`;
const SECOND = `Zz${WORD} twee`;
const TITLE = `Les ${WORD}`;
const SECTION = "Begroetingen";
const SAVED = "Alle wijzigingen bewaard";
const BUILDER_URL = /\/admin\/lessons\/[0-9a-f-]{36}$/;
const LESSONS_URL = /\/admin\/lessons$/;
const TITLE_LABEL = /^Titel/;
const NUMBER_LABEL = /^Lesnummer/;
const NOTES_LABEL = /^Notities/;
const ENGLISH_TAB = /English/;
const FIRST_NAME = new RegExp(FIRST);
const SECOND_NAME = new RegExp(SECOND);
const TITLE_CELL = new RegExp(TITLE);
const ROW_MENU = /^Acties voor Zz/;

const gestureIds: string[] = [];
let author: BrowserContext;
let authorPage: Page;
let other: BrowserContext;
let otherPage: Page;
let lessonUrl = "";

test.describe.configure({ mode: "serial" });

type Role = "teacher" | "translator";

/** A signed-in account holding `role` (none for a plain learner), in this page's cookie jar. */
async function signedInAs(page: Page, role?: Role): Promise<void> {
  const email = await signInWithApi(page);
  if (role) {
    await e2eSeed(page.request, [{ email, op: "grantRole", role }]);
  }
}

async function createGesture(
  request: APIRequestContext,
  name: string,
  categoryId: string
): Promise<string> {
  const gesture = await adminRpc<{ id: string }>(
    request,
    "admin/gestures/create",
    {
      categoryIds: [categoryId],
      name,
      playbackId: SAMPLE_PLAYBACK_ID,
      published: true,
    }
  );
  return gesture.id;
}

async function teacherContext(
  browser: Browser
): Promise<[BrowserContext, Page]> {
  const context = await themedContext(browser, "light", 1280);
  const page = await context.newPage();
  await stubMuxMedia(page);
  await signedInAs(page, "teacher");
  return [context, page];
}

test.beforeAll(async ({ browser, request }) => {
  await signInAsAdmin(request);
  const categories = await adminRpc<
    { id: string; publishedAt: number | null }[]
  >(request, "admin/categories/list");
  const seeded = categories.find((item) => item.publishedAt !== null);
  if (!seeded) {
    throw new Error("[e2e] the dev seed has no published category");
  }
  gestureIds.push(
    await createGesture(request, FIRST, seeded.id),
    await createGesture(request, SECOND, seeded.id)
  );
  [author, authorPage] = await teacherContext(browser);
  [other, otherPage] = await teacherContext(browser);
});

test.afterAll(async ({ request }) => {
  await author?.close();
  await other?.close();
  await signInAsAdmin(request);
  // Every lesson of the spec (found by its title), then the gestures.
  const { items } = await adminRpc<{ items: { id: string }[] }>(
    request,
    "lessons/list",
    { query: WORD }
  );
  for (const item of items) {
    // biome-ignore lint/performance/noAwaitInLoops: a few deletes, in order.
    await adminRpc(request, "lessons/delete", { id: item.id });
  }
  // A published gesture cannot be deleted: unpublish both, then delete.
  await adminRpc(request, "admin/gestures/bulkUpdate", {
    ids: gestureIds,
    published: false,
  });
  for (const id of gestureIds) {
    const name = id === gestureIds[0] ? FIRST : SECOND;
    // biome-ignore lint/performance/noAwaitInLoops: two deletes, in order.
    await adminRpc(request, "admin/gestures/delete", { confirmName: name, id });
  }
});

/** Waits for the autosave to report that the server has the draft. */
async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByTestId("lesson-save-status")).toHaveText(SAVED, {
    timeout: STEP_MS,
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The gestures of the lesson's ungrouped part and of its sections, by name, in order. */
function gestureRows(page: Page) {
  return page.getByRole("list").getByRole("listitem");
}

test("a teacher lands on the lessons, creates a lesson and fills it with gestures", async () => {
  // The dashboard leads a teacher to the lessons; the rail has the lessons only.
  await openAdmin(authorPage, "/admin");
  await expect(authorPage).toHaveURL(LESSONS_URL);
  await expect(
    authorPage.getByRole("heading", { level: 1, name: "Lessen" })
  ).toBeVisible();
  const rail = authorPage.getByRole("navigation", { name: "Beheer" });
  await expect(rail.getByRole("link", { name: "Lessen" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Gebaren" })).toHaveCount(0);
  await expect(rail.getByRole("link", { name: "Gebruikers" })).toHaveCount(0);
  expect(await blockingViolations(authorPage)).toEqual([]);

  await authorPage.getByRole("button", { name: "Nieuwe les" }).click();
  const dialog = authorPage.getByRole("dialog", { name: "Nieuwe les" });
  await dialog.getByRole("textbox", { name: TITLE_LABEL }).fill(TITLE);
  await dialog.getByRole("spinbutton", { name: NUMBER_LABEL }).fill("3");
  await dialog.getByRole("button", { name: "Les maken" }).click();
  await expect(authorPage).toHaveURL(BUILDER_URL, { timeout: STEP_MS });
  lessonUrl = new URL(authorPage.url()).pathname;
  await expect(
    authorPage.getByRole("heading", { level: 1, name: TITLE })
  ).toBeVisible();
  await expect(authorPage.getByText("Les 3", { exact: true })).toBeVisible();
  await expectSaved(authorPage);

  // The picker: search, add both gestures, each shows as "in this lesson".
  await authorPage.getByRole("button", { name: "Gebaren toevoegen" }).click();
  const picker = authorPage.getByRole("dialog", { name: "Gebaren toevoegen" });
  await picker.getByPlaceholder("Gebaren zoeken").fill(`Zz${WORD}`);
  const first = picker.getByRole("option", { name: FIRST_NAME });
  const second = picker.getByRole("option", { name: SECOND_NAME });
  await expect(first).toBeVisible({ timeout: STEP_MS });
  await first.click();
  await expect(first.getByText("In deze les")).toBeVisible();
  await second.click();
  await expect(second.getByText("In deze les")).toBeVisible();
  // A gesture appears once: picking it again changes nothing.
  await first.click({ force: true });
  expect(await blockingViolations(authorPage)).toEqual([]);
  await picker.getByRole("button", { name: "Klaar" }).click();
  await expect(picker).toBeHidden();
  const rows = authorPage.getByRole("button", { name: ROW_MENU });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAccessibleName(`Acties voor ${FIRST}`);
  await expect(
    authorPage.getByText("2 gebaren", { exact: true })
  ).toBeVisible();
  await expect(
    authorPage.getByText("0 van 2 gebaren hebben lesgeversinfo in Nederlands.")
  ).toBeVisible({ timeout: STEP_MS });
  await expectSaved(authorPage);
});

test("the gestures are reordered with the keyboard, a section is added and a gesture moved into it; a reload keeps it", async () => {
  const page = authorPage;
  const handle = page.getByRole("button", {
    name: `Slepen om de volgorde te wijzigen: ${FIRST}`,
  });
  await expect(handle).toBeVisible({ timeout: STEP_MS });
  const saved = page.waitForResponse("**/api/rpc/lessons/update", {
    timeout: STEP_MS,
  });
  // dnd-kit measures the rows after the pick-up and announces the row over
  // itself first; press ArrowDown until the move to position 2 is announced.
  await handle.focus({ timeout: STEP_MS });
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true", {
    timeout: STEP_MS,
  });
  const moved = page.getByText(`${FIRST} verplaatst naar positie 2 van 2`, {
    exact: false,
  });
  await expect(async () => {
    if ((await moved.count()) === 0) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(moved).toBeAttached({ timeout: 2000 });
  }).toPass({ intervals: [500, 1000, 2000], timeout: STEP_MS });
  await page.keyboard.press("Space");
  expect((await saved).ok()).toBe(true);
  await expect(
    page.getByText(`${FIRST} neergezet op positie 2 van 2.`)
  ).toBeAttached({ timeout: STEP_MS });
  await expectSaved(page);

  // A section, titled, and the first gesture moved into it from its row menu.
  await page.getByRole("button", { name: "Sectie toevoegen" }).click();
  await page.getByRole("textbox", { name: "Titel van sectie 1" }).fill(SECTION);
  await page.getByRole("button", { name: `Acties voor ${FIRST}` }).click();
  await page
    .getByRole("menuitem", { name: `Verplaatsen naar ${SECTION}` })
    .click();
  await expectSaved(page);
  const section = page.getByTestId("lesson-section");
  await expect(section.getByText(FIRST)).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("lesson-save-status")).toHaveText(SAVED, {
    timeout: STEP_MS,
  });
  const after = page.getByTestId("lesson-section");
  await expect(after).toHaveCount(1);
  await expect(after.getByText(FIRST)).toBeVisible();
  await expect(after.getByText(SECOND)).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Titel van sectie 1" })
  ).toHaveValue(SECTION);
  // The ungrouped part, before the section, holds the other gesture.
  await expect(gestureRows(page).getByText(SECOND)).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  // 320 px: the builder reflows, no sideways scroll.
  await page.setViewportSize({ height: 900, width: 320 });
  // The page does not scroll sideways (a tab list scrolls inside itself).
  const sideways = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      offenders: Array.from(document.body.querySelectorAll("*"))
        .filter(
          (node) =>
            node.getBoundingClientRect().right > width + 1 &&
            !node.closest('[role="tablist"]')
        )
        .map(
          (node) =>
            `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`
        )
        .slice(0, 8),
      overflow: document.documentElement.scrollWidth - width,
    };
  });
  expect(sideways.overflow, sideways.offenders.join(", ")).toBeLessThanOrEqual(
    0
  );
  expect(await blockingViolations(page)).toEqual([]);
  await page.setViewportSize({ height: 900, width: 1280 });
});

test("a title and notes in another language are saved too, and a missing title stops the save", async () => {
  const page = authorPage;
  await page.getByRole("tab", { name: ENGLISH_TAB }).click();
  const panel = page.getByRole("tabpanel", { name: ENGLISH_TAB });
  await panel.getByRole("textbox", { name: NOTES_LABEL }).fill("Notes only");
  await expect(
    page.getByText("Een taal met notities heeft ook een titel nodig", {
      exact: false,
    })
  ).toBeVisible();
  await expect(page.getByTestId("lesson-save-status")).toHaveAttribute(
    "data-status",
    "invalid",
    { timeout: STEP_MS }
  );
  const saved = page.waitForResponse("**/api/rpc/lessons/update", {
    timeout: STEP_MS,
  });
  await panel.getByRole("textbox", { name: "Titel" }).fill("English title");
  expect((await saved).ok()).toBe(true);
  await expectSaved(page);
  await page.reload();
  await page.getByRole("tab", { name: ENGLISH_TAB }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: ENGLISH_TAB })
      .getByRole("textbox", { name: "Titel" })
  ).toHaveValue("English title");
});

test("another teacher reads the lesson read-only and makes their own copy, then deletes it", async () => {
  const page = otherPage;
  await openAdmin(page, "/admin/lessons");
  // Search finds it by its title, in the list of every teacher's lessons.
  await page.getByRole("searchbox", { name: "Lessen zoeken" }).fill(WORD);
  const row = page.getByRole("row", { name: TITLE_CELL });
  await expect(row).toBeVisible({ timeout: STEP_MS });
  expect(await blockingViolations(page)).toEqual([]);
  await row.getByText(TITLE, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(lessonUrl)}$`));
  await expect(
    page.getByText(
      "bewerkt deze les. Je kunt ze lezen en er een eigen kopie van maken.",
      {
        exact: false,
      }
    )
  ).toBeVisible({ timeout: STEP_MS });
  await expect(
    page.getByRole("textbox", { name: "Titel" }).first()
  ).toHaveJSProperty("readOnly", true);
  await expect(
    page.getByRole("button", { name: "Gebaren toevoegen" })
  ).toHaveCount(0);
  await expect(page.getByTestId("lesson-save-status")).toHaveCount(0);
  await expect(
    page.getByTestId("lesson-section").getByText(FIRST)
  ).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
  // The server refuses a write by a teacher who is not the author.
  const refused = await page.request.post("/api/rpc/lessons/update", {
    data: {
      json: {
        expectedVersion: 1,
        id: lessonUrl.split("/").pop(),
        number: null,
        sections: [],
        translations: { nl: { notes: "", title: "Overgenomen" } },
        ungrouped: [],
      },
    },
    headers: { origin: ORIGIN },
  });
  expect(refused.status()).toBe(403);

  await page.getByRole("button", { exact: true, name: "Kopie maken" }).click();
  // The copy's own address (the lesson being read has the same shape).
  await page.waitForURL(
    (url) => BUILDER_URL.test(url.pathname) && url.pathname !== lessonUrl,
    { timeout: STEP_MS }
  );
  await expect(page.getByTestId("lesson-save-status")).toHaveText(SAVED, {
    timeout: STEP_MS,
  });
  await expect(
    page.getByTestId("lesson-section").getByText(FIRST)
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Titel" }).first()
  ).toHaveJSProperty("readOnly", false);

  // The copy is the other teacher's: delete it from the list, after a confirmation.
  await openAdmin(page, "/admin/lessons");
  await page.getByRole("switch", { name: "Mijn lessen" }).click();
  const mine = page.getByRole("button", { name: `Acties voor ${TITLE}` });
  await expect(mine).toHaveCount(1, { timeout: STEP_MS });
  await mine.click();
  await page.getByRole("menuitem", { name: "Verwijderen" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Deze les verwijderen?",
  });
  await expect(confirm).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
  await confirm.getByRole("button", { name: "Les verwijderen" }).click();
  await expect(page.getByText("Les verwijderd.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Acties voor ${TITLE}` })
  ).toHaveCount(0);
  // The original is untouched.
  await page.getByRole("switch", { name: "Mijn lessen" }).click();
  await expect(page.getByRole("row", { name: TITLE_CELL })).toHaveCount(1);
});

test("the author deletes the lesson from its row menu", async () => {
  const page = authorPage;
  await openAdmin(page, "/admin/lessons");
  await page.getByRole("searchbox", { name: "Lessen zoeken" }).fill(WORD);
  const menu = page.getByRole("button", { name: `Acties voor ${TITLE}` });
  await expect(menu).toHaveCount(1, { timeout: STEP_MS });
  await menu.click();
  await page.getByRole("menuitem", { name: "Verwijderen" }).click();
  await page
    .getByRole("alertdialog", { name: "Deze les verwijderen?" })
    .getByRole("button", { name: "Les verwijderen" })
    .click();
  await expect(page.getByText("Les verwijderd.")).toBeVisible();
  await expect(page.getByText("Geen lessen gevonden")).toBeVisible();
  // The old address is the not-found state now.
  await openAdmin(page, lessonUrl);
  await expect(page.getByText("Les niet gevonden")).toBeVisible();
});

test("a learner and a translator have no lessons: the 404 page and refused procedures", async ({
  page,
}) => {
  await signInWithApi(page);
  const learner = await page.goto("/admin/lessons");
  expect(learner?.status()).toBe(404);
  const read = await page.request.post("/api/rpc/lessons/list", {
    data: { json: {} },
    headers: { origin: ORIGIN },
  });
  expect(read.status()).toBe(403);

  // The same browser, now a translator: lessons are not theirs either.
  await signedInAs(page, "translator");
  const response = await page.goto("/admin/lessons");
  expect(response?.status()).toBe(404);
  const refused = await page.request.post("/api/rpc/lessons/list", {
    data: { json: {} },
    headers: { origin: ORIGIN },
  });
  expect(refused.status()).toBe(403);
});
