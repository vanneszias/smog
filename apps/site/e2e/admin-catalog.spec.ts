import { readFile } from "node:fs/promises";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { stubMuxMedia } from "./admin";
import { blockingViolations, ORIGIN, waitForApp, watchErrors } from "./helpers";

/*
 * The catalogue admin (phase 5 task 4) against the dev server's local D1,
 * as the seeded admin, in Belgian Dutch: a category and a gesture are
 * created in the UI and the public site finds the gesture at once; a
 * rename keeps the slug; a stale save shows the conflict; unpublishing
 * 404s the public page while the admin still lists it; the table editor
 * saves two rows in one call; 100 selected gestures are published in one
 * bulk call (the contract's maximum); categories reorder by keyboard; the
 * QR dialog downloads `smog-<slug>-qr.png`. Everything a test creates is
 * deleted again (gestures are named `Zz…`, so they sort last meanwhile).
 */

const ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const GESTURE_EDITOR_URL = /\/admin\/gestures\/(?!new$)[A-Za-z0-9_-]+$/;
const HEADERS = { origin: ORIGIN };
const PNG_MAGIC = "89504e470d0a1a0a";
const EXPECTED_ERRORS = [
  "mux-player",
  "getErrorFromHlsErrorData",
  "net::ERR_FAILED",
  "409 (Conflict)",
  "Failed to save the gesture: ORPCError: Conflict",
];

interface AdminGesture {
  categories: { id: string }[];
  description: string;
  id: string;
  keywords: string[];
  name: string;
  publishedAt: number | null;
  slug: string;
  updatedAt: number;
}

interface AdminCategory {
  gestureCount: number;
  id: string;
  name: string;
  publishedAt: number | null;
}

function letters(length: number): string {
  return Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
}

/** This run's prefix: every name the spec creates starts its word with it. */
const RUN = letters(4);

/** A word no seeded gesture has (lowercase letters only, for FTS). */
function tag(): string {
  return `${RUN}${letters(6)}`;
}

async function signInAsAdmin(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: ADMIN,
    headers: HEADERS,
  });
  expect(response.ok()).toBe(true);
}

/** One oRPC call over HTTP, as the admin client makes it. */
async function rpc<T>(
  request: APIRequestContext,
  path: string,
  input: unknown = null
): Promise<T> {
  const response = await request.post(`/api/rpc/${path}`, {
    data: { json: input },
    headers: HEADERS,
  });
  const body = (await response.json()) as { json: T };
  if (!response.ok()) {
    throw new Error(`${path}: ${response.status()} ${JSON.stringify(body)}`);
  }
  return body.json;
}

async function categories(
  request: APIRequestContext
): Promise<AdminCategory[]> {
  return await rpc<AdminCategory[]>(request, "admin/categories/list");
}

/** The categories this run made, deleted after each test (`afterEach`). */
const madeCategories: string[] = [];

/**
 * A hidden category of the test's own, so the test touches no seeded row
 * (its gestures are counted there, never in the seeded categories).
 */
async function ownCategoryId(
  request: APIRequestContext,
  word: string
): Promise<string> {
  const made = await rpc<AdminCategory>(request, "admin/categories/create", {
    name: `Zzcat ${word}`,
    published: false,
  });
  madeCategories.push(made.id);
  return made.id;
}

async function createGesture(
  request: APIRequestContext,
  name: string,
  categoryId: string,
  published = false
): Promise<AdminGesture> {
  return await rpc<AdminGesture>(request, "admin/gestures/create", {
    categoryIds: [categoryId],
    name,
    playbackId: SAMPLE_PLAYBACK_ID,
    published,
  });
}

async function getGesture(
  request: APIRequestContext,
  id: string
): Promise<AdminGesture> {
  return await rpc<AdminGesture>(request, "admin/gestures/get", { id });
}

/** Unpublishes (as delete requires) and deletes the gestures. */
async function deleteGestures(
  request: APIRequestContext,
  ids: readonly string[]
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  for (let start = 0; start < ids.length; start += 100) {
    // biome-ignore lint/performance/noAwaitInLoops: bulkUpdate takes at most 100.
    await rpc(request, "admin/gestures/bulkUpdate", {
      ids: ids.slice(start, start + 100),
      published: false,
    });
  }
  for (const id of ids) {
    // biome-ignore lint/performance/noAwaitInLoops: one D1 batch at a time.
    const gesture = await getGesture(request, id);
    await rpc(request, "admin/gestures/delete", {
      confirmName: gesture.name,
      id,
    });
  }
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
  // The consent banner shows after hydration; answer it so it covers nothing.
  await page
    .getByRole("button", { name: "Alleen noodzakelijke" })
    .click({ timeout: 5000 })
    .catch(() => undefined);
}

test.describe("admin catalogue", () => {
  test.beforeEach(async ({ page }) => {
    await stubMuxMedia(page);
    await signInAsAdmin(page);
  });

  // After the tests' own `finally` deleted their gestures.
  test.afterEach(async ({ page }) => {
    for (const id of madeCategories.splice(0)) {
      // biome-ignore lint/performance/noAwaitInLoops: one at a time.
      await rpc(page.request, "admin/categories/delete", { id });
    }
  });

  test("creates, renames, conflicts, unpublishes and publishes a gesture", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    const word = tag();
    const categoryName = `E2E categorie ${word}`;
    const name = `Zzproef ${word}`;
    let gestureId: string | null = null;
    try {
      // A category, created in the UI.
      await open(page, "/admin/categories");
      await page.getByRole("button", { name: "Nieuwe categorie" }).click();
      const form = page.getByRole("dialog", { name: "Nieuwe categorie" });
      await form.getByRole("textbox", { name: "Naam" }).fill(categoryName);
      await form.getByRole("button", { name: "Aanmaken" }).click();
      await expect(page.getByText(categoryName, { exact: true })).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);

      // A gesture in it, with a pasted playback id.
      await open(page, "/admin/gestures/new");
      await page.getByRole("textbox", { name: "Naam" }).fill(name);
      await page.getByRole("tab", { name: "Playback-id" }).click();
      await page
        .getByRole("textbox", { name: "Playback-id" })
        .fill(SAMPLE_PLAYBACK_ID);
      await page.getByRole("button", { name: "Deze video gebruiken" }).click();
      await page.getByRole("button", { name: categoryName }).click();
      await expect(
        page.getByRole("switch", { name: "Gepubliceerd" })
      ).toBeChecked();
      expect(await blockingViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "Gebaar aanmaken" }).click();
      await expect(page).toHaveURL(GESTURE_EDITOR_URL);
      gestureId = new URL(page.url()).pathname.split("/").pop() ?? null;
      const created = await getGesture(page.request, gestureId ?? "");
      const { slug } = created;
      await expect(page.getByText(slug, { exact: true })).toBeVisible();

      // It shows in the admin list at once, and the public search finds it.
      await open(page, `/admin/gestures?q=${word}`);
      await expect(page.getByRole("link", { name })).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
      await open(page, `/gestures?q=${word}`);
      await expect(page.getByRole("link", { name }).first()).toBeVisible();

      // Rename: the public search finds the new name, the slug stays.
      const renamedWord = tag();
      const renamed = `Zzwuiven ${renamedWord}`;
      await open(page, `/admin/gestures/${gestureId}`);
      await page.getByRole("textbox", { name: "Naam" }).fill(renamed);
      const renaming = page.waitForResponse("**/api/rpc/admin/gestures/update");
      await page.getByRole("button", { name: "Opslaan" }).click();
      expect((await renaming).ok()).toBe(true);
      expect((await getGesture(page.request, created.id)).slug).toBe(slug);
      const publicPage = await page.request.get(`/gestures/${slug}`);
      expect(publicPage.status()).toBe(200);
      expect(await publicPage.text()).toContain(renamed);
      await open(page, `/gestures?q=${renamedWord}`);
      await expect(
        page.getByRole("link", { name: renamed }).first()
      ).toBeVisible();

      // A stale save (C1): another admin changes the keywords and the
      // description; this editor changes the description too. The keywords
      // merge in silently, the description is a conflict; Escape changes
      // nothing, their version is the default.
      await open(page, `/admin/gestures/${gestureId}`);
      const current = await getGesture(page.request, created.id);
      await rpc(page.request, "admin/gestures/update", {
        description: "Uitleg van een andere beheerder",
        expectedUpdatedAt: current.updatedAt,
        id: created.id,
        keywords: ["van-b"],
      });
      await page.getByLabel("Beschrijving").fill("Mijn eigen uitleg");
      await page.getByRole("button", { name: "Opslaan" }).click();
      const conflict = page.getByRole("dialog", {
        name: "Iemand anders wijzigde dit gebaar",
      });
      await expect(conflict).toBeVisible();
      await expect(
        conflict.getByRole("table", { name: "Beschrijving" })
      ).toContainText("Uitleg van een andere beheerder");
      expect(await blockingViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(conflict).toBeHidden();
      await expect(page.getByLabel("Beschrijving")).toHaveValue(
        "Mijn eigen uitleg"
      );
      await page.getByRole("button", { name: "Opslaan" }).click();
      await page
        .getByRole("dialog", { name: "Iemand anders wijzigde dit gebaar" })
        .getByRole("button", { name: "Hun versie gebruiken" })
        .click();
      await expect(page.getByLabel("Beschrijving")).toHaveValue(
        "Uitleg van een andere beheerder"
      );
      expect((await getGesture(page.request, created.id)).keywords).toEqual([
        "van-b",
      ]);

      // Unpublish: the public page 404s, the admin still lists it.
      await page.getByRole("switch", { name: "Gepubliceerd" }).click();
      const hiding = page.waitForResponse(
        "**/api/rpc/admin/gestures/setPublished"
      );
      await page.getByRole("button", { name: "Opslaan" }).click();
      expect((await hiding).ok()).toBe(true);
      expect((await page.request.get(`/gestures/${slug}`)).status()).toBe(404);
      await open(page, `/admin/gestures?q=${renamedWord}&status=unpublished`);
      await expect(page.getByRole("link", { name: renamed })).toBeVisible();

      // Publish again from the list's switch.
      const toggle = page.getByRole("switch", {
        name: `${renamed} gepubliceerd`,
      });
      await expect(toggle).not.toBeChecked();
      const publishing = page.waitForResponse(
        "**/api/rpc/admin/gestures/setPublished"
      );
      await toggle.click();
      expect((await publishing).ok()).toBe(true);
      // Published, it leaves the "hidden" filter.
      await expect(toggle).toHaveCount(0);
      expect((await page.request.get(`/gestures/${slug}`)).status()).toBe(200);
      // Expected: the refused HLS (offline) and the conflict this test caused.
      expect(
        errors.filter(
          (error) =>
            !EXPECTED_ERRORS.some((expected) => error.includes(expected))
        )
      ).toEqual([]);
    } finally {
      if (gestureId) {
        await deleteGestures(page.request, [gestureId]);
      }
      const made = (await categories(page.request)).find(
        (category) => category.name === categoryName
      );
      if (made) {
        await rpc(page.request, "admin/categories/delete", { id: made.id });
      }
    }
  });

  test("the table editor saves two rows in one call", async ({ page }) => {
    const word = tag();
    const categoryId = await ownCategoryId(page.request, word);
    const one = await createGesture(
      page.request,
      `Zzrij een ${word}`,
      categoryId
    );
    const two = await createGesture(
      page.request,
      `Zzrij twee ${word}`,
      categoryId
    );
    try {
      const saves: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/rpc/admin/gestures/saveMany")) {
          saves.push(request.url());
        }
      });
      await open(page, `/admin/gestures?q=${word}`);
      await page.getByRole("button", { name: "Tabel bewerken" }).click();
      await page
        .getByRole("textbox", { name: `Naam van ${one.name}` })
        .fill(`Zzrij één ${word}`);
      await page
        .getByRole("textbox", { name: `Beschrijving van ${two.name}` })
        .fill("Twee keer knikken");
      await expect(
        page.getByRole("button", { name: "Verwerpen (2)" })
      ).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
      const review = page.getByRole("dialog", {
        name: "Je wijzigingen nakijken",
      });
      await expect(review.getByText("Twee keer knikken")).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
      await review.getByRole("button", { name: "Wijzigingen opslaan" }).click();
      await expect(
        page.getByText("2 gebaren opgeslagen.", { exact: true })
      ).toBeVisible();
      expect(saves).toHaveLength(1);
      expect((await getGesture(page.request, one.id)).name).toBe(
        `Zzrij één ${word}`
      );
      expect((await getGesture(page.request, two.id)).description).toBe(
        "Twee keer knikken"
      );
    } finally {
      await deleteGestures(page.request, [one.id, two.id]);
    }
  });

  test("the table editor merges a stale save and guards unsaved edits", async ({
    page,
  }) => {
    const word = tag();
    const categoryId = await ownCategoryId(page.request, word);
    const one = await createGesture(
      page.request,
      `Zzbots een ${word}`,
      categoryId
    );
    const two = await createGesture(
      page.request,
      `Zzbots twee ${word}`,
      categoryId
    );
    try {
      await open(page, `/admin/gestures?q=${word}`);
      await page.getByRole("button", { name: "Tabel bewerken" }).click();
      await page
        .getByRole("textbox", { name: `Naam van ${one.name}` })
        .fill(`Zzbots mijn naam ${word}`);
      await page
        .getByRole("textbox", { name: `Beschrijving van ${two.name}` })
        .fill("Mijn uitleg");
      // The filters wait for the buffer, and leaving asks first.
      await expect(page.getByRole("searchbox")).toBeDisabled();
      await page
        .getByRole("navigation", { name: "Beheer" })
        .getByRole("link", { name: "Categorieën" })
        .click();
      const leave = page.getByRole("alertdialog", {
        name: "Weggaan zonder op te slaan?",
      });
      await leave.getByRole("button", { name: "Blijven" }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/gestures\\?q=${word}`));
      await expect(
        page.getByRole("button", { name: "Verwerpen (2)" })
      ).toBeVisible();

      // Another admin renames row one meanwhile: a conflict on its name.
      await rpc(page.request, "admin/gestures/update", {
        expectedUpdatedAt: one.updatedAt,
        id: one.id,
        name: `Zzbots naam van B ${word}`,
      });
      await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
      await page
        .getByRole("dialog", { name: "Je wijzigingen nakijken" })
        .getByRole("button", { name: "Wijzigingen opslaan" })
        .click();
      const banner = page
        .getByRole("alert")
        .filter({ hasText: "Een andere beheerder wijzigde dezelfde velden" });
      await expect(banner).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
      await banner
        .getByRole("button", { name: "Hun versie gebruiken" })
        .click();
      await expect(
        page.getByRole("button", { name: "Verwerpen (1)" })
      ).toBeVisible();
      await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
      await page
        .getByRole("dialog", { name: "Je wijzigingen nakijken" })
        .getByRole("button", { name: "Wijzigingen opslaan" })
        .click();
      await expect(
        page.getByText("1 gebaar opgeslagen.", { exact: true })
      ).toBeVisible();
      expect((await getGesture(page.request, one.id)).name).toBe(
        `Zzbots naam van B ${word}`
      );
      expect((await getGesture(page.request, two.id)).description).toBe(
        "Mijn uitleg"
      );
    } finally {
      await deleteGestures(page.request, [one.id, two.id]);
    }
  });
  test("bulk-selects and publishes 100 gestures in one call", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const word = tag();
    const categoryId = await ownCategoryId(page.request, word);
    const ids: string[] = [];
    try {
      for (let start = 0; start < 100; start += 10) {
        // biome-ignore lint/performance/noAwaitInLoops: ten at a time, so the dev server keeps up.
        const batch = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            createGesture(
              page.request,
              `Zzbulk ${word} ${String(start + index).padStart(3, "0")}`,
              categoryId
            )
          )
        );
        ids.push(...batch.map((gesture) => gesture.id));
      }
      const bulk: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/rpc/admin/gestures/bulkUpdate")) {
          bulk.push(request.postData() ?? "");
        }
      });
      await open(page, `/admin/gestures?q=${word}&status=unpublished`);
      await expect(
        page.getByRole("link", { name: `Zzbulk ${word} 099` })
      ).toBeVisible();
      await page
        .getByRole("checkbox", {
          name: "Alle gebaren op deze pagina selecteren",
        })
        .click();
      const bar = page.getByRole("region", { name: "Geselecteerde gebaren" });
      await expect(bar.getByText("100 geselecteerd")).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
      await bar.getByRole("button", { name: "Publiceren" }).click();
      await expect(
        page.getByText("100 gebaren bijgewerkt.", { exact: true })
      ).toBeVisible();
      expect(bulk).toHaveLength(1);
      expect(JSON.parse(bulk[0] ?? "{}").json.ids).toHaveLength(100);
      await expect(page.getByText("Geen gebaren gevonden")).toBeVisible();
    } finally {
      await deleteGestures(page.request, ids);
    }
  });

  test("reorders categories by keyboard, announcing the move", async ({
    page,
  }) => {
    // Only categories this test owns: two hidden ones, reordered within
    // the hidden section (the public order never changes).
    const word = tag();
    const made: AdminCategory[] = [];
    try {
      for (const name of [`Zzorde a ${word}`, `Zzorde b ${word}`]) {
        // biome-ignore lint/performance/noAwaitInLoops: created in this order.
        const category = await rpc<AdminCategory>(
          page.request,
          "admin/categories/create",
          { name, published: false }
        );
        made.push(category);
      }
      await reorderByKeyboard(page, made);
    } finally {
      for (const category of made) {
        // biome-ignore lint/performance/noAwaitInLoops: one at a time.
        await rpc(page.request, "admin/categories/delete", {
          id: category.id,
        });
      }
    }
  });

  test("the QR dialog downloads smog-<slug>-qr.png", async ({ page }) => {
    await qrDownload(page);
  });
});

/** Moves the test's first hidden category below its second, by keyboard. */
async function reorderByKeyboard(
  page: Page,
  made: readonly AdminCategory[]
): Promise<void> {
  const [first, second] = made;
  if (!(first && second)) {
    throw new Error("[e2e] two categories expected");
  }
  const mine = async () =>
    (await categories(page.request))
      .filter((category) => made.some((item) => item.id === category.id))
      .map((category) => category.name);
  expect(await mine()).toEqual([first.name, second.name]);
  const hidden = (await categories(page.request)).filter(
    (category) => category.publishedAt === null
  );
  await open(page, "/admin/categories");
  const handle = page.getByRole("button", {
    name: `Slepen om de volgorde te wijzigen: ${first.name}`,
  });
  const saved = page.waitForResponse("**/api/rpc/admin/categories/reorder");
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  expect((await saved).ok()).toBe(true);
  const position = hidden.findIndex((item) => item.id === second.id) + 1;
  await expect(
    page.getByText(
      `${first.name} neergezet op positie ${position} van ${hidden.length}.`
    )
  ).toBeAttached();
  expect(await mine()).toEqual([second.name, first.name]);
  expect(await blockingViolations(page)).toEqual([]);
}

/** Opens a gesture's QR dialog from the list's row menu and downloads it. */
async function qrDownload(page: Page): Promise<void> {
  const word = tag();
  const gesture = await createGesture(
    page.request,
    `Zzqr ${word}`,
    await ownCategoryId(page.request, word)
  );
  try {
    await open(page, `/admin/gestures?q=${word}`);
    await page
      .getByRole("button", { name: `Acties voor ${gesture.name}` })
      .click();
    await page.getByRole("menuitem", { name: "QR-code" }).click();
    const dialog = page.getByRole("dialog", {
      name: `QR-code voor ${gesture.name}`,
    });
    await expect(dialog.getByText(`/gestures/${gesture.slug}`)).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "QR-code downloaden" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`smog-${gesture.slug}-qr.png`);
    const file = await readFile((await download.path()) ?? "");
    expect(file.subarray(0, 8).toString("hex")).toBe(PNG_MAGIC);
  } finally {
    await deleteGestures(page.request, [gesture.id]);
  }
}
