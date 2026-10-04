import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  stubMuxRenditions,
  stubMuxStream,
  tabTo,
  waitForApp,
} from "./helpers";
import { signInAsAdmin } from "./maintenance";

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
 * The paid test checks the admin review queue (`admin.sponsorships.list`)
 * until both sponsorships are `in_review`, which proves the webhook, the
 * `payment.settled` fan-out and the fake render.
 *
 * Run alone with a dev server you started yourself (`reuseExistingServer`),
 * that server needs the Mollie fake's `SMOG_DEV_MOLLIE_*` env (see
 * playwright.config.ts), or the wizard reads "paused" and these tests fail.
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
/**
 * The review screenshots' gesture: never sponsored by any test (the R-11
 * test only preselects it), so a full run, where the paid flow has taken
 * Broer and Zus, still finds it free.
 */
const SHOTS_GESTURE = "Goedemorgen";
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
/**
 * An opaque 160 × 160 PNG logo (a green ring on white), so the preview's
 * logo box shows what the render would draw.
 */
const PNG = readFileSync(join(import.meta.dirname, "fixtures", "logo.png"));
const SUCCESS_URL = /\/sponsor\/success\?payment=/;
const CHECKOUT_URL = new RegExp(`^${MOLLIE_FAKE}/checkout/`);
/**
 * The admin review queue (`admin.sponsorships.list`, status `in_review`)
 * as `slug:status`, for these gestures, read with an admin session.
 */
async function reviewQueue(
  admin: APIRequestContext,
  slugs: readonly string[]
): Promise<string[]> {
  const response = await admin.post("/api/rpc/admin/sponsorships/list", {
    data: { json: { limit: 100, status: ["in_review"] } },
    headers: { origin: ORIGIN },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { json } = (await response.json()) as {
    json: { items: { gesture: { slug: string }; status: string }[] };
  };
  return json.items
    .filter((item) => slugs.includes(item.gesture.slug))
    .map((item) => `${item.gesture.slug}:${item.status}`)
    .sort();
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

/** A card is a toggle named by its gesture. */
function card(page: Page, name: string) {
  return page.getByRole("button", { exact: true, name });
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
  await stubMuxRenditions(page);
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

/** The overlay's fixed first line (content, Dutch in every language). */
const INTRO = "Met de warme steun van:";
const PICKER = "Kies het gebaar voor het voorbeeld";
const HIGHEST_MP4 = /^https:\/\/stream\.mux\.com\/[^/]+\/highest\.mp4(?:#.*)?$/;

/** The sponsor preview's frame, named by its gesture. */
function preview(page: Page, gesture: string) {
  return page.getByRole("img", { name: `Voorbeeld voor ${gesture}` });
}

/** The Player has mounted: its kit controls are enabled. */
async function previewReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: "Toon het einde" })
  ).toBeEnabled({ timeout: 30_000 });
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

// The rows stay out of the admin screens other specs look at (review Minor 10).
test.afterAll(async ({ request }) => {
  await e2eSeed(request, [{ op: "resetSponsorships", slugs: ALL }]);
});

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
      await previewReady(page);
      expect(await blockingViolations(page), `${theme} step 3`).toEqual([]);
      await expect(page.getByTestId("review-total")).toHaveText(P_120_00);
      await page.getByRole("button", { name: "Terug naar details" }).click();
      expect(await blockingViolations(page), `${theme} step 2`).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test("keyboard only: the cards, the selection bar, the dropzone's button and the stepper", async ({
  page,
}) => {
  await openWizard(page);
  const steps = page.getByRole("navigation", { name: "Stappen" });
  const current = steps.locator('[aria-current="step"]');
  await expect(current).toContainText("Gebaren kiezen");
  // A card is a toggle: Tab to it, Space chooses it.
  const blij = card(page, "Blij");
  await tabTo(page, blij, 120);
  await page.keyboard.press("Space");
  await expect(blij).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selection-count")).toHaveText(
    "1 gebaar geselecteerd"
  );
  const goedemorgen = card(page, "Goedemorgen");
  await tabTo(page, goedemorgen, 120);
  await page.keyboard.press("Space");
  await expect(goedemorgen).toHaveAttribute("aria-pressed", "true");
  // The sticky selection bar's Continue is in the tab order after the grid.
  await tabTo(
    page,
    page.getByRole("button", { exact: true, name: "Doorgaan" }),
    120
  );
  await page.keyboard.press("Enter");
  const details = page.getByRole("heading", {
    level: 1,
    name: "Configureer je sponsoring",
  });
  await expect(details).toBeFocused();
  await expect(current).toContainText("Jouw gegevens");
  await tabTo(page, page.getByLabel(NAAM_IN_DE_VIDEO));
  await page.keyboard.type("Bakkerij Toets");
  await tabTo(page, page.getByRole("checkbox", { name: LOGO_TOEVOEGEN }));
  await page.keyboard.press("Space");
  // The dropzone's keyboard path is its button, which opens the file picker.
  await tabTo(page, page.getByRole("button", { name: "kies een bestand" }));
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles({
    buffer: PNG,
    mimeType: "image/png",
    name: "logo.png",
  });
  await expect(page.getByAltText("Voorbeeld van het logo")).toBeVisible();
  await tabTo(page, page.getByLabel(VOLLEDIGE_NAAM));
  await page.keyboard.type("Toets Toetsenbord");
  await tabTo(page, page.getByLabel(E_MAIL));
  await page.keyboard.type("e2e-keyboard@smog.test");
  await tabTo(
    page,
    page.getByRole("button", { name: "Doorgaan naar voorbeeld" })
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bekijk je sponsoring" })
  ).toBeFocused();
  await expect(current).toContainText("Voorbeeld en betalen");
  // The preview (phase 7 ruling 8): the kit controls, then the picker.
  await previewReady(page);
  const play = page.getByRole("button", { name: "Afspelen" });
  await tabTo(page, play);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pauzeren" })).toBeFocused();
  await expect(play).toBeFocused({ timeout: 10_000 });
  await tabTo(page, page.getByRole("button", { name: "Toon het einde" }));
  await page.keyboard.press("Enter");
  await expect(preview(page, "Blij").getByText(INTRO)).toBeVisible();
  const picker = page.getByRole("toolbar", { name: PICKER });
  await tabTo(page, picker.getByRole("button", { name: "Blij" }));
  await page.keyboard.press("ArrowRight");
  const second = picker.getByRole("button", { name: "Goedemorgen" });
  await expect(second).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(preview(page, "Goedemorgen")).toBeVisible();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(second).toBeFocused();
  await previewReady(page);
  expect(await blockingViolations(page)).toEqual([]);
  // Back keeps what was typed.
  await tabTo(page, page.getByRole("button", { name: "Terug naar details" }));
  await page.keyboard.press("Enter");
  await expect(details).toBeFocused();
  await expect(page.getByLabel(NAAM_IN_DE_VIDEO)).toHaveValue("Bakkerij Toets");
});

test("the review step plays the gesture's MP4 in the Player, with the overlay (S-10)", async ({
  page,
}) => {
  await openWizard(page);
  await choose(page, ["Broer", "Zus"]);
  await fillDetails(page, { logo: true });
  const frame = preview(page, "Broer");
  await previewReady(page);
  const video = frame.locator("video");
  await expect(video).toHaveAttribute("src", HIGHEST_MP4);
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState)
    )
    .toBeGreaterThanOrEqual(2);
  // Paused on the last frame: the result shows at once, the logo too.
  await expect(frame.getByText(INTRO)).toBeVisible();
  await expect(frame.getByText("Bakkerij Jansen")).toBeVisible();
  await expect(frame.locator('img[src^="blob:"]')).toBeVisible();
  await expect(
    page.getByText("De video kan hier niet worden afgespeeld", { exact: false })
  ).toHaveCount(0);
  // Play replays the 2 s clip from the start, then it is paused again.
  await page.getByRole("button", { name: "Afspelen" }).click();
  await expect(page.getByRole("button", { name: "Pauzeren" })).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime)
    )
    .toBeGreaterThan(0.5);
  await expect(page.getByRole("button", { name: "Afspelen" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Toon het einde" }).click();
  await expect(frame.getByText(INTRO)).toBeVisible();
  await expect(frame.getByText("Bakkerij Jansen")).toBeVisible();
  // One Player at a time: the picker switches it, the focus stays.
  const picker = page.getByRole("toolbar", { name: PICKER });
  const zus = picker.getByRole("button", { name: "Zus" });
  await zus.click();
  await expect(zus).toHaveAttribute("aria-pressed", "true");
  await expect(zus).toBeFocused();
  await expect(preview(page, "Zus")).toBeVisible();
  await previewReady(page);
  await expect(page.locator("video")).toHaveCount(1);
});

test("an MP4 that does not load: the image fallback, the overlay and the note", async ({
  page,
}) => {
  await openWizard(page);
  await stubMuxRenditions(page, { abort: true });
  await choose(page, ["Blij"]);
  await fillDetails(page);
  const frame = preview(page, "Blij");
  await previewReady(page);
  await expect(
    page.getByText(
      "De video kan hier niet worden afgespeeld, dus het voorbeeld toont een stilstaand beeld van het gebaar.",
      { exact: false }
    )
  ).toBeVisible();
  await expect(frame.locator("video")).toHaveCount(0);
  await expect(
    frame.locator('img[src^="https://image.mux.com/"][src*="width=720"]')
  ).toBeVisible();
  await expect(frame.getByText(INTRO)).toBeVisible();
  await expect(frame.getByText("Bakkerij Jansen")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
});

test("the review step's preview is accessible at 390 and 1280, light and dark", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      // biome-ignore lint/performance/noAwaitInLoops: one context at a time.
      const context = await themedContext(browser, theme, width);
      try {
        const page = await context.newPage();
        await openWizard(page);
        await choose(page, ["Broer", "Zus"]);
        await fillDetails(page, { logo: true });
        await previewReady(page);
        await expect(preview(page, "Broer").getByText(INTRO)).toBeVisible();
        expect(await blockingViolations(page), `${theme} ${width}`).toEqual([]);
      } finally {
        await context.close();
      }
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
  request,
}) => {
  await openWizard(page);
  await choose(page, ["Broer", "Zus"]);
  await fillDetails(page, { invoice: true, logo: true });
  await payAtMollie(page, "Pay");
  await expect(
    page.getByRole("heading", { level: 1, name: "Betaling geslaagd!" })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Broer, Zus")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
  // The webhook, `payment.settled`, the consumer and the fake render ran:
  // both wait in the admin review queue (task 6's API, its own session).
  await signInAsAdmin(request);
  await expect
    .poll(async () => await reviewQueue(request, FLOW_PAID), {
      timeout: 30_000,
    })
    .toEqual(["broer:in_review", "zus:in_review"]);
});

test("a failed payment frees the gestures, and Try again keeps the selection", async ({
  page,
}) => {
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
  await stubMux(page);
  await stubMuxRenditions(page);
  await page.goto(`/sponsor/edit?token=${REEDIT_TOKEN}`);
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Werk je video bij" })
  ).toBeVisible();
  const name = page.getByLabel(NAAM_IN_DE_VIDEO);
  await expect(name).toHaveValue("Oude Naam");
  // One gesture, one Player, the name updating it as it is typed.
  const frame = preview(page, "Dankjewel");
  await previewReady(page);
  await expect(frame.locator("video")).toHaveAttribute("src", HIGHEST_MP4);
  await expect(frame.getByText("Oude Naam")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: PICKER })).toHaveCount(0);
  await name.fill("Nieuwe Naam");
  await expect(frame.getByText("Nieuwe Naam")).toBeVisible();
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

/** Answers one sponsorship read in the page (a stubbed state for the matrix). */
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
        await stubMuxRenditions(page);
        await run(page, (shot) => join(dir, `${shot}-${theme}-${width}.png`));
      } finally {
        await context.close();
      }
    }
  }
}

/**
 * A deliberate matrix of stubbed states, answered in the page
 * (`page.route`) so each is reached at once and deterministically: paused,
 * every success state, the re-edit and renewal links and their guards;
 * then the CTA's three states (seeded). The real flows run end to end in
 * the tests above. `each` runs on every state (a screenshot, an axe check).
 */
async function stubbedStates(
  page: Page,
  each: (state: string) => Promise<void>
): Promise<void> {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await stubMux(page);
  await stubMuxStream(page);
  await stubMuxRenditions(page);
  await answer(page, "availability", {
    checkoutEnabled: false,
    items: [],
  });
  await page.goto("/sponsor");
  await expect(
    page.getByRole("heading", { name: "Sponsoren is even gepauzeerd" })
  ).toBeVisible();
  await each("05-paused");
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await stubMux(page);
  await stubMuxStream(page);
  await stubMuxRenditions(page);

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
    await each(`06-success-${status}-${kind}`);
  }
  await page.unroute("**/api/rpc/sponsorships/paymentStatus**");
  await page.goto("/sponsor/success");
  await each("06-success-missing");

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
  await each("07-edit");
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
  await each("07-edit-expired");
  await page.goto("/sponsor/edit");
  await each("07-edit-invalid");

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
  await each("08-renew");

  for (const slug of [FREE, PENDING, LIVE]) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
    await page.goto(`/gestures/${slug}`);
    await expect(page.getByTestId("sponsor-cta")).toBeVisible();
    await each(`09-cta-${slug}`);
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
        // Its own gesture: the paid flow has taken Broer by now (task 8).
        await choose(page, [SHOTS_GESTURE]);
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
        await previewReady(page);
        await shoot(page, name("04-review"));

        await stubbedStates(page, (shot) => shoot(page, name(shot)));
      },
      dir
    );
  } finally {
    await browser.close();
  }
});

test("axe on the paused, success, link and CTA states in light and dark (review Minor 9)", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  for (const theme of THEMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one theme at a time.
    const context = await themedContext(browser, theme, 1280);
    try {
      const page = await context.newPage();
      await stubMux(page);
      await stubMuxStream(page);
      await stubMuxRenditions(page);
      await page.goto("/");
      await waitForApp(page);
      await declineConsent(page);
      await stubbedStates(page, async (state) => {
        expect(await blockingViolations(page), `${theme} ${state}`).toEqual([]);
      });
    } finally {
      await context.close();
    }
  }
});
