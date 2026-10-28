import { expect, type Page, test } from "@playwright/test";
import {
  createGesture,
  deleteGesture,
  letters,
  type MadeGesture,
  type StoredClip,
  uploadClip,
} from "../../support/e2e/audio";
import { ORIGIN, stubMux, waitForApp } from "../../support/e2e/helpers";
import { signInAsAdmin } from "../../support/e2e/maintenance";
import { mp3Bytes } from "../../support/translation/fixtures";

/*
 * The spoken name and the name over the video on the public gesture page
 * (phase 10b task 6). A textless gesture of the spec's own has a French
 * clip and no Dutch one: the audio button is there in French only (no
 * fallback audio), loads the clip from the site's own `/api/audio` route
 * only when pressed (cached for a year, no CSP violation), and the name
 * shows over the video until the viewer hides it. A gesture that still has
 * the name in the picture gets neither the overlay nor the toggle.
 */

const WORD = `zz${letters(8)}`;
const TEXTLESS = `Zz ${WORD} a`;
const BURNED_IN = `Zz ${WORD} b`;
const PART_RANGE = /^bytes 0-9\//;
const OVERLAY = '[data-slot="video-name-overlay"]';
const PLAY = "Écouter la prononciation";
const HIDE_TOGGLE = "Naam in de video tonen";

let textless: MadeGesture | null = null;
let burnedIn: MadeGesture | null = null;
let clip: StoredClip | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
  textless = await createGesture(request, {
    name: TEXTLESS,
    published: true,
    textless: true,
  });
  burnedIn = await createGesture(request, {
    name: BURNED_IN,
    published: true,
    textless: false,
  });
  clip = await uploadClip(request, {
    bytes: mp3Bytes(1.5),
    contentType: "audio/mpeg",
    gestureId: textless.id,
    locale: "fr",
  });
});

test.afterAll(async ({ request }) => {
  await signInAsAdmin(request);
  for (const made of [textless, burnedIn]) {
    if (made) {
      // biome-ignore lint/performance/noAwaitInLoops: two deletes, in order.
      await deleteGesture(request, made);
    }
  }
  textless = null;
  burnedIn = null;
  clip = null;
});

async function open(page: Page, slug: string, locale: string): Promise<void> {
  await stubMux(page);
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  await page
    .context()
    .addCookies([{ name: "locale", url: ORIGIN, value: locale }]);
  await page.goto(`/gestures/${slug}`);
  await waitForApp(page);
}

test("the audio button is there only in the language that has a clip, and loads it only when pressed", async ({
  page,
}) => {
  const audioRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/audio/")) {
      audioRequests.push(request.url());
    }
  });
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) {
      violations.push(message.text());
    }
  });

  // Dutch has no clip: no button, and no fallback to the French one.
  await open(page, textless?.slug ?? "", "nl");
  await expect(
    page.getByRole("heading", { level: 1, name: TEXTLESS })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Uitspraak beluisteren" })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: PLAY })).toHaveCount(0);

  // French has one. Nothing is requested until it is pressed.
  await open(page, textless?.slug ?? "", "fr");
  const button = page.getByRole("button", { name: PLAY });
  await expect(button).toBeVisible();
  expect(audioRequests).toEqual([]);

  const [response] = await Promise.all([
    page.waitForResponse((candidate) =>
      candidate.url().includes("/api/audio/")
    ),
    button.click(),
  ]);
  expect([200, 206]).toContain(response.status());
  expect(new URL(response.url()).pathname).toBe(clip?.path);
  expect(response.headers()["cache-control"]).toBe(
    "public, max-age=31536000, immutable"
  );
  expect(response.headers()["content-type"]).toBe("audio/mpeg");
  expect(violations).toEqual([]);
});

test("the clip is served with Range support", async ({ request }) => {
  const whole = await request.get(clip?.path ?? "");
  expect(whole.status()).toBe(200);
  expect(whole.headers()["accept-ranges"]).toBe("bytes");
  const part = await request.get(clip?.path ?? "", {
    headers: { range: "bytes=0-9" },
  });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toMatch(PART_RANGE);
  expect((await part.body()).length).toBe(10);
});

test("the name shows over a textless video until the viewer hides it, and that choice is kept", async ({
  page,
}) => {
  await open(page, textless?.slug ?? "", "nl");
  const overlay = page.locator(OVERLAY);
  await expect(overlay).toHaveText(TEXTLESS);
  // Decoration: the video's own label is the accessible name, read once.
  await expect(overlay).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("region", { name: TEXTLESS })).toBeVisible();

  const toggle = page.getByRole("switch", { name: HIDE_TOGGLE });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(overlay).toHaveCount(0);

  await page.reload();
  await waitForApp(page);
  await expect(
    page.getByRole("switch", { name: HIDE_TOGGLE })
  ).not.toBeChecked();
  await expect(page.locator(OVERLAY)).toHaveCount(0);

  await page.getByRole("switch", { name: HIDE_TOGGLE }).click();
  await expect(page.locator(OVERLAY)).toHaveText(TEXTLESS);
});

test("a video that still has the name in the picture gets no overlay and no toggle", async ({
  page,
}) => {
  await open(page, burnedIn?.slug ?? "", "nl");
  await expect(
    page.getByRole("heading", { level: 1, name: BURNED_IN })
  ).toBeVisible();
  await expect(page.locator(OVERLAY)).toHaveCount(0);
  await expect(page.getByRole("switch", { name: HIDE_TOGGLE })).toHaveCount(0);
});
