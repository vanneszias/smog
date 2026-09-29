import type { Page } from "@playwright/test";

/**
 * The gallery's gesture cards load Mux thumbnails. Tests answer them with a
 * local 3:4 still, so screenshots are stable and the suite runs offline.
 */
const STILL = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><rect width="480" height="640" fill="#9aa8a0"/><circle cx="240" cy="250" r="90" fill="#c9d2cc"/><rect x="120" y="380" width="240" height="200" rx="60" fill="#c9d2cc"/></svg>`;

export async function stubMux(page: Page): Promise<void> {
  await page.route("https://image.mux.com/**", (route) =>
    route.fulfill({ body: STILL, contentType: "image/svg+xml" })
  );
}

/**
 * `networkidle` can come before React has hydrated the (large, lazily
 * loaded) gallery; a screenshot taken then changes the DOM React is about
 * to hydrate. React tags hydrated elements with its fiber key.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const column = document.querySelector('[data-theme-column="dark"]');
    return (
      column !== null &&
      Object.keys(column).some((key) => key.startsWith("__reactFiber"))
    );
  });
}
