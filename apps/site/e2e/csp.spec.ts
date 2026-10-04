import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { ADMIN_PAGES, openAdmin, stubMuxMedia } from "./admin";
import {
  e2eSeed,
  signInWithApi,
  stubMux,
  stubMuxRenditions,
  waitForApp,
} from "./helpers";
import { signInAsAdmin } from "./maintenance";

/** The preview's MP4 (Remotion appends a media fragment). */
const MUX_MP4 = /^https:\/\/stream\.mux\.com\/[^/]+\/highest\.mp4(?:#.*)?$/;

/**
 * The CSP is enforced in dev (`src/worker/headers.ts`), so this suite sees
 * what production blocks. Each page must load with no violation: the
 * browser's `securitypolicyviolation` events and its "Content Security
 * Policy" console messages are both collected.
 *
 * This machine has no route to Mux or Turnstile, so their hosts are
 * answered by `page.route`. A request the CSP blocks never reaches a route
 * handler, so each handler also counts its hits: a hit proves the page was
 * allowed to make that request.
 *
 * Not covered here: `inferred.litix.io` (Mux Data), because the player runs
 * with `disableTracking` and never beacons; and `media-src`, because only
 * Chromium runs (hls.js fetches through `connect-src`; Safari would play
 * HLS natively through `media-src`).
 */

const CSP_MESSAGE = /Content Security Policy|Content-Security-Policy/i;
const NONCE_SOURCE = /'nonce-[A-Za-z0-9+/=]+'/;
const TURNSTILE_FRAME =
  "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/e2e/turnstile";
const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
/** Mux serves renditions and segments from other *.mux.com hosts. */
const RENDITION_URL = "https://manifest-e2e.cfcdn.mux.com/rendition.m3u8";
const SEGMENT_URL = "https://chunk-e2e.cfcdn.mux.com/segment0.ts";
/** A direct-upload URL as Mux hands them out (a `*.mux.com` host). */
const MUX_UPLOAD_URL =
  "https://direct-uploads.e2e.production.mux.com/upload/e2e-csp";
const MASTER_PLAYLIST = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=480x640
${RENDITION_URL}
`;
const MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:4.0,
${SEGMENT_URL}
#EXT-X-ENDLIST
`;

const MOLLIE_FAKE = `http://localhost:${process.env.E2E_MOLLIE_PORT ?? 4020}`;
const CHECKOUT_URL = new RegExp(`^${MOLLIE_FAKE}/checkout/`);
const BLOB_URL = /^blob:/;
const NAAM_IN_DE_VIDEO = /^Naam in de video/;
const LOGO_TOEVOEGEN = /^Logo toevoegen/;
const VOLLEDIGE_NAAM = /^Volledige naam/;
const E_MAIL = /^E-mail$/;
/** A 1x1 transparent PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

async function watchCsp(page: Page): Promise<string[]> {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (CSP_MESSAGE.test(message.text())) {
      messages.push(message.text());
    }
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations?.push(
        `${event.effectiveDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`
      );
    });
  });
  return messages;
}

async function violations(page: Page, console: string[]): Promise<string[]> {
  const events = await page.evaluate(() => window.__cspViolations ?? []);
  return [...events, ...console];
}

/** Counts the requests `page.route` answered per host. */
function hits(): Map<string, number> {
  return new Map<string, number>();
}

function count(map: Map<string, number>, url: string): void {
  const { host } = new URL(url);
  map.set(host, (map.get(host) ?? 0) + 1);
}

/**
 * Cloudflare's script, stubbed: it renders the challenge iframe from
 * challenges.cloudflare.com (frame-src) and hands back the test token.
 * `answered` counts both requests.
 */
async function stubTurnstile(
  page: Page,
  answered: Map<string, number>
): Promise<void> {
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js*",
    async (route) => {
      count(answered, route.request().url());
      await route.fulfill({
        body: `window.turnstile = {
          render(element, options) {
            const frame = document.createElement("iframe");
            frame.src = ${JSON.stringify(TURNSTILE_FRAME)};
            frame.title = "turnstile";
            element.append(frame);
            setTimeout(() => options.callback(${JSON.stringify(DUMMY_TOKEN)}), 0);
            return "e2e";
          },
          remove() {},
          reset() {},
        };`,
        contentType: "text/javascript",
      });
    }
  );
  await page.route(`${TURNSTILE_FRAME}*`, async (route) => {
    count(answered, route.request().url());
    await route.fulfill({
      body: "<!doctype html><title>turnstile</title>",
      contentType: "text/html",
    });
  });
}

test.describe("CSP (enforced in dev)", () => {
  test("the home page loads and hydrates with no violation", async ({
    page,
  }) => {
    const csp = await watchCsp(page);
    await stubMux(page);
    const response = await page.goto("/");
    const header = response?.headers()["content-security-policy"] ?? "";
    expect(header).toMatch(NONCE_SOURCE);
    expect(header).toContain("frame-ancestors 'none'");
    expect(
      response?.headers()["content-security-policy-report-only"]
    ).toBeUndefined();
    await waitForApp(page);
    await page.waitForLoadState("networkidle");
    // Client navigation after hydration works too.
    await page.getByRole("link", { name: "Gebaren" }).first().click();
    await waitForApp(page);
    await page.waitForLoadState("networkidle");
    expect(await violations(page, csp)).toEqual([]);
  });

  test("an injected inline script is blocked (the CSP is enforced)", async ({
    page,
  }) => {
    const csp = await watchCsp(page);
    await page.goto("/");
    await waitForApp(page);
    const ran = await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__injected = true";
      document.head.append(script);
      return (window as { __injected?: boolean }).__injected === true;
    });
    expect(ran).toBe(false);
    await expect
      .poll(async () => (await violations(page, csp)).length)
      .toBeGreaterThan(0);
  });

  test("a gesture page loads the Mux player and requests its media", async ({
    page,
  }) => {
    const csp = await watchCsp(page);
    const answered = hits();
    await page.route("https://image.mux.com/**", async (route) => {
      count(answered, route.request().url());
      await route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="4"/>',
        contentType: "image/svg+xml",
      });
    });
    const playlist = (body: string) => ({
      body,
      contentType: "application/vnd.apple.mpegurl",
      headers: { "access-control-allow-origin": "*" },
    });
    await page.route("https://stream.mux.com/**", async (route) => {
      count(answered, route.request().url());
      await route.fulfill(playlist(MASTER_PLAYLIST));
    });
    await page.route(RENDITION_URL, async (route) => {
      count(answered, route.request().url());
      await route.fulfill(playlist(MEDIA_PLAYLIST));
    });
    // Not a real segment: the request is the proof, not the playback.
    await page.route(SEGMENT_URL, async (route) => {
      count(answered, route.request().url());
      await route.fulfill({
        body: "",
        headers: { "access-control-allow-origin": "*" },
        status: 404,
      });
    });
    await page.goto("/gestures/hond");
    await waitForApp(page);
    await expect(page.locator("mux-player")).toBeAttached();
    await expect
      .poll(() => answered.get("stream.mux.com") ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0);
    // The rendition and segment hosts (connect-src https://*.mux.com).
    await expect
      .poll(() => answered.get("manifest-e2e.cfcdn.mux.com") ?? 0, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(() => answered.get("chunk-e2e.cfcdn.mux.com") ?? 0, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    expect(answered.get("image.mux.com") ?? 0).toBeGreaterThan(0);
    await page.waitForLoadState("networkidle");
    expect(await violations(page, csp)).toEqual([]);
  });

  test("the sign-in page renders the Turnstile widget", async ({ page }) => {
    const csp = await watchCsp(page);
    const answered = hits();
    await stubTurnstile(page, answered);
    await page.goto("/sign-in");
    await waitForApp(page);
    const captcha = page.getByRole("group", { name: "Beveiligingscontrole" });
    test.skip(
      (await captcha.count()) === 0,
      "Set TURNSTILE_SITE_KEY (and its secret) in apps/site/.dev.vars to render the widget"
    );
    await expect(captcha.locator("iframe")).toBeAttached();
    await expect
      .poll(() => answered.get("challenges.cloudflare.com") ?? 0)
      .toBe(2);
    await page.waitForLoadState("networkidle");
    expect(await violations(page, csp)).toEqual([]);
  });

  test("the account page (signed in) has no violation", async ({ page }) => {
    const csp = await watchCsp(page);
    await signInWithApi(page);
    await page.goto("/account");
    await waitForApp(page);
    await page.waitForLoadState("networkidle");
    expect(await violations(page, csp)).toEqual([]);
  });

  test.describe("the OpenAPI reference (/api/openapi)", () => {
    /*
     * The page loads Scalar from jsDelivr, pinned and with an SRI hash,
     * under its own CSP. This machine has no route to jsDelivr, so the
     * bundle is answered by `page.route`: with the real file when
     * SCALAR_STANDALONE_JS points at it (`npm pack
     * @scalar/api-reference@<version>`, `package/dist/browser/standalone.js`),
     * else with a stand-in the SRI check must refuse.
     */
    const JSDELIVR = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@*";

    async function openReference(
      page: Page,
      body: string
    ): Promise<{ csp: string; bundleHits: number; messages: string[] }> {
      const messages = await watchCsp(page);
      let bundleHits = 0;
      await page.route(`${JSDELIVR}/**`, async (route) => {
        bundleHits += 1;
        await route.fulfill({
          body,
          contentType: "text/javascript",
          headers: { "access-control-allow-origin": "*" },
        });
      });
      const response = await page.goto("/api/openapi");
      expect(response?.status()).toBe(200);
      const csp = response?.headers()["content-security-policy"] ?? "";
      return { bundleHits, csp, messages };
    }

    test("its CSP allows the pinned bundle, and SRI refuses anything else", async ({
      page,
    }) => {
      const logged: string[] = [];
      page.on("console", (message) => {
        logged.push(message.text());
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
      });
      const { csp, messages } = await openReference(
        page,
        "window.Scalar = { createApiReference() { document.title = 'tampered'; } };"
      );
      expect(csp).not.toContain("nonce-");
      await expect
        .poll(() => logged.some((text) => text.includes("integrity")))
        .toBe(true);
      // Our mount script ran (it was allowed) and found no Scalar.
      await expect
        .poll(() => errors.some((text) => text.includes("Scalar")))
        .toBe(true);
      await expect(page).not.toHaveTitle("tampered");
      expect(await violations(page, messages)).toEqual([]);
    });

    test("renders with the real bundle and no violation", async ({ page }) => {
      const bundle = process.env.SCALAR_STANDALONE_JS;
      test.skip(
        !bundle,
        "Set SCALAR_STANDALONE_JS to Scalar's dist/browser/standalone.js"
      );
      const { readFile } = await import("node:fs/promises");
      const { bundleHits, messages } = await openReference(
        page,
        await readFile(bundle ?? "", "utf8")
      );
      expect(bundleHits).toBe(1);
      // The spec was fetched and rendered: a procedure's path is listed.
      await expect(page.getByText("/system/health").first()).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForLoadState("networkidle");
      expect(await violations(page, messages)).toEqual([]);
    });
  });

  test("the admin pages, a Mux direct upload and the email preview have no violation", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const csp = await watchCsp(page);
    await stubMuxMedia(page);
    await signInAsAdmin(page.request);
    for (const [, path] of ADMIN_PAGES) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
      await openAdmin(page, path);
      await page.waitForLoadState("networkidle");
    }
    // The email preview's sandboxed srcdoc frame rendered.
    await expect(
      page.frameLocator("iframe").getByText("482913", { exact: true })
    ).toBeVisible();

    // A real direct-upload URL is on a `*.mux.com` host (the dev server's
    // Mux fake hands out its own origin): the browser's PUT must pass
    // `connect-src`, so the route counts it.
    const uploads = hits();
    await page.route("**/api/rpc/admin/mux/createUpload**", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: { json: { uploadId: "e2e-csp", url: MUX_UPLOAD_URL }, meta: [] },
      })
    );
    await page.route("**/api/rpc/admin/mux/uploadStatus**", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          json: {
            asset: {
              id: "e2e-csp-asset",
              playbackId: "e2ecsp",
              status: "ready",
            },
            upload: "asset_created",
          },
          meta: [],
        },
      })
    );
    await page.route(`${new URL(MUX_UPLOAD_URL).origin}/**`, (route) => {
      count(uploads, route.request().url());
      return route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        status: 200,
      });
    });
    await openAdmin(page, "/admin/gestures/new");
    await page.getByTestId("mux-file-input").setInputFiles({
      buffer: Buffer.from("not really a video"),
      mimeType: "video/mp4",
      name: "csp.mp4",
    });
    await expect(page.getByTestId("mux-upload-announcer")).toHaveText(
      "De video is klaar.",
      { timeout: 20_000 }
    );
    expect(uploads.get(new URL(MUX_UPLOAD_URL).host)).toBeGreaterThan(0);
    expect(await violations(page, csp)).toEqual([]);
  });

  test.describe("the sponsor pages", () => {
    // This spec's own gesture: no other sponsor test touches it.
    const SLUG = "paard";
    const reset = async ({ request }: { request: APIRequestContext }) => {
      await e2eSeed(request, [{ op: "resetSponsorships", slugs: [SLUG] }]);
    };
    test.beforeAll(reset);
    test.afterAll(reset);

    for (const path of [
      "/sponsor",
      `/sponsor/success?payment=${crypto.randomUUID()}`,
      "/sponsor/edit",
      "/sponsor/renew",
    ]) {
      test(`${path.split("?")[0]} loads with the enforced CSP and no violation`, async ({
        page,
      }) => {
        const csp = await watchCsp(page);
        await stubMux(page);
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        const header = response?.headers()["content-security-policy"] ?? "";
        expect(header).toMatch(NONCE_SOURCE);
        expect(header).toContain("https://challenges.cloudflare.com");
        await waitForApp(page);
        await page.waitForLoadState("networkidle");
        expect(await violations(page, csp)).toEqual([]);
      });
    }

    test("the wizard: Turnstile, the blob logo preview, the fallback upload and the redirect to the checkout", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const csp = await watchCsp(page);
      const answered = hits();
      await stubTurnstile(page, answered);
      await stubMux(page);
      await stubMuxRenditions(page);
      await page.goto(`/sponsor?gesture=${SLUG}`);
      await waitForApp(page);
      await page
        .getByRole("button", { name: "Alleen noodzakelijke" })
        .click({ timeout: 3000 })
        .catch(() => undefined);
      await expect(
        page.getByRole("button", { exact: true, name: "Paard" })
      ).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { exact: true, name: "Doorgaan" }).click();
      await page.getByLabel(NAAM_IN_DE_VIDEO).fill("CSP Proef");
      await page.getByRole("checkbox", { name: LOGO_TOEVOEGEN }).click();
      await page.locator("input#logo-upload").setInputFiles({
        buffer: PNG,
        mimeType: "image/png",
        name: "logo.png",
      });
      // The preview is an object URL: `img-src blob:`.
      const preview = page.getByAltText("Voorbeeld van het logo");
      await expect(preview).toBeVisible();
      expect(await preview.getAttribute("src")).toMatch(BLOB_URL);
      await expect
        .poll(() =>
          preview.evaluate((image: HTMLImageElement) => image.naturalWidth)
        )
        .toBe(1);
      await page.getByLabel(VOLLEDIGE_NAAM).fill("Csp Proef");
      await page.getByLabel(E_MAIL).fill("e2e-csp-sponsor@smog.test");
      await page
        .getByRole("button", { name: "Doorgaan naar voorbeeld" })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Bekijk je sponsoring" })
      ).toBeVisible();
      // Turnstile renders only with a site key (none in dev by default);
      // the sign-in test above covers the frame the same way.
      const captcha = page.getByRole("group", {
        name: "Beveiligingscontrole",
      });
      if ((await captcha.count()) > 0) {
        await expect(captcha.locator("iframe")).toBeAttached();
        await expect
          .poll(() => answered.get("challenges.cloudflare.com") ?? 0)
          .toBe(2);
      }
      // The Remotion Player preview (phase 7 ruling 8): its lazy chunk
      // ('self'), the overlay font ('self'), the MP4 read by mediabunny
      // (`connect-src` *.mux.com) and played (`media-src`), the blob logo
      // (`img-src blob:`) and Remotion's injected styles.
      const frame = page.getByRole("img", { name: "Voorbeeld voor Paard" });
      await expect(
        page.getByRole("button", { name: "Toon het einde" })
      ).toBeEnabled({ timeout: 30_000 });
      const video = frame.locator("video");
      await expect(video).toHaveAttribute("src", MUX_MP4);
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.readyState)
        )
        .toBeGreaterThanOrEqual(2);
      await expect(frame.getByText("CSP Proef")).toBeVisible();
      await expect
        .poll(() =>
          frame
            .locator('img[src^="blob:"]')
            .evaluate((image: HTMLImageElement) => image.naturalWidth)
        )
        .toBe(1);
      await expect
        .poll(() =>
          page.evaluate(() => document.fonts.check('600 16px "SMOG Overlay"'))
        )
        .toBe(true);
      await page.getByRole("button", { name: "Afspelen" }).click();
      await expect(
        page.getByRole("button", { name: "Pauzeren" })
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await violations(page, csp)).toEqual([]);
      // The logo goes up through the signed same-origin fallback (no R2
      // tokens in dev), then the browser leaves for the checkout.
      const upload = page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "PUT" &&
          candidate.url().includes("/api/logos/upload/"),
        { timeout: 15_000 }
      );
      await page
        .getByRole("button", { name: "Doorgaan naar betaling" })
        .click();
      expect((await upload).status()).toBeLessThan(300);
      await page.waitForURL(CHECKOUT_URL);
      // The page that left reported any violation to the console too.
      expect(csp).toEqual([]);
    });
  });

  for (const path of ["/dev/ui", "/dev/mail"]) {
    test(`${path} works under the CSP`, async ({ page }) => {
      const csp = await watchCsp(page);
      await stubMux(page);
      if (path === "/dev/mail") {
        // At least one mail, so the sandboxed srcdoc frame renders.
        await signInWithApi(page);
      }
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(response?.headers()["content-security-policy"]).toBeTruthy();
      await page.waitForLoadState("networkidle");
      expect(await violations(page, csp)).toEqual([]);
    });
  }
});
