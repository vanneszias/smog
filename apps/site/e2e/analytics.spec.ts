import { expect, type Page, type Request, test } from "@playwright/test";
import { watchErrors } from "./helpers";

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

  // Withdrawn: nothing new.
  await setConsent(page, false);
  await page.reload();
  await page.waitForLoadState("networkidle");
  const before = relay.requests.length;
  await browse(page);
  expect(relay.requests).toHaveLength(before);
  expect(errors).toEqual([]);
});
