import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

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

/** Collects console errors and uncaught exceptions for the whole test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

/**
 * axe's serious and critical violations, plus `BLOCKING_RULES`. `exclude` leaves selectors out,
 * frames included: axe never enters an excluded frame (a sandboxed
 * preview frame refuses its script, and the run can hang there).
 */
export async function blockingViolations(
  page: Page,
  { exclude = [] }: { exclude?: readonly string[] } = {}
) {
  let builder = new AxeBuilder({ page });
  for (const selector of exclude) {
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
