import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  type APIRequestContext,
  type Browser,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  launchReviewBrowser,
  THEMES,
  type Theme,
  themedContext,
  WIDTHS,
} from "./admin";
import {
  blockingViolations,
  e2eSeed,
  ORIGIN,
  stubMux,
  stubMuxStream,
  waitForApp,
} from "./helpers";

const NAAM_IN_DE_VIDEO = /^Naam in de video/;
const LOGO_TOEVOEGEN = /^Logo toevoegen/;
const VOLLEDIGE_NAAM = /^Volledige naam/;
const E_MAIL = /^E-mail$/;
const E_MAILADRES_VOOR_DE_FACTUUR = /^E-mailadres voor de factuur/;
const NAAM_OP_DE_FACTUUR = /^Naam op de factuur/;
const ONDERNEMINGSNUMMER = /^Ondernemingsnummer/;
const P_120_00 = /120,00/;

/*
 * The sponsor wizard, the return page, the re-edit link, R-11 and the
 * gesture CTA (phase 6 task 8), against the Mollie fake
 * (`@smog/payments/testing/server`, playwright.config.ts).
 *
 * Some parts need the server procedures of later tasks; each probes for
 * them and is skipped until they answer, so it runs as soon as they merge:
 * - NEEDS TASK 4 (checkout, logo upload, payment status, the webhook and
 *   the fake render): the paid and the failed checkout.
 * - NEEDS TASK 5 (`reedit.*`): the re-edit link flow.
 * - NEEDS TASK 6 (`admin.sponsorships.*`): "the admin queue has 2" is
 *   checked through `sponsorships.availability` (both `pending`) until the
 *   admin list exists; see the TODO below.
 *
 * Review screenshots (light/dark × 390/1280, reduced motion, nl-BE) only
 * when SPONSOR_SHOTS_DIR is set.
 */

/** The gestures this spec sponsors (no other spec looks at them). */
const FLOW_PAID = ["broer", "zus"] as const;
const FLOW_FAILED = ["mama", "papa"] as const;
const LIVE = "verdrietig";
const PENDING = "boos";
const FREE = "blij";
const REEDIT = "dankjewel";
const PRESELECT = "goedemorgen";
const ALL = [
  ...FLOW_PAID,
  ...FLOW_FAILED,
  LIVE,
  PENDING,
  FREE,
  REEDIT,
  PRESELECT,
];
const LEGACY_ID = "j57e2elegacygoedemorgen00000";
const REEDIT_TOKEN = "e2eReeditTokenForTheSponsorSpec_0123456789a";
const DAY = 86_400_000;
const MOLLIE_FAKE = `http://localhost:${process.env.E2E_MOLLIE_PORT ?? 4020}`;
/** A 1×1 transparent PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const SUCCESS_URL = /\/sponsor\/success\?payment=/;
const CHECKOUT_URL = new RegExp(`^${MOLLIE_FAKE}/checkout/`);
const TASK4 = "needs phase 6 task 4 (checkout, payment status, webhook)";

/** Whether a procedure is implemented (not the task 3 stub's 500). */
async function implemented(
  request: APIRequestContext,
  path: string,
  input: unknown
): Promise<boolean> {
  const response = await request.post(`/api/rpc/${path}`, {
    data: { json: input },
    headers: { origin: ORIGIN },
  });
  return response.status() !== 500;
}

async function checkoutReady(request: APIRequestContext): Promise<boolean> {
  return await implemented(request, "sponsorships/paymentStatus", {
    payment: crypto.randomUUID(),
  });
}

async function availability(
  request: APIRequestContext,
  slug: string
): Promise<string> {
  const gesture = await request.post("/api/rpc/gestures/bySlug", {
    data: { json: { slug } },
    headers: { origin: ORIGIN },
  });
  const { id } = ((await gesture.json()) as { json: { id: string } }).json;
  const response = await request.post("/api/rpc/sponsorships/availability", {
    data: { json: { gestureIds: [id] } },
    headers: { origin: ORIGIN },
  });
  const body = (await response.json()) as {
    json: { items: { state: string }[] };
  };
  return body.json.items[0]?.state ?? "unknown";
}

function card(page: Page, name: string) {
  return page.getByRole("button", { name: `${name} kiezen` });
}

/** The consent banner shows after hydration; decline it so it covers nothing. */
async function declineConsent(page: Page): Promise<void> {
  const decline = page.getByRole("button", { name: "Alleen noodzakelijke" });
  try {
    await decline.click({ timeout: 3000 });
  } catch {
    // Already answered in this context.
  }
}

async function openWizard(page: Page, path = "/sponsor"): Promise<void> {
  await stubMux(page);
  await page.goto(path);
  await waitForApp(page);
  await declineConsent(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Steun een gebaar" })
  ).toBeVisible();
}

async function choose(page: Page, names: readonly string[]): Promise<void> {
  for (const name of names) {
    const toggle = card(page, name);
    // biome-ignore lint/performance/noAwaitInLoops: clicks in order.
    await expect(toggle).toHaveAttribute("data-state", "available");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  }
}

interface DetailsOptions {
  invoice?: boolean;
  logo?: boolean;
}

async function fillDetails(
  page: Page,
  { invoice = false, logo = false }: DetailsOptions = {}
): Promise<void> {
  await page.getByRole("button", { exact: true, name: "Doorgaan" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Configureer je sponsoring" })
  ).toBeVisible();
  await page.getByLabel(NAAM_IN_DE_VIDEO).fill("Bakkerij Jansen");
  await expect(page.getByText("15/35")).toBeVisible();
  if (logo) {
    await page.getByRole("checkbox", { name: LOGO_TOEVOEGEN }).click();
    await page.locator("input#logo-upload").setInputFiles({
      buffer: PNG,
      mimeType: "image/png",
      name: "logo.png",
    });
    await expect(page.getByAltText("Voorbeeld van het logo")).toBeVisible();
  }
  await page.getByLabel(VOLLEDIGE_NAAM).fill("Jan Jansen");
  await page.getByLabel(E_MAIL).fill("e2e-sponsor@smog.test");
  if (invoice) {
    await page.getByRole("checkbox", { name: "Ik wens een factuur" }).click();
    await expect(page.getByLabel(E_MAILADRES_VOOR_DE_FACTUUR)).toHaveValue(
      "e2e-sponsor@smog.test"
    );
    await page.getByLabel(NAAM_OP_DE_FACTUUR).fill("Jansen BV");
    await page.getByLabel(ONDERNEMINGSNUMMER).fill("0123456789");
    await page.getByRole("button", { name: "Doorgaan naar voorbeeld" }).click();
    await expect(page.getByText("Ongeldig ondernemingsnummer.")).toBeVisible();
    await page.getByLabel(ONDERNEMINGSNUMMER).fill("BE 0123.456.749");
  }
  await page.getByRole("button", { name: "Doorgaan naar voorbeeld" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Bekijk je sponsoring" })
  ).toBeVisible();
}

/** Pays (or fails) on the fake's hosted checkout page. */
async function payAtMollie(page: Page, outcome: "Pay" | "Fail"): Promise<void> {
  await page.getByRole("button", { name: "Doorgaan naar betaling" }).click();
  await page.waitForURL(CHECKOUT_URL);
  await page.getByRole("button", { name: outcome }).click();
  await page.waitForURL(SUCCESS_URL);
  await waitForApp(page);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await e2eSeed(request, [
    { op: "resetSponsorships", slugs: ALL },
    { legacyId: LEGACY_ID, op: "legacyId", slug: PRESELECT },
    {
      displayName: "Bakkerij Peeters",
      endsAt: Date.UTC(2027, 4, 12, 10),
      gestureSlug: LIVE,
      id: "e2e-cta-live",
      op: "sponsorship",
      status: "live",
    },
    {
      displayName: "Wacht Even",
      gestureSlug: PENDING,
      id: "e2e-cta-pending",
      op: "sponsorship",
      status: "in_review",
    },
    {
      displayName: "Oude Naam",
      gestureSlug: REEDIT,
      id: "e2e-reedit",
      op: "sponsorship",
      status: "changes_requested",
      token: {
        expiresAt: Date.now() + 7 * DAY,
        hash: createHash("sha256").update(REEDIT_TOKEN).digest("hex"),
        purpose: "reedit",
      },
    },
  ]);
});

test("the wizard's three steps, accessible in light and dark", async ({
  browser,
}) => {
  for (const theme of THEMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one theme at a time.
    const context = await themedContext(browser, theme, 1280);
    try {
      const page = await context.newPage();
      await openWizard(page);
      // The sponsored and the pending gestures cannot be chosen.
      await expect(card(page, "Verdrietig")).toBeDisabled();
      await expect(card(page, "Boos")).toBeDisabled();
      expect(await blockingViolations(page), `${theme} step 1`).toEqual([]);
      await choose(page, ["Broer", "Zus"]);
      await expect(page.getByTestId("selection-count")).toHaveText(
        "2 gebaren geselecteerd"
      );
      await fillDetails(page, { invoice: true, logo: true });
      expect(await blockingViolations(page), `${theme} step 3`).toEqual([]);
      await expect(page.getByTestId("review-total")).toHaveText(P_120_00);
      await page.getByRole("button", { name: "Terug naar details" }).click();
      expect(await blockingViolations(page), `${theme} step 2`).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test("an old /sponsors?gestureId=<legacy id> lands in the wizard preselected (R-11)", async ({
  page,
}) => {
  await stubMux(page);
  const response = await page.request.get(
    `/sponsors?gestureId=${LEGACY_ID}&utm_source=qr`,
    { maxRedirects: 0 }
  );
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe(
    `/sponsor?gesture=${PRESELECT}&utm_source=qr`
  );
  await openWizard(page, `/sponsors?gestureId=${LEGACY_ID}`);
  expect(new URL(page.url()).search).toBe(`?gesture=${PRESELECT}`);
  await expect(card(page, "Goedemorgen")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("the gesture CTA: free, being sponsored, sponsored (L-17)", async ({
  page,
}) => {
  await stubMux(page);
  await stubMuxStream(page);
  await page.goto(`/gestures/${FREE}`);
  await waitForApp(page);
  const cta = page.getByTestId("sponsor-cta");
  await expect(cta.getByRole("link", { name: "Nu sponsoren" })).toHaveAttribute(
    "href",
    `/sponsor?gesture=${FREE}`
  );
  await page.goto(`/gestures/${PENDING}`);
  await expect(cta).toContainText("Dit gebaar wordt momenteel gesponsord.");
  await page.goto(`/gestures/${LIVE}`);
  await expect(cta).toContainText(
    "Dit gebaar wordt gesponsord door Bakkerij Peeters."
  );
  await expect(cta).toContainText("12 mei 2027");
  expect(await blockingViolations(page)).toEqual([]);
});

test("pays for 2 gestures with a logo and an invoice; the success page shows paid", async ({
  page,
}) => {
  test.skip(!(await checkoutReady(page.request)), TASK4);
  await openWizard(page);
  await choose(page, ["Broer", "Zus"]);
  await fillDetails(page, { invoice: true, logo: true });
  await payAtMollie(page, "Pay");
  await expect(
    page.getByRole("heading", { level: 1, name: "Betaling geslaagd!" })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Broer, Zus")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
  // The fake render ran: both are now in review (blocking, "pending").
  // TODO(task 6): assert the admin moderation queue lists both once
  // `admin.sponsorships.list` exists.
  await expect
    .poll(async () => [
      await availability(page.request, "broer"),
      await availability(page.request, "zus"),
    ])
    .toEqual(["pending", "pending"]);
});

test("a failed payment frees the gestures, and Try again keeps the selection", async ({
  page,
}) => {
  test.skip(!(await checkoutReady(page.request)), TASK4);
  await openWizard(page);
  await choose(page, ["Mama", "Papa"]);
  await fillDetails(page);
  await payAtMollie(page, "Fail");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "De betaling is niet gelukt",
    })
  ).toBeVisible({ timeout: 30_000 });
  expect(await availability(page.request, "mama")).toBe("available");
  await page.getByRole("link", { name: "Opnieuw proberen" }).click();
  await expect(card(page, "Mama")).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, "Papa")).toHaveAttribute("aria-pressed", "true");
});

test("the re-edit link: a new name, sent for review", async ({ page }) => {
  test.skip(
    !(await implemented(page.request, "sponsorships/reedit/get", {
      token: "x".repeat(43),
    })),
    "needs phase 6 task 5 (reedit.get / reedit.submit)"
  );
  await stubMux(page);
  await page.goto(`/sponsor/edit?token=${REEDIT_TOKEN}`);
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Werk je video bij" })
  ).toBeVisible();
  const name = page.getByLabel(NAAM_IN_DE_VIDEO);
  await expect(name).toHaveValue("Oude Naam");
  await name.fill("Nieuwe Naam");
  expect(await blockingViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Ter controle verzenden" }).click();
  await expect(page.getByRole("heading", { name: "Verzonden!" })).toBeVisible();
  // Single use: the link is spent.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Link niet gevonden" })
  ).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* Review screenshots                                                  */
/* ------------------------------------------------------------------ */

const PAYMENT = "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11";

function rpcAnswer(json: unknown, status = 200) {
  return {
    body: JSON.stringify(status === 200 ? { json, meta: [] } : { json }),
    contentType: "application/json",
    status,
  };
}

/** Answers one sponsorship read in the page (the server's stubs aside). */
async function answer(
  page: Page,
  path: string,
  json: unknown,
  status = 200
): Promise<void> {
  await page.route(`**/api/rpc/sponsorships/${path}**`, (route) =>
    route.fulfill(rpcAnswer(json, status))
  );
}

function paymentView(status: string, kind = "initial") {
  return {
    displayName: "Bakkerij Jansen",
    items: [
      { gestureName: "Broer", gestureSlug: "broer", includesLogo: true },
      { gestureName: "Zus", gestureSlug: "zus", includesLogo: true },
    ],
    kind,
    ...(kind === "renewal" ? { renewedUntil: Date.UTC(2027, 10, 2, 10) } : {}),
    status,
    totalCents: kind === "renewal" ? 6000 : 12_000,
  };
}

async function shoot(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const image of document.querySelectorAll("img")) {
      image.loading = "eager";
    }
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  await page.screenshot({ fullPage: true, path });
}

async function eachThemeAndWidth(
  browser: Browser,
  run: (page: Page, name: (shot: string) => string) => Promise<void>,
  dir: string
): Promise<void> {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      // biome-ignore lint/performance/noAwaitInLoops: one context at a time.
      const context = await themedContext(browser, theme as Theme, width);
      try {
        const page = await context.newPage();
        await stubMux(page);
        await stubMuxStream(page);
        await run(page, (shot) => join(dir, `${shot}-${theme}-${width}.png`));
      } finally {
        await context.close();
      }
    }
  }
}

test("review screenshots", async () => {
  test.setTimeout(1_800_000);
  const dir = process.env.SPONSOR_SHOTS_DIR;
  test.skip(!dir, "set SPONSOR_SHOTS_DIR to take the review screenshots");
  if (!dir) {
    return;
  }
  const browser = await launchReviewBrowser();
  try {
    await eachThemeAndWidth(
      browser,
      async (page, name) => {
        await openWizard(page, `/sponsor?gesture=${FREE}`);
        await shoot(page, name("01-select"));
        await choose(page, ["Broer"]);
        await page
          .getByRole("button", { exact: true, name: "Doorgaan" })
          .click();
        await page.getByRole("checkbox", { name: LOGO_TOEVOEGEN }).click();
        await page
          .getByRole("checkbox", { name: "Ik wens een factuur" })
          .click();
        await page
          .getByRole("button", { name: "Doorgaan naar voorbeeld" })
          .click();
        await shoot(page, name("02-details-errors"));
        await page.locator("input#logo-upload").setInputFiles({
          buffer: PNG,
          mimeType: "image/png",
          name: "logo.png",
        });
        await page.getByLabel(NAAM_IN_DE_VIDEO).fill("Bakkerij Jansen");
        await page.getByLabel(VOLLEDIGE_NAAM).fill("Jan Jansen");
        await page.getByLabel(E_MAIL).fill("jan@voorbeeld.be");
        await page.getByLabel(NAAM_OP_DE_FACTUUR).fill("Jansen BV");
        await page.getByLabel(ONDERNEMINGSNUMMER).fill("0123.456.749");
        await page
          .getByLabel(E_MAILADRES_VOOR_DE_FACTUUR)
          .fill("factuur@voorbeeld.be");
        await shoot(page, name("03-details"));
        await page
          .getByRole("button", { name: "Doorgaan naar voorbeeld" })
          .click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Bekijk je sponsoring" })
        ).toBeVisible();
        await shoot(page, name("04-review"));

        await page.unrouteAll({ behavior: "ignoreErrors" });
        await stubMux(page);
        await stubMuxStream(page);
        await answer(page, "availability", {
          checkoutEnabled: false,
          items: [],
        });
        await page.goto("/sponsor");
        await expect(
          page.getByRole("heading", { name: "Sponsoren is even gepauzeerd" })
        ).toBeVisible();
        await shoot(page, name("05-paused"));
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await stubMux(page);
        await stubMuxStream(page);

        for (const [status, kind, title] of [
          ["paid", "initial", "Betaling geslaagd!"],
          ["open", "initial", "Je betaling wordt verwerkt…"],
          ["failed", "initial", "De betaling is niet gelukt"],
          ["canceled", "initial", "De betaling is geannuleerd"],
          ["refund_needed", "initial", "We nemen contact met je op"],
          ["paid", "renewal", "Je sponsoring is verlengd!"],
        ] as const) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
          await page.unroute("**/api/rpc/sponsorships/paymentStatus**");
          await answer(page, "paymentStatus", paymentView(status, kind));
          await page.goto(`/sponsor/success?payment=${PAYMENT}`);
          await expect(
            page.getByRole("heading", { level: 1, name: title })
          ).toBeVisible();
          await shoot(page, name(`06-success-${status}-${kind}`));
        }
        await page.unroute("**/api/rpc/sponsorships/paymentStatus**");
        await page.goto("/sponsor/success");
        await shoot(page, name("06-success-missing"));

        await answer(page, "reedit/get", {
          displayName: "Oude Naam",
          expiresAt: Date.now() + 3 * DAY,
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: true,
        });
        await page.goto(`/sponsor/edit?token=${REEDIT_TOKEN}`);
        await expect(
          page.getByRole("heading", { level: 1, name: "Werk je video bij" })
        ).toBeVisible();
        await shoot(page, name("07-edit"));
        await page.unroute("**/api/rpc/sponsorships/reedit/get**");
        await page.route("**/api/rpc/sponsorships/reedit/get**", (route) =>
          route.fulfill({
            body: JSON.stringify({
              json: {
                code: "TOKEN_EXPIRED",
                data: { expiresAt: Date.UTC(2026, 8, 30, 10) },
                defined: true,
                message: "TOKEN_EXPIRED",
                status: 410,
              },
            }),
            contentType: "application/json",
            status: 410,
          })
        );
        await page.reload();
        await expect(
          page.getByRole("heading", { name: "Link verlopen" })
        ).toBeVisible();
        await shoot(page, name("07-edit-expired"));
        await page.goto("/sponsor/edit");
        await shoot(page, name("07-edit-invalid"));

        await answer(page, "renewal/get", {
          amountCents: 6000,
          displayName: "Bakkerij Jansen",
          endsAt: Date.UTC(2026, 10, 2, 10),
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: true,
        });
        await page.goto(`/sponsor/renew?token=${REEDIT_TOKEN}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Nog een jaar in de video",
          })
        ).toBeVisible();
        await shoot(page, name("08-renew"));

        for (const slug of [FREE, PENDING, LIVE]) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
          await page.goto(`/gestures/${slug}`);
          await expect(page.getByTestId("sponsor-cta")).toBeVisible();
          await shoot(page, name(`09-cta-${slug}`));
        }
      },
      dir
    );
  } finally {
    await browser.close();
  }
});
