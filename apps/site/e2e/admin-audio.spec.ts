import { expect, test } from "@playwright/test";
import { m4aBytes, mp3Bytes } from "@smog/translation/testing";
import { adminRpc, openAdmin, stubMuxMedia } from "./admin";
import {
  createGesture,
  deleteGesture,
  letters,
  type MadeGesture,
} from "./audio";
import { blockingViolations } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The spoken name in the admin editor (phase 10b task 6), in Belgian
 * Dutch, as the seeded admin, with the dev same-origin upload (no R2
 * tokens): a clip is uploaded for French, replaced, and removed; a file
 * with the wrong magic bytes, a file over 1 MiB and a clip over 10 s are
 * refused and leave nothing stored. A hidden gesture of the spec's own
 * carries it all, deleted again at the end.
 */

const NAME = `Zz audio ${letters(8)}`;
const CARD = "#audio";
const REMOVE = /Audio verwijderen/;

let made: MadeGesture | null = null;

interface Listed {
  items: { durationMs: number; locale: string; path: string }[];
}

async function stored(
  request: Parameters<typeof adminRpc>[0]
): Promise<Listed["items"]> {
  const list = await adminRpc<Listed>(request, "translation/listAudio", {
    gestureId: made?.id,
  });
  return list.items;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
  made = await createGesture(request, {
    name: NAME,
    published: false,
    textless: true,
  });
});

test.afterAll(async ({ request }) => {
  if (made) {
    await signInAsAdmin(request);
    await deleteGesture(request, made);
    made = null;
  }
});

test("uploads a clip for French, replaces it and removes it", async ({
  page,
}) => {
  await stubMuxMedia(page);
  await signInAsAdmin(page.request);
  await openAdmin(page, `/admin/gestures/${made?.id}`);
  const card = page.locator(CARD);
  await expect(
    card.getByRole("heading", { name: "Uitspraak (audio)" })
  ).toBeVisible();
  // Every enabled language, the default one included, starts without a clip.
  await expect(card.getByText("Nog geen audio")).toHaveCount(3);
  expect(await blockingViolations(page)).toEqual([]);

  await card.getByTestId("audio-file-fr").setInputFiles({
    buffer: Buffer.from(mp3Bytes(2)),
    mimeType: "audio/mpeg",
    name: "chien.mp3",
  });
  await expect(page.getByText("Audio opgeslagen")).toBeVisible();
  const french = card.locator('[data-language="fr"]');
  await expect(french.getByText("2.0 s")).toBeVisible();
  await expect(
    french.getByRole("button", { name: "Uitspraak beluisteren" })
  ).toBeVisible();
  const [first] = await stored(page.request);
  expect(first?.locale).toBe("fr");

  // Replaced: a new key, the old object gone.
  await card.getByTestId("audio-file-fr").setInputFiles({
    buffer: Buffer.from(m4aBytes(3)),
    mimeType: "audio/x-m4a",
    name: "chien.m4a",
  });
  await expect(french.getByText("3.0 s")).toBeVisible();
  const [second] = await stored(page.request);
  expect(second?.path).not.toBe(first?.path);
  expect((await page.request.get(first?.path ?? "")).status()).toBe(404);
  expect((await page.request.get(second?.path ?? "")).status()).toBe(200);

  await french.getByRole("button", { name: REMOVE }).click();
  await expect(page.getByText("Audio verwijderd")).toBeVisible();
  await expect(card.getByText("Nog geen audio")).toHaveCount(3);
  expect(await stored(page.request)).toEqual([]);
  expect((await page.request.get(second?.path ?? "")).status()).toBe(404);
});

test("refuses wrong magic bytes, a file over 1 MiB and a clip over ten seconds, and stores nothing", async ({
  page,
}) => {
  await stubMuxMedia(page);
  await signInAsAdmin(page.request);
  await openAdmin(page, `/admin/gestures/${made?.id}`);
  const input = page.locator(CARD).getByTestId("audio-file-en");

  // A PNG named and typed as an MP3: the server reads the bytes.
  await input.setInputFiles({
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]),
    mimeType: "audio/mpeg",
    name: "geen-audio.mp3",
  });
  await expect(
    page.getByText("Dit is geen geldig MP3- of M4A-bestand.")
  ).toBeVisible();

  // Over 1 MiB: the editor says so before uploading anything.
  await input.setInputFiles({
    buffer: Buffer.alloc(1_048_577),
    mimeType: "audio/mpeg",
    name: "te-groot.mp3",
  });
  await expect(page.getByText("Het bestand is groter dan 1 MB.")).toBeVisible();

  // Under 1 MiB, but 12 seconds: the server counts the frames.
  await input.setInputFiles({
    buffer: Buffer.from(mp3Bytes(12)),
    mimeType: "audio/mpeg",
    name: "te-lang.mp3",
  });
  await expect(
    page.getByText("Het fragment is langer dan 10 seconden.")
  ).toBeVisible();

  expect(await stored(page.request)).toEqual([]);
});
