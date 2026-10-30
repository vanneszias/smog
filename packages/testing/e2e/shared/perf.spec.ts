import { expect, type Page, test } from "@playwright/test";
import { stubMux, waitForApp } from "../../support/e2e/helpers";

/*
 * Phase 9 task 6: what can be checked on unbundled `vite dev` code (the
 * bundle size, request count and timings belong to the deploy guard's
 * budgets, not to a dev server of hundreds of unminified modules): layout
 * shift, image boxes, lazy images and the video's poster, and the cache
 * headers the Worker really sends.
 */

const CLS_LIMIT = 0.1;
const MUX_IMAGE = /image\.mux\.com/;
const PAGES = ["/", "/gestures", "/gestures/hond", "/sponsor"] as const;

/** Sums the page's layout shifts (those without recent input), from the start. */
async function observeLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      shifts: [] as { value: number; nodes: string[] }[],
      value: 0,
    };
    Object.assign(window, { __cls: state });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
          sources?: { node?: Element }[];
        };
        if (!shift.hadRecentInput) {
          state.value += shift.value;
          state.shifts.push({
            nodes: (shift.sources ?? []).map(({ node }) =>
              node ? `${node.tagName}#${node.id}.${node.className}` : "unknown"
            ),
            value: shift.value,
          });
        }
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });
}

/** Two frames, so the shifts of the last paint are reported. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

async function layoutShift(page: Page): Promise<number> {
  return await page.evaluate(
    () => (window as unknown as { __cls: { value: number } }).__cls.value
  );
}

test.describe("layout shift", () => {
  for (const path of PAGES) {
    test(`${path} shifts no more than ${CLS_LIMIT}`, async ({ page }) => {
      await stubMux(page);
      await page.route("https://stream.mux.com/**", (route) => route.abort());
      await observeLayoutShifts(page);
      await page.goto(path);
      await waitForApp(page);
      // The data has arrived (no loading skeleton left; a late result list is
      // a real shift, and is
      // measured before the scroll below, which is no input to blame it on).
      await expect(page.locator(".animate-pulse")).toHaveCount(0);
      // Root hydration precedes guest-store hydration. Scrolling while the
      // first-visit banner is still mounting makes the test itself grow the
      // footer's padding under it. Keep observing from navigation, but wait
      // for the actual first-visit UI and fonts before the scripted scroll.
      await expect(
        page.getByRole("region", { name: "Help SMOG verbeteren" })
      ).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await settle(page);
      // Scroll to the end: the lazy images and the footer come into view.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settle(page);
      const diagnostics = await page.evaluate(
        () => (window as unknown as { __cls: unknown }).__cls
      );
      expect(
        await layoutShift(page),
        JSON.stringify(diagnostics)
      ).toBeLessThanOrEqual(CLS_LIMIT);
    });
  }
});

test.describe("images and the video", () => {
  test("every image has a box before it loads, and the ones below the fold are lazy", async ({
    page,
  }) => {
    await page.route("https://image.mux.com/**", (route) => route.abort());
    for (const path of ["/gestures", "/gestures/hond"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time on one tab.
      await page.goto(path);
      await waitForApp(page);
      const images = await page.locator("img").evaluateAll((nodes) =>
        nodes.map((node) => {
          const img = node as HTMLImageElement;
          const box = img.getBoundingClientRect();
          return {
            hasBox:
              (img.getAttribute("width") !== null &&
                img.getAttribute("height") !== null) ||
              getComputedStyle(img).aspectRatio !== "auto" ||
              getComputedStyle(img.parentElement ?? img).aspectRatio !== "auto",
            lazy: img.getAttribute("loading") === "lazy",
            src: img.currentSrc || img.src,
            top: box.top + window.scrollY,
            viewport: window.innerHeight,
          };
        })
      );
      expect(images.length, path).toBeGreaterThan(0);
      for (const image of images) {
        expect(
          image.hasBox,
          `${path} ${image.src} has no size or aspect box`
        ).toBe(true);
        if (image.top > image.viewport) {
          expect(image.lazy, `${path} ${image.src} is below the fold`).toBe(
            true
          );
        }
      }
    }
  });

  test("a gesture's video shows its poster and never autoplays with sound", async ({
    page,
  }) => {
    await stubMux(page);
    await page.route("https://stream.mux.com/**", (route) => route.abort());
    await page.goto("/gestures/hond");
    await waitForApp(page);
    const player = page.locator("mux-player");
    await expect(player).toBeAttached();
    // The player carries the poster the first frame shows.
    await expect(player).toHaveAttribute("poster", MUX_IMAGE);
    // A player never starts with sound: autoplay is off or `muted`.
    const state = await player.evaluate((node) => ({
      autoplay: node.getAttribute("autoplay"),
      muted: node.hasAttribute("muted"),
      preload: node.getAttribute("preload"),
    }));
    if (state.autoplay !== null) {
      expect(state.autoplay).toBe("muted");
      expect(state.muted).toBe(true);
    }
    // It never preloads the whole video up front.
    expect(state.preload).not.toBe("auto");
    // No bare <video> or <audio> element autoplays either.
    expect(
      await page
        .locator("video[autoplay]:not([muted]), audio[autoplay]")
        .count()
    ).toBe(0);
  });
});

test.describe("cache headers (P-18)", () => {
  const CASES = [
    ["/", "private, no-cache"],
    ["/gestures/hond", "private, no-cache"],
    ["/api/health", "no-store"],
    ["/api/auth/get-session", "no-store"],
    ["/robots.txt", "public, max-age=3600"],
    ["/sitemap.xml", "public, max-age=3600"],
  ] as const;
  // The static files (hashed assets, /brand, icons, og.png) are served by
  // Cloudflare's assets layer from public/_headers, which `vite dev` does not
  // apply: test/cache-policy.test.ts holds `_headers` to the same table.

  for (const [path, expected] of CASES) {
    test(`${path} is ${expected}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe(expected);
    });
  }
});
