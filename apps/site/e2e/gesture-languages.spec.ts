import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { adminRpc } from "./admin";
import { blockingViolations, ORIGIN, stubMux, waitForApp } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The catalogue in a second language (phase 10b task 5). A gesture of the
 * spec's own (`Zz…`, created and deleted through the admin API, so no seeded
 * row changes) is translated into French and not into English. In French the
 * list, the detail page and the search show the French name and find it
 * through the translated name and keyword, accent-insensitively; in English,
 * where it has no translation, it is still found by its Dutch name and shown
 * in Dutch. The Dutch site is unchanged.
 */

const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const STREAM_ERROR = /mux|media|Failed to load resource/i;

function letters(length: number): string {
  return Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
}

/** A word no seeded gesture has (lowercase letters only, for the full-text index). */
const WORD = `zz${letters(8)}`;
const FRENCH_NAME = `Écureuil ${WORD}`;
const FRENCH_KEYWORD = `noisette${letters(8)}`;
const DUTCH_KEYWORD = `eikel${letters(8)}`;
const DUTCH_NAME = `Zz${WORD}`;

interface Made {
  id: string;
  slug: string;
}

let made: Made | null = null;

async function lang(page: Page, locale: string): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "locale", url: ORIGIN, value: locale }]);
}

async function create(request: APIRequestContext): Promise<Made> {
  const list = await adminRpc<{ id: string; publishedAt: number | null }[]>(
    request,
    "admin/categories/list"
  );
  const items = list.filter((item) => item.publishedAt !== null);
  const [category] = items;
  if (!category) {
    throw new Error("[e2e] the dev seed has no published category");
  }
  const gesture = await adminRpc<Made & { updatedAt: number }>(
    request,
    "admin/gestures/create",
    {
      categoryIds: [category.id],
      description: "Een eekhoorn.",
      keywords: [DUTCH_KEYWORD],
      name: DUTCH_NAME,
      playbackId: SAMPLE_PLAYBACK_ID,
      published: true,
    }
  );
  await adminRpc(request, "catalogTranslation/gestures/save", {
    description: "Un écureuil roux.",
    expectedUpdatedAt: null,
    id: gesture.id,
    keywords: [FRENCH_KEYWORD],
    locale: "fr",
    name: FRENCH_NAME,
  });
  return { id: gesture.id, slug: gesture.slug };
}

async function remove(request: APIRequestContext, row: Made): Promise<void> {
  const current = await adminRpc<{ name: string }>(
    request,
    "admin/gestures/get",
    { id: row.id }
  );
  await adminRpc(request, "admin/gestures/setPublished", {
    id: row.id,
    published: false,
  });
  await adminRpc(request, "admin/gestures/delete", {
    confirmName: current.name,
    id: row.id,
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
  made = await create(request);
});

test.afterAll(async ({ request }) => {
  if (made) {
    await signInAsAdmin(request);
    await remove(request, made);
    made = null;
  }
});

test("the list and the detail page are in French, the untranslated gestures stay Dutch", async ({
  page,
}) => {
  await stubMux(page);
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  await lang(page, "fr");
  await page.goto(`/gestures?q=${WORD}`);
  await waitForApp(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("link", { name: FRENCH_NAME }).first()
  ).toBeVisible();

  // The whole catalogue: the translated name, and a seeded gesture that has
  // no translation in its Dutch name.
  await page.goto("/gestures");
  await waitForApp(page);
  await expect(
    page.getByRole("link", { name: FRENCH_NAME }).first()
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Hond" }).first()).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  await page.goto(`/gestures/${made?.slug}`);
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: FRENCH_NAME })
  ).toBeVisible();
  await expect(page.getByText("Un écureuil roux.")).toBeVisible();
  // One slug per gesture: the URL carries the Dutch name's.
  await expect(page).toHaveURL(new RegExp(`/gestures/${made?.slug}$`));
});

test("French searches match the translated name and keyword, without accents", async ({
  page,
}) => {
  await stubMux(page);
  await lang(page, "fr");
  for (const q of ["ecureuil", FRENCH_KEYWORD, `ECUREUIL ${WORD}`]) {
    // biome-ignore lint/performance/noAwaitInLoops: one page per query, in order.
    await page.goto(`/gestures?q=${encodeURIComponent(q)}`);
    await waitForApp(page);
    await expect(
      page.getByRole("link", { name: FRENCH_NAME }).first()
    ).toBeVisible();
  }
  // The Dutch keyword belongs to the Dutch row: French does not match it.
  await page.goto(`/gestures?q=${DUTCH_KEYWORD}`);
  await waitForApp(page);
  await expect(page.getByRole("link", { name: FRENCH_NAME })).toHaveCount(0);
});

test("English has no translation of it: found by its Dutch name, shown in Dutch", async ({
  page,
}) => {
  await stubMux(page);
  await lang(page, "en");
  await page.goto(`/gestures?q=${WORD}`);
  await waitForApp(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("link", { name: DUTCH_NAME }).first()
  ).toBeVisible();
  await expect(page.getByRole("link", { name: FRENCH_NAME })).toHaveCount(0);
  // A learner is not told that a translation is missing.
  await page.goto(`/gestures/${made?.slug}`);
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: DUTCH_NAME })
  ).toBeVisible();
  await expect(page.getByText("Needs translation")).toHaveCount(0);
});

test("the Dutch site is unchanged by the translations", async ({ page }) => {
  await stubMux(page);
  await lang(page, "nl");
  await page.goto(`/gestures?q=${DUTCH_KEYWORD}`);
  await waitForApp(page);
  await expect(
    page.getByRole("link", { name: DUTCH_NAME }).first()
  ).toBeVisible();
  await page.goto("/gestures?q=ecureuil");
  await waitForApp(page);
  await expect(page.getByRole("link", { name: FRENCH_NAME })).toHaveCount(0);
});

test("switching the language in the menu shows the French name without a reload of the page's data by hand", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await stubMux(page);
  await lang(page, "nl");
  await page.goto(`/gestures?q=${WORD}`);
  await waitForApp(page);
  await expect(
    page.getByRole("link", { name: DUTCH_NAME }).first()
  ).toBeVisible();
  // The cached Dutch answers are dropped when the language changes.
  await page.getByRole("button", { name: "Instellingen" }).click();
  await page.getByRole("menuitemradio", { name: "Français" }).click();
  await expect(
    page.getByRole("link", { name: FRENCH_NAME }).first()
  ).toBeVisible();
  expect(errors.filter((message) => !STREAM_ERROR.test(message))).toEqual([]);
});
