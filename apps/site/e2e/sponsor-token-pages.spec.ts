import {
  type Browser,
  expect,
  type Page,
  type Request,
  test,
} from "@playwright/test";
import { THEMES, themedContext, WIDTHS } from "./admin";
import {
  blockingViolations,
  ORIGIN,
  stubMux,
  stubMuxStream,
  tabTo,
  waitForApp,
} from "./helpers";

/*
 * The re-edit and renewal pages with the token in the URL fragment (phase 9
 * task 7, ruling 7): the fragment link, the old `?token=` link that moves
 * into the fragment, the legacy `/sponsors/re-edit` redirect, no token in
 * any request URL or console line, a keyboard-only run, and axe on both
 * pages in every link state, light and dark at 390 and 1280. The links are
 * answered in the page (`page.route`): no row is read or written.
 */

const TOKEN = "e2eTokenPagesSpecStubbedOnly_0123456789a".padEnd(43, "0");
const DAY = 86_400_000;
const NAME_IN_THE_VIDEO = /^Naam in de video/;
const SIGN_IN_HREF = /^\/sign-in/;
const EDIT_TITLE = "Werk je video bij";
const RENEW_TITLE = "Nog een jaar in de video";

type State = "expired" | "invalid" | "unavailable" | "unknown" | "valid";
const STATES: readonly State[] = [
  "valid",
  "invalid",
  "unknown",
  "expired",
  "unavailable",
];
const PAGES = [
  { get: "reedit/get", path: "/sponsor/edit", title: EDIT_TITLE },
  { get: "renewal/get", path: "/sponsor/renew", title: RENEW_TITLE },
] as const;
const HEADING_OF: Record<Exclude<State, "valid">, string> = {
  expired: "Link verlopen",
  invalid: "Ongeldige link",
  unavailable: "Link niet meer bruikbaar",
  unknown: "Link niet gevonden",
};

function ok(json: unknown) {
  return {
    body: JSON.stringify({ json, meta: [] }),
    contentType: "application/json",
    status: 200,
  };
}

function refusal(code: string, status: number, data?: unknown) {
  return {
    body: JSON.stringify({
      json: { code, data, defined: true, message: code, status },
    }),
    contentType: "application/json",
    status,
  };
}

/** What `sponsorships.<get>` answers for a link in `state`. */
function linkAnswer(get: string, state: State) {
  switch (state) {
    case "valid":
      return get === "reedit/get"
        ? ok({
            displayName: "Oude Naam",
            expiresAt: Date.now() + 3 * DAY,
            gesture: { name: "Broer", slug: "broer" },
            hasLogo: false,
          })
        : ok({
            amountCents: 5000,
            displayName: "Bakkerij Jansen",
            endsAt: Date.now() + 20 * DAY,
            gesture: { name: "Broer", slug: "broer" },
            hasLogo: false,
          });
    case "expired":
      return refusal("TOKEN_EXPIRED", 410, {
        expiresAt: Date.UTC(2026, 8, 30, 10),
      });
    case "unavailable":
      return refusal("INVALID_STATE", 409, { reason: "notRenewable" });
    default:
      return refusal("TOKEN_INVALID", 404);
  }
}

async function stub(page: Page, get: string, state: State): Promise<void> {
  await stubMux(page);
  await stubMuxStream(page);
  await page.route(`**/api/rpc/sponsorships/${get}**`, (route) =>
    route.fulfill(linkAnswer(get, state))
  );
}

/** Every request URL the page made, to prove none carries the token. */
function watchRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request: Request) => {
    urls.push(request.url());
  });
  return urls;
}

function watchConsole(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    lines.push(message.text());
  });
  return lines;
}

test.describe("the fragment link", () => {
  for (const { get, path, title } of PAGES) {
    test(`${path}#token= opens the link; no request or console line carries the token`, async ({
      page,
    }) => {
      await stub(page, get, "valid");
      const requests = watchRequests(page);
      const lines = watchConsole(page);
      const response = await page.goto(`${path}#token=${TOKEN}`);
      expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
      await waitForApp(page);
      await expect(
        page.getByRole("heading", { level: 1, name: title })
      ).toBeVisible();
      expect(requests.filter((url) => url.includes(TOKEN))).toEqual([]);
      expect(lines.filter((line) => line.includes(TOKEN))).toEqual([]);
      // The header's sign-in link does not carry it into a `?redirect=`.
      const signIn = page.getByRole("link", { name: "Aanmelden" });
      await expect(signIn).toHaveAttribute("href", SIGN_IN_HREF);
      expect(await signIn.getAttribute("href")).not.toContain("token");
      // The fragment stays, so a reload opens the same link.
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: title })
      ).toBeVisible();
      expect(page.url()).toBe(`${ORIGIN}${path}#token=${TOKEN}`);
    });

    test(`${path}?token= (an old link) keeps working and the address bar loses the query`, async ({
      page,
    }) => {
      await stub(page, get, "valid");
      const lines = watchConsole(page);
      await page.goto(`${path}?token=${TOKEN}`);
      await expect(
        page.getByRole("heading", { level: 1, name: title })
      ).toBeVisible();
      await expect
        .poll(() => page.url())
        .toBe(`${ORIGIN}${path}#token=${TOKEN}`);
      expect(page.url()).not.toContain("?");
      // The router's own location agrees: the header's sign-in link is
      // built from it and carries no token.
      const signIn = page.getByRole("link", { name: "Aanmelden" });
      await expect(signIn).toHaveAttribute("href", SIGN_IN_HREF);
      expect(await signIn.getAttribute("href")).not.toContain("token");
      // The procedures got it in the body, from the fragment.
      expect(lines.filter((line) => line.includes(TOKEN))).toEqual([]);
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: title })
      ).toBeVisible();
    });
  }

  test("the old /sponsors/re-edit?token= redirects (302) to the fragment link", async ({
    request,
  }) => {
    const response = await request.get(`/sponsors/re-edit?token=${TOKEN}&x=1`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe(`/sponsor/edit#token=${TOKEN}`);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const renew = await request.get(`/sponsors/renew?token=${TOKEN}`, {
      maxRedirects: 0,
    });
    expect(renew.status()).toBe(302);
    expect(renew.headers().location).toBe(`/sponsor/renew#token=${TOKEN}`);
  });

  test("a direct /sponsor/edit?token= and /sponsor/renew?token= (the emailed links) get the same 302 before any page", async ({
    request,
  }) => {
    for (const path of ["/sponsor/edit", "/sponsor/renew"]) {
      // biome-ignore lint/performance/noAwaitInLoops: two requests.
      const response = await request.get(`${path}?token=${TOKEN}&x=1`, {
        maxRedirects: 0,
      });
      expect(response.status(), path).toBe(302);
      expect(response.headers().location, path).toBe(`${path}#token=${TOKEN}`);
      expect(response.headers()["cache-control"], path).toBe("no-store");
    }
  });

  test("a page without a token says so (no error flash before it is read)", async ({
    page,
  }) => {
    await stub(page, "reedit/get", "invalid");
    await page.goto("/sponsor/edit");
    await expect(
      page.getByRole("heading", { level: 1, name: HEADING_OF.invalid })
    ).toBeVisible();
  });

  test("keyboard only: the re-edit link, from the name to Sent", async ({
    page,
  }) => {
    await stub(page, "reedit/get", "valid");
    await page.route("**/api/rpc/sponsorships/reedit/submit**", (route) =>
      route.fulfill(ok({ submitted: true }))
    );
    await page.goto(`/sponsor/edit#token=${TOKEN}`);
    await waitForApp(page);
    const name = page.getByLabel(NAME_IN_THE_VIDEO);
    await tabTo(page, name);
    await expect(name).toHaveValue("Oude Naam");
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Nieuwe Naam");
    await tabTo(
      page,
      page.getByRole("button", { name: "Ter controle verzenden" })
    );
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Verzonden!" })
    ).toBeFocused();
  });
});

async function checkStates(
  browser: Browser,
  theme: (typeof THEMES)[number],
  width: (typeof WIDTHS)[number]
): Promise<void> {
  const context = await themedContext(browser, theme, width);
  try {
    for (const { get, path, title } of PAGES) {
      for (const state of STATES) {
        // A page per state: the fragment is read once per page.
        // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
        const page = await context.newPage();
        try {
          await stub(page, get, state);
          await page.goto(
            state === "invalid" ? path : `${path}#token=${TOKEN}`
          );
          await waitForApp(page);
          const heading = state === "valid" ? title : HEADING_OF[state];
          await expect(
            page.getByRole("heading", { level: 1, name: heading })
          ).toBeVisible();
          if (state === "valid" && path === "/sponsor/edit") {
            await expect(
              page.locator('[data-slot="sponsor-end-card"]')
            ).toBeVisible();
          }
          expect(
            await blockingViolations(page),
            `${theme} ${width} ${path} ${state}`
          ).toEqual([]);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
}

test.describe("axe on the token pages in every link state", () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`${theme} ${width}: valid, invalid, unknown or used, expired, unavailable`, async ({
        browser,
      }) => {
        test.setTimeout(240_000);
        await checkStates(browser, theme, width);
      });
    }
  }
});
