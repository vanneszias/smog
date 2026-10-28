import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { adminRpc, openAdmin, stubMuxMedia } from "../../support/e2e/admin";
import {
  blockingViolations,
  e2eSeed,
  signInWithApi,
} from "../../support/e2e/helpers";
import { signInAsAdmin } from "../../support/e2e/maintenance";

/*
 * The lesson export dialog (phase 10c task 5b), in Belgian Dutch. A teacher
 * opens a lesson, chooses a template and a language, sees what the PDF will
 * contain (a gesture with no text of its own in French prints the Dutch,
 * marked; the participants' sheet needs a drawing), downloads it, and the
 * file is a PDF named after the lesson. The dialog passes axe. The lesson and
 * the gesture are the spec's own and removed afterwards.
 */

const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const STEP_MS = 15_000;

function letters(length: number): string {
  return Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
}

const WORD = `px${letters(8)}`;
const GESTURE = `Zz${WORD} gebaar`;
const TITLE = `Les ${WORD}`;
const LANGUAGE_LABEL = /^Taal van de pdf/;
const FRENCH = /Français/;
const PARTICIPANTS = /^Voor cursisten/;

let lessonId = "";
let gestureId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
  const categories = await adminRpc<
    { id: string; publishedAt: number | null }[]
  >(request, "admin/categories/list");
  const seeded = categories.find((item) => item.publishedAt !== null);
  if (!seeded) {
    throw new Error("[e2e] the dev seed has no published category");
  }
  const gesture = await adminRpc<{ id: string }>(
    request,
    "admin/gestures/create",
    {
      categoryIds: [seeded.id],
      name: GESTURE,
      playbackId: SAMPLE_PLAYBACK_ID,
      published: true,
    }
  );
  gestureId = gesture.id;
  await adminRpc(request, "teacher/saveInfo", {
    expectedVersion: null,
    fields: {
      bw: "beweegt naar boven",
      cNote: "",
      hc: "vlakke hand",
      note: "",
      or: "",
      pl: "naast het hoofd",
      summary: "",
    },
    gestureId,
    locale: "nl",
  });
  const created = await adminRpc<{ id: string }>(request, "lessons/create", {
    locale: "nl",
    number: 4,
    title: TITLE,
  });
  lessonId = created.id;
  await adminRpc(request, "lessons/update", {
    expectedVersion: 1,
    id: lessonId,
    number: 4,
    sections: [],
    translations: { nl: { notes: "", title: TITLE } },
    ungrouped: [gestureId],
  });
});

test.afterAll(async ({ request }) => {
  await signInAsAdmin(request);
  await adminRpc(request, "lessons/delete", { id: lessonId });
  await adminRpc(request, "admin/gestures/bulkUpdate", {
    ids: [gestureId],
    published: false,
  });
  await adminRpc(request, "admin/gestures/delete", {
    confirmName: GESTURE,
    id: gestureId,
  });
});

async function openDialog(page: Page) {
  await openAdmin(page, `/admin/lessons/${lessonId}`);
  await page.getByRole("button", { name: "Pdf maken" }).click();
  const dialog = page.getByRole("dialog", { name: "Les als pdf" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a teacher previews the PDF in two languages and downloads it", async ({
  page,
}) => {
  await stubMuxMedia(page);
  const email = await signInWithApi(page);
  await e2eSeed(page.request, [{ email, op: "grantRole", role: "teacher" }]);
  const dialog = await openDialog(page);

  // Dutch, for teachers: the gesture is complete, nothing to check.
  await expect(dialog.getByText("1 gebaar komt in de pdf.")).toBeVisible({
    timeout: STEP_MS,
  });
  await expect(
    dialog.getByText("Alle gebaren zijn volledig ingevuld in Nederlands.")
  ).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  // French: the gesture has no French text, the PDF prints the Dutch, marked.
  await dialog.getByRole("combobox", { name: LANGUAGE_LABEL }).click();
  await page.getByRole("option", { name: FRENCH }).click();
  await expect(dialog.getByText("Tekst in de standaardtaal")).toBeVisible({
    timeout: STEP_MS,
  });
  await expect(dialog.getByText(GESTURE)).toBeVisible();

  // The participants' sheet wants a drawing this gesture does not have.
  await dialog.getByRole("radio", { name: PARTICIPANTS }).click();
  await expect(dialog.getByText("Geen tekening")).toBeVisible({
    timeout: STEP_MS,
  });
  expect(await blockingViolations(page)).toEqual([]);

  // Back to the teachers' sheet in Dutch, and download it.
  await dialog.getByRole("combobox", { name: LANGUAGE_LABEL }).click();
  await page.getByRole("option", { name: "Nederlands" }).click();
  await dialog.getByRole("radio", { name: "Voor lesgevers" }).click();
  await expect(
    dialog.getByText("Alle gebaren zijn volledig ingevuld in Nederlands.")
  ).toBeVisible({ timeout: STEP_MS });
  const download = page.waitForEvent("download", { timeout: 30_000 });
  await dialog.getByRole("button", { name: "Pdf downloaden" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("les-4-nl.pdf");
  const path = await file.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.byteLength).toBeGreaterThan(1000);
  await expect(page.getByText("Pdf gedownload.")).toBeVisible({
    timeout: STEP_MS,
  });
  await expect(dialog).toBeHidden();
});

test("a learner is refused the file", async ({ page }) => {
  await signInWithApi(page);
  const response = await page.request.get(
    `/api/teacher/lessons/${lessonId}/pdf?template=teachers&locale=nl`
  );
  expect(response.status()).toBe(403);
  expect(response.headers()["content-type"]).not.toContain("pdf");
});
