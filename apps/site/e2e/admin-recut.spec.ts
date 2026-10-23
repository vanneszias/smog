import { expect, test } from "@playwright/test";
import { openAdmin, stubMuxMedia } from "./admin";
import {
  createGesture,
  deleteGesture,
  letters,
  type MadeGesture,
} from "./audio";
import { stubMux, waitForApp } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The "needs re-cut" flow (phase 10b task 6), in Belgian Dutch, as the
 * seeded admin. A gesture of the spec's own, published with a video that
 * still has the name in the picture, is on the re-cut list and shows no
 * name over its video; the editor's "video without text uploaded" takes it
 * off the list and the public page then overlays the name. A gesture
 * created with a textless video was never on the list.
 */

const WORD = `zz${letters(8)}`;
const BURNED_IN = `Zz ${WORD} a`;
const TEXTLESS = `Zz ${WORD} b`;
const OVERLAY = '[data-slot="video-name-overlay"]';

let burnedIn: MadeGesture | null = null;
let textless: MadeGesture | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
  burnedIn = await createGesture(request, {
    name: BURNED_IN,
    published: true,
    textless: false,
  });
  textless = await createGesture(request, {
    name: TEXTLESS,
    published: true,
    textless: true,
  });
});

test.afterAll(async ({ request }) => {
  await signInAsAdmin(request);
  for (const made of [burnedIn, textless]) {
    if (made) {
      // biome-ignore lint/performance/noAwaitInLoops: two deletes, in order.
      await deleteGesture(request, made);
    }
  }
  burnedIn = null;
  textless = null;
});

test("the re-cut list, the badge, the editor's action, and the name over the public video afterwards", async ({
  page,
}) => {
  await stubMuxMedia(page);
  await signInAsAdmin(page.request);

  // The list filter: only the gesture with the name in the picture.
  await openAdmin(page, `/admin/gestures?recut=true&q=${WORD}`);
  await expect(
    page.getByRole("link", { name: BURNED_IN }).first()
  ).toBeVisible();
  await expect(page.getByRole("link", { name: TEXTLESS })).toHaveCount(0);
  await expect(page.getByText("Naam in video").first()).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Opnieuw knippen nodig" })
  ).toBeChecked();

  // Before: the public page keeps the picture's own name.
  const publicPage = await page.context().newPage();
  await stubMux(publicPage);
  await publicPage.route("https://stream.mux.com/**", (route) => route.abort());
  await publicPage.goto(`/gestures/${burnedIn?.slug}`);
  await waitForApp(publicPage);
  await expect(
    publicPage.getByRole("heading", { level: 1, name: BURNED_IN })
  ).toBeVisible();
  await expect(publicPage.locator(OVERLAY)).toHaveCount(0);

  // The editor says so, and one click clears it (audited).
  await openAdmin(page, `/admin/gestures/${burnedIn?.id}`);
  const card = page.locator("#recut");
  await expect(card.getByText("De naam zit nog in de video")).toBeVisible();
  await card
    .getByRole("button", { name: "Video zonder tekst geüpload" })
    .click();
  await expect(
    page.getByText("Gemarkeerd als video zonder tekst")
  ).toBeVisible();
  await expect(
    card.getByText("De video heeft geen tekst in beeld")
  ).toBeVisible();

  // The list no longer has it; the public page overlays the name.
  await openAdmin(page, `/admin/gestures?recut=true&q=${WORD}`);
  await expect(page.getByRole("link", { name: BURNED_IN })).toHaveCount(0);
  await publicPage.reload();
  await waitForApp(publicPage);
  await expect(publicPage.locator(OVERLAY)).toHaveText(BURNED_IN);
  await publicPage.close();
});
