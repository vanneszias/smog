import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type Browser,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { blockingViolations, ORIGIN, stubMux, waitForApp } from "./helpers";

/*
 * The admin VideoField against the Mux fake (playwright.config.ts starts
 * it and points the dev server at it): the file goes from the browser
 * straight to the fake's upload URL (never through the Worker), the fake
 * readies the asset and signs the webhooks, the field shows the video.
 * Then the picker and the pasted playback id, and the "not configured"
 * fallback. Belgian Dutch (the config's locale).
 */

const ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
const PREVIEW = "/admin/dev/video-field";
const MUX_FAKE_URL = `http://localhost:${process.env.E2E_MUX_PORT ?? 4010}`;
const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const VIDEO = {
  buffer: Buffer.from("not really a video, the fake does not care"),
  mimeType: "video/mp4",
  name: "zwaaien.mp4",
};

async function signInAsAdmin(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: ADMIN,
    headers: { origin: ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

/** Mux stills and HLS are not reachable offline: stills are stubbed, streams refused. */
async function stubMuxMedia(page: Page): Promise<void> {
  await stubMux(page);
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  await page.route("https://*.litix.io/**", (route) => route.abort());
}

async function seedFakeAssets(count: number): Promise<void> {
  const response = await fetch(`${MUX_FAKE_URL}/__fake/assets`, {
    body: JSON.stringify({ count }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(response.ok).toBe(true);
}

async function openPreview(page: Page): Promise<void> {
  await page.goto(PREVIEW);
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
    await openPreview(page);
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
    const value = page.getByTestId("video-field-value");
    await expect(value).toContainText(SAMPLE_PLAYBACK_ID);
    await expect(value).toContainText("muxAssetId");
    expect(await blockingViolations(page)).toEqual([]);

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
    await expect(value).toHaveText('{"playbackId":"plak_hier-123"}');
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
    await openPreview(page);
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

/*
 * Review screenshots of the VideoField states (light/dark × 390/1280,
 * reduced motion, nl-BE), only when ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/tmp/shots bunx playwright test admin-video`.
 */
test.describe("admin video field screenshots", () => {
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
    await seedFakeAssets(6);
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
          await page.screenshot({
            fullPage: true,
            path: join(dir ?? "", `video-${name}-${theme}-${width}.png`),
          });
        };
        await openPreview(page);
        await expect(page.getByText("Sleep een video hierheen")).toBeVisible();
        await shot("idle");
        await page.getByTestId("mux-file-input").setInputFiles(VIDEO);
        await expect(page.getByTestId("mux-upload-progress")).toHaveText(
          "Mux verwerkt de video…"
        );
        await shot("processing");
        await expect(page.getByTestId("mux-upload-announcer")).toHaveText(
          "De video is klaar.",
          {
            timeout: 20_000,
          }
        );
        await shot("ready");
        await page.getByRole("tab", { name: "Bestaande kiezen" }).click();
        await expect(page.getByTestId("mux-asset").first()).toBeVisible();
        // Load every (stubbed) still now, also the lazy ones below the fold.
        await page.evaluate(() => {
          for (const image of document.querySelectorAll("img")) {
            image.loading = "eager";
          }
        });
        await page.waitForTimeout(1000);
        await shot("picker");
        await page.getByRole("tab", { name: "Playback-id" }).click();
        await page
          .getByRole("textbox", { name: "Playback-id" })
          .fill("geen geldige id!");
        await page
          .getByRole("button", { name: "Deze video gebruiken" })
          .click();
        await shot("playback-invalid");
        await page.route("**/api/rpc/admin/mux/status**", (route) =>
          route.fulfill({
            contentType: "application/json",
            json: { json: { configured: false }, meta: [] },
          })
        );
        await openPreview(page);
        await expect(
          page.getByText("Video-uploads zijn niet ingesteld")
        ).toBeVisible();
        await shot("not-configured");
        await context.close();
      }
    }
    await browser.close();
  });
});
