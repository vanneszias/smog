import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type APIRequestContext,
  type Browser,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  blockingViolations,
  ORIGIN,
  stubMux,
  waitForApp,
  watchErrors,
} from "./helpers";

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
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const GESTURE_EDITOR_URL = /\/admin\/gestures\/(?!new$)[A-Za-z0-9_-]+$/;
const HEADERS = { origin: ORIGIN };
/** The video player is third party; its error dialog opens because HLS is refused. */
const PLAYER = { exclude: ["mux-player"] };
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

/** A word no seeded gesture has (lowercase letters only, for FTS). */
function tag(): string {
  return Array.from(
    { length: 8 },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
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

async function seededCategoryId(request: APIRequestContext): Promise<string> {
  const [first] = (await categories(request)).filter(
    (category) => category.publishedAt !== null
  );
  if (!first) {
    throw new Error("the dev seed has no published category");
  }
  return first.id;
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

/** Mux stills and HLS are not reachable offline: stills are stubbed, streams refused. */
async function stubMuxMedia(page: Page): Promise<void> {
  await stubMux(page);
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  await page.route("https://*.litix.io/**", (route) => route.abort());
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
      expect(await blockingViolations(page, PLAYER)).toEqual([]);
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

      // A stale save: another admin saves first, this editor gets the dialog.
      await open(page, `/admin/gestures/${gestureId}`);
      const current = await getGesture(page.request, created.id);
      await rpc(page.request, "admin/gestures/update", {
        description: "Uitleg van een andere beheerder",
        expectedUpdatedAt: current.updatedAt,
        id: created.id,
      });
      await page.getByLabel("Beschrijving").fill("Mijn eigen uitleg");
      await page.getByRole("button", { name: "Opslaan" }).click();
      const conflict = page.getByRole("alertdialog", {
        name: "Iemand anders wijzigde dit gebaar",
      });
      await expect(conflict).toBeVisible();
      expect(await blockingViolations(page, PLAYER)).toEqual([]);
      await conflict
        .getByRole("button", {
          name: "Herladen (mijn wijzigingen gaan verloren)",
        })
        .click();
      await expect(page.getByLabel("Beschrijving")).toHaveValue(
        "Uitleg van een andere beheerder"
      );

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
    const categoryId = await seededCategoryId(page.request);
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

  test("bulk-selects and publishes 100 gestures in one call", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const word = tag();
    const categoryId = await seededCategoryId(page.request);
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
    test.setTimeout(120_000);
    const original = (await categories(page.request)).map(
      (category) => category.id
    );
    try {
      await reorderByKeyboard(page);
    } finally {
      // Whatever happened, the seeded order comes back (other specs read it).
      const now = (await categories(page.request)).map(
        (category) => category.id
      );
      if (now.join() !== original.join()) {
        await rpc(page.request, "admin/categories/reorder", { ids: original });
      }
    }
  });

  test("the QR dialog downloads smog-<slug>-qr.png", async ({ page }) => {
    await qrDownload(page);
  });
});

/** Moves the first published category down and back up, by keyboard. */
async function reorderByKeyboard(page: Page): Promise<void> {
  const order = async () =>
    (await categories(page.request))
      .filter((category) => category.publishedAt !== null)
      .map((category) => category.name);
  const before = await order();
  const [first, second] = before;
  if (!(first && second)) {
    throw new Error("the dev seed needs two published categories");
  }
  await open(page, "/admin/categories");
  const handle = page.getByRole("button", {
    name: `Slepen om de volgorde te wijzigen: ${first}`,
  });
  const saved = page.waitForResponse("**/api/rpc/admin/categories/reorder");
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  expect((await saved).ok()).toBe(true);
  await expect(
    page.getByText(`${first} neergezet op positie 2 van ${before.length}.`)
  ).toBeAttached();
  expect((await order()).slice(0, 2)).toEqual([second, first]);
  expect(await blockingViolations(page)).toEqual([]);

  // Back where it was (other specs read the seeded order).
  const restored = page.waitForResponse("**/api/rpc/admin/categories/reorder");
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  expect((await restored).ok()).toBe(true);
  expect(await order()).toEqual(before);
}

/** Opens a gesture's QR dialog from the list's row menu and downloads it. */
async function qrDownload(page: Page): Promise<void> {
  const word = tag();
  const gesture = await createGesture(
    page.request,
    `Zzqr ${word}`,
    await seededCategoryId(page.request)
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

/*
 * Review screenshots (light/dark × 390/1280, reduced motion, nl-BE) of the
 * list, the table editor, the editor and the categories, only when
 * ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test admin-catalog`.
 */
test.describe("admin catalogue screenshots", () => {
  test("screenshots", async () => {
    test.setTimeout(600_000);
    const dir = process.env.ADMIN_SHOTS_DIR;
    test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");
    await mkdir(dir ?? "", { recursive: true });
    const browser: Browser = await chromium.launch({
      args: ["--lang=nl-BE"],
      env: { ...process.env, LANG: "nl_BE.UTF-8", LANGUAGE: "nl_BE" },
      ...(existsSync(PREINSTALLED_CHROMIUM)
        ? { executablePath: PREINSTALLED_CHROMIUM }
        : {}),
    });
    for (const theme of ["light", "dark"] as const) {
      for (const width of [390, 1280]) {
        // biome-ignore lint/performance/noAwaitInLoops: one context at a time.
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
        await stubMuxMedia(page);
        await signInAsAdmin(page);
        const shot = async (name: string): Promise<void> => {
          await page.evaluate(() => {
            for (const image of document.querySelectorAll("img")) {
              image.loading = "eager";
            }
          });
          await page.waitForTimeout(500);
          await page.screenshot({
            fullPage: true,
            path: join(dir ?? "", `catalog-${name}-${theme}-${width}.png`),
          });
        };
        await open(page, "/admin/gestures");
        await expect(page.getByRole("link", { name: "Hond" })).toBeVisible();
        await page.getByRole("checkbox", { name: "Hond selecteren" }).click();
        await shot("list");
        await page.getByRole("button", { name: "Selectie wissen" }).click();
        await page.getByRole("button", { name: "Tabel bewerken" }).click();
        await page
          .getByRole("textbox", { name: "Naam van Hond" })
          .fill("Hond (bewerkt)");
        await shot("table-editor");
        await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
        await shot("table-changes");
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Verwerpen (1)" }).click();
        await open(page, "/admin/gestures/new");
        await page.getByRole("button", { name: "Gebaar aanmaken" }).click();
        await shot("editor-new");
        const hond = (
          await rpc<{ items: AdminGesture[] }>(
            page.request,
            "admin/gestures/list",
            {
              q: "hond",
            }
          )
        ).items.find((item) => item.name === "Hond");
        await open(page, `/admin/gestures/${hond?.id}`);
        await page.getByRole("textbox", { name: "Naam" }).fill("Kat");
        await expect(page.getByText("Mogelijk dubbel")).toBeVisible();
        await shot("editor");
        await open(page, "/admin/categories");
        await expect(
          page.getByRole("heading", { name: "Verborgen" })
        ).toBeVisible();
        await shot("categories");
        await context.close();
      }
    }
    await browser.close();
  });
});
