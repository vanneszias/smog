import { expect, type Page, type Request, test } from "@playwright/test";
import { stubMux, watchErrors } from "./helpers";

const STORE_KEY = "smog:guest:v1";
const SIGN_IN_URL = /\/sign-in/;

/** Every request to the analytics relay, with its parsed body. */
function recordRelay(page: Page): { bodies: unknown[]; requests: Request[] } {
  const requests: Request[] = [];
  const bodies: unknown[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/analytics") {
      requests.push(request);
      bodies.push(request.postDataJSON());
    }
  });
  return { bodies, requests };
}

/** Writes the analytics decision into the local store (the banner comes later). */
async function setConsent(
  page: Page,
  analytics: boolean | null
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => {
      const raw = localStorage.getItem(key);
      const data = raw
        ? JSON.parse(raw)
        : {
            favorites: [],
            lists: [],
            preferences: {
              importDismissedFor: [],
              locale: null,
              theme: "system",
            },
            recentSearches: [],
            version: 2,
          };
      data.consent = { analytics: value, decidedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: STORE_KEY, value: analytics }
  );
}

async function browse(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Aanmelden" }).first().click();
  await expect(page).toHaveURL(SIGN_IN_URL);
  await page.goto("/");
  // Give a late (keepalive) request the time to show up.
  await page.waitForLoadState("networkidle");
}

test("no /api/analytics request before consent, or after withdraw", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const relay = recordRelay(page);
  // The home page's cards load Mux stills.
  await stubMux(page);

  // Undecided: browsing sends nothing.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await browse(page);
  expect(relay.requests).toHaveLength(0);

  // Refused: still nothing.
  await setConsent(page, false);
  await page.reload();
  await browse(page);
  expect(relay.requests).toHaveLength(0);

  // Allowed: screen views go to the same-origin relay, as route templates.
  await setConsent(page, true);
  await page.reload();
  await expect.poll(() => relay.requests.length).toBeGreaterThan(0);
  await browse(page);
  expect(relay.bodies).toContainEqual({
    payload: {
      name: "screen_view",
      properties: { path: "/sign-in", platform: "web" },
    },
    type: "track",
  });
  for (const request of relay.requests) {
    expect(request.method()).toBe("POST");
  }

  // Withdrawn in another tab, without a reload here: the live store
  // subscription closes the gate, so a client-side navigation sends nothing.
  const other = await page.context().newPage();
  await other.goto("/");
  await setConsent(other, false);
  await other.close();
  await page.waitForTimeout(500);
  const live = relay.requests.length;
  await page.getByRole("link", { name: "Aanmelden" }).first().click();
  await expect(page).toHaveURL(SIGN_IN_URL);
  await page.waitForLoadState("networkidle");
  expect(relay.requests).toHaveLength(live);

  // Withdrawn and reloaded: nothing new.
  await page.reload();
  await page.waitForLoadState("networkidle");
  const before = relay.requests.length;
  await browse(page);
  expect(relay.requests).toHaveLength(before);
  expect(errors).toEqual([]);
});
