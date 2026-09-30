import { expect, type Page, test } from "@playwright/test";

/**
 * The app's Turnstile bridge (`/turnstile-bridge`). Cloudflare's script is
 * replaced by a fake that solves at once, and `window.ReactNativeWebView`
 * by a recorder: the page must post the token to the bridge and nowhere
 * else.
 */

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js**";
const FAKE_TOKEN = "fake-turnstile-token";

interface Recorded {
  bridge: string[];
  rendered: { language?: string; sitekey?: string }[];
  window: unknown[];
}

declare global {
  interface Window {
    __recorded: Recorded;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

/** Serves a fake `api.js`; `outcome` is what the widget does on render. */
async function fakeTurnstile(
  page: Page,
  outcome: "token" | "error"
): Promise<void> {
  await page.route(SCRIPT, (route) =>
    route.fulfill({
      body: `
        window.turnstile = {
          render: function (element, options) {
            window.__recorded.rendered.push({
              language: options.language,
              sitekey: options.sitekey,
            });
            setTimeout(function () {
              ${
                outcome === "token"
                  ? `options.callback(${JSON.stringify(FAKE_TOKEN)});`
                  : `options["error-callback"]();`
              }
            }, 10);
            return "widget-1";
          },
        };
        (function () {
          var ready = new URL(document.currentScript.src).searchParams.get("onload");
          window[ready]();
        })();
      `,
      contentType: "text/javascript",
    })
  );
}

/** Records every message: to the RN bridge (when present) and to windows. */
async function recorder(page: Page, withBridge: boolean): Promise<void> {
  await page.addInitScript((installBridge: boolean) => {
    const recorded: Recorded = { bridge: [], rendered: [], window: [] };
    window.__recorded = recorded;
    window.addEventListener("message", (event) => {
      recorded.window.push(event.data);
    });
    if (installBridge) {
      window.ReactNativeWebView = {
        postMessage: (message: string) => {
          recorded.bridge.push(message);
        },
      };
    }
  }, withBridge);
}

/** The messages the page posted to the bridge, parsed. */
async function posted(page: Page): Promise<unknown[]> {
  const messages = await page.evaluate(() => window.__recorded.bridge);
  return messages.map((message) => JSON.parse(message) as unknown);
}

test.describe("turnstile bridge", () => {
  test("posts the solved token to the React Native WebView only", async ({
    page,
  }) => {
    await recorder(page, true);
    await fakeTurnstile(page, "token");
    const response = await page.goto("/turnstile-bridge?lang=en");
    expect(response?.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'"
    );

    await expect
      .poll(() => posted(page))
      .toEqual([
        { source: "smog-turnstile", token: FAKE_TOKEN, type: "token" },
      ]);
    const recorded = await page.evaluate(() => window.__recorded);
    expect(recorded.rendered).toEqual([
      { language: "en", sitekey: "1x00000000000000000000AA" },
    ]);
    // Nothing went to window.postMessage (parent, opener or self).
    expect(recorded.window).toEqual([]);
  });

  test("reports a failed challenge to the app", async ({ page }) => {
    await recorder(page, true);
    await fakeTurnstile(page, "error");
    await page.goto("/turnstile-bridge?lang=en");
    await expect
      .poll(() => posted(page))
      .toEqual([{ source: "smog-turnstile", type: "error" }]);
    await expect(page.getByRole("status")).toHaveText(
      "The security check didn't work. Please try again."
    );
  });

  test("in a normal browser it loads no widget and posts nothing", async ({
    page,
  }) => {
    let scriptRequested = false;
    await recorder(page, false);
    await page.route(SCRIPT, (route) => {
      scriptRequested = true;
      return route.abort();
    });
    await page.goto("/turnstile-bridge?lang=en");
    await expect(page.getByRole("status")).toHaveText(
      "This page only works in the SMOG & Co app."
    );
    const recorded = await page.evaluate(() => window.__recorded);
    expect(recorded).toEqual({ bridge: [], rendered: [], window: [] });
    expect(scriptRequested).toBe(false);
  });

  test("cannot be framed", async ({ page }) => {
    const response = await page.request.get("/turnstile-bridge");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });
});
