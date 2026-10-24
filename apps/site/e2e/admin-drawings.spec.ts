import { expect, test } from "@playwright/test";
import { jpegBytes, pngBytes, webpBytes } from "@smog/lessons/testing";
import { adminRpc, openAdmin, stubMuxMedia } from "./admin";
import {
  createGesture,
  deleteGesture,
  letters,
  type MadeGesture,
} from "./audio";
import { blockingViolations, ORIGIN } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The drawing card of the admin editor (phase 10c task 3), in Belgian
 * Dutch, as the seeded admin, with the dev same-origin upload (no R2
 * tokens): step 1 with a credit, step 2 after it, a replace, a delete, the
 * private route (an image to the signed-in admin, 401 to a guest, a
 * private 5-minute cache), and the refusals: wrong magic bytes, over 1 MiB
 * and over 2000 px store nothing. A hidden gesture of the spec's own
 * carries it all, deleted again at the end.
 */

const NAME = `Zz tekening ${letters(8)}`;
const CARD = "#drawings";
const REMOVE = /Tekening verwijderen/;

let made: MadeGesture | null = null;

interface Listed {
  items: { credit: string; path: string; step: number; width: number }[];
}

async function stored(
  request: Parameters<typeof adminRpc>[0]
): Promise<Listed["items"]> {
  const list = await adminRpc<Listed>(request, "teacher/listDrawings", {
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

test("uploads step 1 with a credit and step 2 after it, replaces step 1 and removes step 2", async ({
  page,
  playwright,
}) => {
  await stubMuxMedia(page);
  await signInAsAdmin(page.request);
  await openAdmin(page, `/admin/gestures/${made?.id}`);
  const card = page.locator(CARD);
  await expect(card.getByRole("heading", { name: "Tekeningen" })).toBeVisible();
  const first = card.locator('[data-step="1"]');
  const second = card.locator('[data-step="2"]');
  // Step 2 waits for step 1.
  await expect(second.getByText("Voeg eerst stap 1 toe.")).toBeVisible();
  await expect(first.getByText("Nog geen tekening")).toBeVisible();

  await first.getByLabel("Bronvermelding").fill("© Studio Test");
  await card.getByTestId("drawing-file-1").setInputFiles({
    buffer: Buffer.from(pngBytes(160, 100)),
    mimeType: "image/png",
    name: "hond.png",
  });
  await expect(page.getByText("Tekening opgeslagen")).toBeVisible();
  await expect(
    first.getByRole("img", { name: `Tekening van ${NAME}, stap 1` })
  ).toBeVisible();
  await expect(first.getByText("Bron: © Studio Test")).toBeVisible();
  await expect(first.getByText("160 × 100 px")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  const [one] = await stored(page.request);
  expect(one).toMatchObject({ credit: "© Studio Test", step: 1, width: 160 });
  // The private route: an image with a private 5-minute cache for the admin, 401 for a guest.
  const served = await page.request.get(one?.path ?? "");
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["cache-control"]).toBe("private, max-age=300");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  const guest = await playwright.request.newContext({ baseURL: ORIGIN });
  try {
    expect((await guest.get(one?.path ?? "")).status()).toBe(401);
  } finally {
    await guest.dispose();
  }

  // Step 2 is open now.
  await expect(second.getByText("Voeg eerst stap 1 toe.")).toHaveCount(0);
  await card.getByTestId("drawing-file-2").setInputFiles({
    buffer: Buffer.from(jpegBytes(80, 80)),
    mimeType: "image/jpeg",
    name: "hond-2.jpg",
  });
  await expect(
    second.getByRole("img", { name: `Tekening van ${NAME}, stap 2` })
  ).toBeVisible();
  expect(await stored(page.request)).toHaveLength(2);

  // Replace step 1: a new stamp, one row, the new bytes.
  await first.getByLabel("Bronvermelding").fill("© Nieuw");
  await card.getByTestId("drawing-file-1").setInputFiles({
    buffer: Buffer.from(webpBytes(60, 40, "lossless")),
    mimeType: "image/webp",
    name: "hond.webp",
  });
  await expect(first.getByText("Bron: © Nieuw")).toBeVisible();
  const replaced = (await stored(page.request)).find((row) => row.step === 1);
  expect(replaced?.path).not.toBe(one?.path);
  expect(replaced?.credit).toBe("© Nieuw");
  const replacedImage = await page.request.get(replaced?.path ?? "");
  expect(replacedImage.headers()["content-type"]).toBe("image/webp");

  // Remove step 2 after the confirmation.
  await second.getByRole("button", { name: REMOVE }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Verwijderen" })
    .click();
  await expect(page.getByText("Tekening verwijderd")).toBeVisible();
  expect((await stored(page.request)).map((row) => row.step)).toEqual([1]);
  expect(
    (await page.request.get(`/api/teacher/drawings/${made?.id}/2`)).status()
  ).toBe(404);
});

test("refuses wrong magic bytes, a file over 1 MiB and a side over 2000 px, and stores nothing new", async ({
  page,
}) => {
  await stubMuxMedia(page);
  await signInAsAdmin(page.request);
  await openAdmin(page, `/admin/gestures/${made?.id}`);
  const before = await stored(page.request);
  const input = page.locator(CARD).getByTestId("drawing-file-1");

  // HTML named and typed as a PNG: the server reads the bytes.
  await input.setInputFiles({
    buffer: Buffer.from("<script>alert(1)</script>"),
    mimeType: "image/png",
    name: "geen-tekening.png",
  });
  await expect(
    page.getByText("Dit is geen geldige PNG-, JPEG- of WebP-afbeelding.")
  ).toBeVisible();

  // Over 1 MiB: the editor says so before uploading anything.
  await input.setInputFiles({
    buffer: Buffer.alloc(1_048_577),
    mimeType: "image/png",
    name: "te-groot.png",
  });
  await expect(page.getByText("Het bestand is groter dan 1 MB.")).toBeVisible();

  // Under 1 MiB, but 2500 px wide: the server reads the header.
  await input.setInputFiles({
    buffer: Buffer.from(pngBytes(2500, 10)),
    mimeType: "image/png",
    name: "te-breed.png",
  });
  await expect(
    page.getByText("De afbeelding is groter dan 2000 pixels per zijde.")
  ).toBeVisible();

  expect(await stored(page.request)).toEqual(before);
});
