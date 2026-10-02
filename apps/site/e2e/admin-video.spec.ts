import { expect, type Page, test } from "@playwright/test";
import { stubMuxMedia } from "./admin";
import { blockingViolations, ORIGIN, waitForApp } from "./helpers";

/*
 * The gesture editor's VideoField against the Mux fake (playwright.config.ts starts
 * it and points the dev server at it): the file goes from the browser
 * straight to the fake's upload URL (never through the Worker), the fake
 * readies the asset and signs the webhooks, the field shows the video.
 * Then the picker and the pasted playback id, and the "not configured"
 * fallback. Belgian Dutch (the config's locale).
 */

const ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
/** The editor that mounts VideoField (the old dev preview is gone). */
const EDITOR = "/admin/gestures/new";
const GESTURE_EDITOR_URL = /\/admin\/gestures\/(?!new$)[A-Za-z0-9_-]+$/;
const MUX_FAKE_URL = `http://localhost:${process.env.E2E_MUX_PORT ?? 4010}`;
const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const VIDEO = {
  buffer: Buffer.from("not really a video, the fake does not care"),
  mimeType: "video/mp4",
  name: "zwaaien.mp4",
};

/** One oRPC call over HTTP, as the admin client makes it. */
async function rpc<T>(page: Page, path: string, input: unknown): Promise<T> {
  const response = await page.request.post(`/api/rpc/${path}`, {
    data: { json: input },
    headers: { origin: ORIGIN },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { json: T }).json;
}

async function signInAsAdmin(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: ADMIN,
    headers: { origin: ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

async function seedFakeAssets(count: number): Promise<void> {
  const response = await fetch(`${MUX_FAKE_URL}/__fake/assets`, {
    body: JSON.stringify({ count }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(response.ok).toBe(true);
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(EDITOR);
  await waitForApp(page);
  // The consent banner shows after hydration; answer it so it covers nothing.
  await page
    .getByRole("button", { name: "Alleen noodzakelijke" })
    .click({ timeout: 5000 })
    .catch(() => undefined);
}

test.describe("admin video field", () => {
  test("uploads straight to Mux, then picks and pastes", async ({ page }) => {
    await stubMuxMedia(page);
    await signInAsAdmin(page);
    const puts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT") {
        puts.push(new URL(request.url()).origin);
      }
    });
    const csp: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) {
        csp.push(message.text());
      }
    });
    await openEditor(page);
    await expect(page.getByText("Sleep een video hierheen")).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);

    await page.getByTestId("mux-file-input").setInputFiles(VIDEO);
    await expect(page.getByTestId("mux-upload-progress")).toHaveText(
      "Mux verwerkt de video…"
    );
    await expect(page.getByTestId("mux-upload-announcer")).toHaveText(
      "De video is klaar.",
      {
        timeout: 20_000,
      }
    );
    // The PUT went to the (fake) Mux upload URL, not the site.
    expect(puts).toEqual([MUX_FAKE_URL]);
    expect(csp).toEqual([]);
    await expect(
      page.getByText(`Playback-id: ${SAMPLE_PLAYBACK_ID}`)
    ).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);

    // Saved as a hidden gesture, it keeps the uploaded asset's id.
    const name = `Zzupload ${Date.now()}`;
    await page.getByRole("textbox", { name: "Naam" }).fill(name);
    await page.getByRole("button", { name: "Begroeten" }).click();
    await page.getByRole("switch", { name: "Gepubliceerd" }).click();
    await page.getByRole("button", { name: "Gebaar aanmaken" }).click();
    await expect(page).toHaveURL(GESTURE_EDITOR_URL);
    const id = new URL(page.url()).pathname.split("/").pop() ?? "";
    try {
      const saved = await rpc<{
        muxAssetId: string | null;
        playbackId: string;
      }>(page, "admin/gestures/get", { id });
      expect(saved.playbackId).toBe(SAMPLE_PLAYBACK_ID);
      expect(saved.muxAssetId).not.toBeNull();
    } finally {
      // Also when a check failed: no hidden `Zzupload …` row is left in
      // the shared category for later runs and screenshots.
      await rpc(page, "admin/gestures/delete", { confirmName: name, id });
    }
    await openEditor(page);
    await page.getByTestId("mux-file-input").setInputFiles(VIDEO);
    await expect(page.getByTestId("mux-upload-announcer")).toHaveText(
      "De video is klaar.",
      { timeout: 20_000 }
    );

    await page.getByRole("button", { name: "Andere video uploaden" }).click();
    await expect(page.getByText("Sleep een video hierheen")).toBeVisible();

    await seedFakeAssets(2);
    await page.getByRole("tab", { name: "Bestaande kiezen" }).click();
    await expect(page.getByTestId("mux-asset").first()).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
    await page.getByRole("button", { name: "Kiezen" }).first().click();
    await expect(page.getByRole("button", { name: "Gekozen" })).toBeVisible();

    await page.getByRole("tab", { name: "Playback-id" }).click();
    const input = page.getByRole("textbox", { name: "Playback-id" });
    await input.fill("geen geldige id!");
    await page.getByRole("button", { name: "Deze video gebruiken" }).click();
    await expect(
      page.getByText("Een playback-id bestaat uit letters, cijfers, _ en -.")
    ).toBeVisible();
    await input.fill("plak_hier-123");
    await page.getByRole("button", { name: "Deze video gebruiken" }).click();
    await expect(page.getByText("Playback-id: plak_hier-123")).toBeVisible();
  });

  test("without Mux it offers the playback id only", async ({ page }) => {
    await stubMuxMedia(page);
    await signInAsAdmin(page);
    // As staging before its Mux secrets: `admin.mux.status` says so.
    await page.route("**/api/rpc/admin/mux/status**", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: { json: { configured: false }, meta: [] },
      })
    );
    await openEditor(page);
    await expect(
      page.getByText("Video-uploads zijn niet ingesteld")
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Uploaden" })).toBeDisabled();
    await expect(
      page.getByRole("textbox", { name: "Playback-id" })
    ).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });
});
