import { expect, test } from "@playwright/test";
import { settleForShot } from "./helpers";

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
