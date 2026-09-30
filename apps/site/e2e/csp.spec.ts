import { expect, type Page, test } from "@playwright/test";
import { signInWithApi, stubMux, waitForApp } from "./helpers";

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
    // Cloudflare's script, stubbed: it renders the challenge iframe from
    // challenges.cloudflare.com (frame-src) and hands back the test token.
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
