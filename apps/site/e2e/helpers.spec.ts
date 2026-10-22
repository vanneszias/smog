import { expect, test } from "@playwright/test";
import { settleForShot, watchErrors } from "./helpers";

const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

test("settleForShot returns with an offscreen lazy image that never loads", async ({
  page,
}) => {
  await page.setContent(
    `<img alt="" src="${PIXEL}" width="10" height="10">
     <div style="height:5000px"></div>
     <img alt="" loading="lazy" src="${PIXEL}?lazy" width="10" height="10">`
  );
  const started = Date.now();
  await settleForShot(page);
  // Settled long before the 5 s bound: the lazy image is not waited for.
  expect(Date.now() - started).toBeLessThan(4000);
});

test("watchErrors drops an aborted fetch only while the page is navigating away", async ({
  page,
}) => {
  await page.route("https://watch.test/**", async (route) => {
    if (route.request().url().endsWith("/two")) {
      // The next document is slow: the old page is still alive meanwhile.
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        body: "<title>two</title>",
        contentType: "text/html",
      });
      return;
    }
    await route.fulfill({
      body: `<title>one</title><script>
        setTimeout(() => console.error("TypeError: Failed to fetch"), 200);
      </script>`,
      contentType: "text/html",
    });
  });
  const errors = watchErrors(page);
  await page.goto("https://watch.test/one");
  // At rest the same message is a real error.
  await expect.poll(() => errors.length).toBe(1);
  // Raised while the next document is still loading: the dying page's request.
  await page.goto("https://watch.test/one");
  await page.goto("https://watch.test/two");
  expect(errors).toHaveLength(1);
  // Anything else is never dropped.
  await page.evaluate(() => console.error("TypeError: boom"));
  await expect.poll(() => errors.length).toBe(2);
});
