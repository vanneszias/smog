import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

export const ORIGIN = "http://localhost:5173";

interface DevMail {
  messages: { subject: string; text: string; to: string }[];
}

const BLOCKING = new Set(["serious", "critical"]);
const OTP = /\b(\d{6})\b/;
const VERIFY_LINK = /http:\/\/localhost:5173\/api\/auth\/verify-email\?\S+/;

export function uniqueEmail(): string {
  return `e2e-${crypto.randomUUID()}@smog.test`;
}

/** The newest dev mail to `email` (auth mails are sent after the response). */
async function latestMail(
  request: APIRequestContext,
  email: string
): Promise<DevMail["messages"][number]> {
  let found: DevMail["messages"][number] | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get("/dev/mail.json");
        const { messages } = (await response.json()) as DevMail;
        found = messages.find((message) => message.to === email);
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
  const mail = await latestMail(request, email);
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
  const mail = await latestMail(request, email);
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

export async function blockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
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
