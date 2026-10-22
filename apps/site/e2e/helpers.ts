import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

export const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 5173}`;

interface DevMail {
  messages: { subject: string; text: string; to: string }[];
}

const BLOCKING = new Set(["serious", "critical"]);
/**
 * Moderate rules that still block: every page has its h1 (phase 6 task 8
 * review I-3: page-level states are level 1 in the kit).
 */
const BLOCKING_RULES = new Set(["page-has-heading-one"]);

/**
 * The third-party Mux player's own element (and its shadow DOM), left out
 * of every axe scan: whether its built-in, unnamed error dialog opens
 * depends on when the stubbed or unreachable stream answers, so scanning
 * it made the a11y specs non-deterministic (`aria-dialog-name`). Our markup
 * around the player (the wrapper, its label, the poster) is still scanned.
 */
const AXE_EXCLUDED = ["mux-player"] as const;

/** `builder` without `AXE_EXCLUDED` (one `exclude` per selector: an array is a frame path). */
export function withoutAxeExcluded(builder: AxeBuilder): AxeBuilder {
  let scoped = builder;
  for (const selector of AXE_EXCLUDED) {
    scoped = scoped.exclude(selector);
  }
  return scoped;
}
const OTP = /\b(\d{6})\b/;
const VERIFY_LINK = new RegExp(`${ORIGIN}/api/auth/verify-email\\?\\S+`);

/**
 * Fixture writes through the dev Worker (`POST /dev/e2e-seed`, dev builds
 * only), never a second `wrangler d1 execute` on the live SQLite file
 * (SQLITE_BUSY while other specs write).
 */
export async function e2eSeed(
  request: APIRequestContext,
  seeds: readonly Record<string, unknown>[]
): Promise<void> {
  const response = await request.post("/dev/e2e-seed", {
    data: seeds,
    headers: { origin: ORIGIN },
  });
  if (!response.ok()) {
    throw new Error(
      `[e2e] Seeding failed: ${response.status()} ${await response.text()}`
    );
  }
}

export function uniqueEmail(): string {
  return `e2e-${crypto.randomUUID()}@smog.test`;
}

/**
 * The newest dev mail to `email` that `match` accepts. Auth mails are
 * queued after the response and sent by the email queue's consumer, and a
 * verified address also gets the welcome email, so the newest mail is not
 * always the one a test waits for.
 */
async function latestMail(
  request: APIRequestContext,
  email: string,
  match: (message: DevMail["messages"][number]) => boolean
): Promise<DevMail["messages"][number]> {
  let found: DevMail["messages"][number] | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get("/dev/mail.json");
        const { messages } = (await response.json()) as DevMail;
        found = messages.find(
          (message) => message.to === email && match(message)
        );
        return Boolean(found);
      },
      { timeout: 15_000 }
    )
    .toBe(true);
  if (!found) {
    throw new Error(`no mail to ${email}`);
  }
  return found;
}

export async function otpFor(
  request: APIRequestContext,
  email: string
): Promise<string> {
  const mail = await latestMail(request, email, ({ subject }) =>
    OTP.test(subject)
  );
  const code = mail.subject.match(OTP)?.[1];
  if (!code) {
    throw new Error(`no code in "${mail.subject}"`);
  }
  return code;
}

export async function verifyLinkFor(
  request: APIRequestContext,
  email: string
): Promise<string> {
  const mail = await latestMail(request, email, ({ text }) =>
    VERIFY_LINK.test(text)
  );
  const link = mail.text.match(VERIFY_LINK)?.[0];
  if (!link) {
    throw new Error("no verification link in the mail");
  }
  return link;
}

/** Signs a new user in through the API (the page's cookies are shared). */
export async function signInWithApi(page: Page): Promise<string> {
  const email = uniqueEmail();
  const headers = { origin: ORIGIN };
  const sent = await page.request.post(
    "/api/auth/email-otp/send-verification-otp",
    {
      data: { email, type: "sign-in" },
      headers,
    }
  );
  expect(sent.ok()).toBe(true);
  const otp = await otpFor(page.request, email);
  const signedIn = await page.request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp },
    headers,
  });
  expect(signedIn.ok()).toBe(true);
  return email;
}

/**
 * Collects console errors and uncaught exceptions for the whole test. A
 * `Failed to fetch` raised while the main frame is navigating away (from the
 * request of the next document to its DOMContentLoaded) is the dying page's
 * in-flight request being aborted, not a product error, and is dropped;
 * the same error at any other time still counts.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  let leaving = false;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      leaving = true;
    }
  });
  page.on("domcontentloaded", () => {
    leaving = false;
  });
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    if (leaving && text.includes("TypeError: Failed to fetch")) {
      return;
    }
    errors.push(text);
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

/**
 * axe's serious and critical violations, plus `BLOCKING_RULES`, outside
 * `AXE_EXCLUDED` (the Mux player). `exclude` leaves more selectors out,
 * frames included: axe never enters an excluded frame (a sandboxed
 * preview frame refuses its script, and the run can hang there).
 * `menuOpen` is for a scan taken while a menu is open: Radix's modal menu
 * hides the rest of the page from assistive technology (`aria-hidden`) and
 * traps the focus in the menu, which axe only accepts for a dialog, so
 * `aria-hidden-focus` and (the whole page being hidden) `page-has-heading-one`
 * are not run then (DECISIONS, phase 9 task 5).
 */
export async function blockingViolations(
  page: Page,
  {
    exclude = [],
    menuOpen = false,
  }: { exclude?: readonly string[]; menuOpen?: boolean } = {}
) {
  await settleAnimations(page);
  let builder = new AxeBuilder({ page });
  if (menuOpen) {
    builder = builder.disableRules([
      "aria-hidden-focus",
      "page-has-heading-one",
    ]);
  }
  for (const selector of [...AXE_EXCLUDED, ...exclude]) {
    builder = builder.exclude(selector);
  }
  const results = await builder.analyze();
  return results.violations
    .filter(
      (violation) =>
        BLOCKING.has(violation.impact ?? "") || BLOCKING_RULES.has(violation.id)
    )
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    }));
}

/**
 * Waits until the finite CSS transitions and animations on the page are
 * done (a button fading from disabled to enabled reads as a failing
 * `color-contrast` mid-way). Endless ones (a spinner) are left out, and the
 * wait is bounded.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().iterations !==
          Number.POSITIVE_INFINITY
      );
    await Promise.race([
      Promise.all(
        finite.map((animation) => animation.finished.catch(() => undefined))
      ),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);
  });
}

/**
 * The gallery's gesture cards load Mux thumbnails. Tests answer them with a
 * local 3:4 still, so screenshots are stable and the suite runs offline.
 */
const STILL = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><rect width="480" height="640" fill="#9aa8a0"/><circle cx="240" cy="250" r="90" fill="#c9d2cc"/><rect x="120" y="380" width="240" height="200" rx="60" fill="#c9d2cc"/></svg>`;

/** An empty, valid HLS playlist (no segments), so no player error opens. */
const EMPTY_HLS =
  "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-ENDLIST\n";

/**
 * Mux streams are not reachable offline: every playlist is answered with
 * an empty valid one (the player shows its poster, no error dialog), and
 * Mux Data beacons are refused.
 */
export async function stubMuxStream(page: Page): Promise<void> {
  await page.route("https://stream.mux.com/**", (route) =>
    route.fulfill({
      body: EMPTY_HLS,
      contentType: "application/vnd.apple.mpegurl",
    })
  );
  await page.route("https://*.litix.io/**", (route) => route.abort());
}

/**
 * The sponsor preview's source (phase 7 ruling 15): Mux's static MP4
 * renditions (`highest.mp4`, `high.mp4`) answered with a committed 2 s
 * 360 × 480 clip (`fixtures/preview-2s.mp4`: 3:4, the gesture library's
 * 810 × 1080 scaled down; fix wave M-5), with byte ranges and CORS
 * as Mux answers them. The clip is VP9 in MP4: Playwright's Chromium is
 * an open-source build without H.264, which Mux's renditions use and every
 * shipping browser plays. Or the MP4s are refused (`abort`), which shows
 * the preview's image fallback.
 * Registered after `stubMuxStream`, so it wins for the MP4s.
 */
const PREVIEW_MP4 = readFileSync(
  join(import.meta.dirname, "fixtures", "preview-2s.mp4")
);
const MUX_RENDITION =
  /^https:\/\/stream\.mux\.com\/[^/]+\/(?:highest|high)\.mp4/;
const BYTE_RANGE = /^bytes=(\d*)-(\d*)$/;
const CORS = {
  "access-control-allow-headers": "range",
  "access-control-allow-origin": "*",
  "access-control-expose-headers":
    "accept-ranges, content-length, content-range",
};

/** A `Range: bytes=a-b` header as inclusive offsets, or `null` without one. */
function byteRange(
  header: string | null,
  size: number
): { end: number; start: number } | null {
  if (!(header && BYTE_RANGE.test(header))) {
    return null;
  }
  const [from = "", to = ""] = header.slice("bytes=".length).split("-");
  return {
    end: to === "" ? size - 1 : Math.min(Number(to), size - 1),
    start: from === "" ? 0 : Number(from),
  };
}

export async function stubMuxRenditions(
  page: Page,
  { abort = false }: { abort?: boolean } = {}
): Promise<void> {
  await page.route(MUX_RENDITION, async (route) => {
    const request = route.request();
    if (abort) {
      await route.abort();
      return;
    }
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: CORS, status: 204 });
      return;
    }
    const size = PREVIEW_MP4.length;
    const range = byteRange(await request.headerValue("range"), size);
    const { end, start } = range ?? { end: size - 1, start: 0 };
    await route.fulfill({
      body: range ? PREVIEW_MP4.subarray(start, end + 1) : PREVIEW_MP4,
      headers: {
        ...CORS,
        "accept-ranges": "bytes",
        "content-type": "video/mp4",
        ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
      },
      status: range ? 206 : 200,
    });
  });
}

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

/**
 * A server-rendered page reacts to clicks and typing only once React has
 * hydrated it; React tags hydrated elements with its fiber key.
 */
export async function waitForApp(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const main = document.getElementById("main");
    return (
      main !== null &&
      Object.keys(main).some((key) => key.startsWith("__reactFiber"))
    );
  });
}

/**
 * Presses Tab until `target` has the focus (at most `max` times), so a
 * step is reached the way a keyboard user reaches it.
 */
export async function tabTo(
  page: Page,
  target: Locator,
  max = 30
): Promise<void> {
  for (let presses = 0; presses < max; presses += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one key at a time.
    if (await target.evaluate((node) => node === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

/**
 * Waits until the page has painted what a screenshot should show: web
 * fonts loaded, every image decoded (or failed) and two animation frames
 * past the last layout change. Conditions, not a fixed sleep.
 */
export async function settleForShot(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const settled = async (): Promise<void> => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          // An offscreen lazy image never loads (a full-page shot does not
          // scroll): not waited for.
          .filter((image) => !image.complete && image.loading !== "lazy")
          .map(
            (image) =>
              new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), {
                  once: true,
                });
              })
          )
      );
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    };
    // Bounded: a stuck image must not eat the test's whole timeout.
    await Promise.race([
      settled(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);
  });
}

/**
 * Starts listening for the next `storage` event (another tab wrote
 * localStorage) in `page`. Await the returned function after the write: the
 * app's own listener (registered earlier) has run by then, so a "nothing is
 * sent afterwards" assertion starts from a settled state, not a sleep.
 */
export async function expectStorageEvent(
  page: Page
): Promise<() => Promise<void>> {
  // An object around the promise: `evaluateHandle` would await a bare one.
  const handle = await page.evaluateHandle(() => ({
    seen: new Promise<void>((resolve) => {
      window.addEventListener("storage", () => resolve(), { once: true });
    }),
  }));
  return async () => {
    await handle.evaluate((box) => box.seen);
    await handle.dispose();
  };
}
