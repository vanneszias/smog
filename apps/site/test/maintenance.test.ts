import { env, exports } from "cloudflare:workers";
import {
  MAINTENANCE_KV_KEY,
  type MaintenanceSetting,
  parseMaintenanceSetting,
} from "@smog/config/maintenance";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AUTH_SIGN_IN_ROUTES,
  BYPASS_COOKIE,
  bypassCookieHeader,
  clearMaintenanceCache,
  retryAfterSeconds,
  signBypassCookie,
} from "../src/worker/maintenance";
import { renderMaintenancePage } from "../src/worker/maintenance-page";
import { mailTo, ORIGIN, signedUp, waitForMail } from "./helpers";

const SECRET = "site-test-secret-at-least-32-characters";
const HOUR_S = 3600;
/** dev: no `Secure` (http://localhost and LAN addresses); see the unit test. */
const COOKIE_ATTRS = /; Path=\/; Max-Age=43200; HttpOnly; SameSite=Lax$/;
const PASSWORD = "correct horse battery";
const OTP_CODE = /\b\d{6}\b/;
const PROVIDER_SEGMENT = /\/callback\/[a-z]+$/;

function binding<T>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`[test] The ${name} binding is missing`);
  }
  return value;
}

const kv = binding(env.KV, "KV");
const db = binding(env.DB, "DB");

/** Writes KV without clearing the isolate cache (a change another isolate made). */
async function writeKvOnly(state: MaintenanceSetting): Promise<void> {
  await kv.put(MAINTENANCE_KV_KEY, JSON.stringify(state));
}

/** A fresh client IP, so `RL_AUTH` never carries over between tests. */
function ip(): string {
  return `203.0.113.${Math.floor(Math.random() * 250) + 1}-${crypto.randomUUID()}`;
}

async function setMaintenance(state: MaintenanceSetting | null): Promise<void> {
  if (state) {
    await kv.put(MAINTENANCE_KV_KEY, JSON.stringify(state));
  } else {
    await kv.delete(MAINTENANCE_KV_KEY);
  }
  clearMaintenanceCache();
}

function fetchSite(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(`${ORIGIN}${path}`, init);
}

const nowS = (): number => Math.floor(Date.now() / 1000);

/** Signs up (password `PASSWORD`), verifies: the session cookie and email. */
const signedIn = (): Promise<{ cookie: string; email: string }> =>
  signedUp({ password: PASSWORD });

afterEach(async () => {
  await setMaintenance(null);
});

describe("maintenance state", () => {
  it("parses the KV value and ignores a malformed one", () => {
    expect(
      parseMaintenanceSetting(
        JSON.stringify({ bypassVersion: 3, enabled: true, message: "x" })
      )
    ).toEqual({ bypassVersion: 3, enabled: true, message: "x" });
    expect(parseMaintenanceSetting(null)).toBeNull();
    expect(parseMaintenanceSetting("{nope")).toBeNull();
    expect(
      parseMaintenanceSetting(JSON.stringify({ enabled: "yes" }))
    ).toBeNull();
    expect(
      parseMaintenanceSetting(
        JSON.stringify({ bypassVersion: 1, enabled: true, until: "soon" })
      )
    ).toBeNull();
  });

  it("answers Retry-After with the seconds until `until`, else 600", () => {
    const now = Date.parse("2026-10-01T10:00:00Z");
    const base = { bypassVersion: 1, enabled: true };
    expect(retryAfterSeconds(base, now)).toBe(600);
    expect(
      retryAfterSeconds({ ...base, until: "2026-10-01T10:30:00Z" }, now)
    ).toBe(1800);
    expect(
      retryAfterSeconds({ ...base, until: "2026-10-01T09:00:00Z" }, now)
    ).toBe(600);
  });
});

describe("maintenance mode", () => {
  it("is off without a KV value", async () => {
    const response = await fetchSite("/");
    expect(response.status).toBe(200);
    await response.body?.cancel();
  });

  it("answers every page with the 503 page in the request's language", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });

    const nl = await fetchSite("/gestures");
    expect(nl.status).toBe(503);
    expect(nl.headers.get("retry-after")).toBe("600");
    expect(nl.headers.get("cache-control")).toBe("no-store");
    expect(nl.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(nl.headers.get("x-frame-options")).toBe("DENY");
    expect(nl.headers.get("content-security-policy")).toContain(
      "default-src 'self'"
    );
    const nlHtml = await nl.text();
    expect(nlHtml).toContain('<html lang="nl"');
    expect(nlHtml).toContain("We zijn zo terug");
    expect(nlHtml).not.toContain("<script");

    const en = await fetchSite("/", {
      headers: { "accept-language": "en-GB,en;q=0.9" },
    });
    expect(en.status).toBe(503);
    const enHtml = await en.text();
    expect(enHtml).toContain('<html lang="en"');
    expect(enHtml).toContain("back soon");

    const fr = await fetchSite("/sign-up", {
      headers: { "accept-language": "fr-BE" },
    });
    expect(fr.status).toBe(503);
    expect(await fr.text()).toContain('<html lang="fr"');

    // The `locale` cookie wins over Accept-Language, as on the site.
    const cookie = await fetchSite("/", {
      headers: { "accept-language": "fr-BE", cookie: "locale=en" },
    });
    expect(await cookie.text()).toContain('<html lang="en"');
  });

  it("shows the message and the expected end, and sets Retry-After from it", async () => {
    const until = new Date(Date.now() + HOUR_S * 1000).toISOString();
    await setMaintenance({
      bypassVersion: 1,
      enabled: true,
      message: "Nieuwe <video's> komen eraan",
      until,
    });
    const response = await fetchSite("/");
    expect(response.status).toBe(503);
    const retryAfter = Number(response.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(HOUR_S - 10);
    expect(retryAfter).toBeLessThanOrEqual(HOUR_S);
    const html = await response.text();
    // Escaped: KV text is never markup.
    expect(html).toContain("Nieuwe &lt;video&#39;s&gt; komen eraan");
    expect(html).toContain("<time");
  });

  it("answers /api with a JSON 503", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const response = await fetchSite("/api/rpc/gestures/categories", {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({
      code: "MAINTENANCE",
      until: null,
    });
  });

  it("lets the exempt paths through", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const health = await fetchSite("/api/health");
    expect(health.status).toBe(200);
    await health.body?.cancel();
    for (const path of [
      "/api/webhooks/mollie",
      "/webhooks/mollie",
      "/api/webhooks/mux",
      "/.well-known/nothing-here",
      "/api/maintenance/bypass",
      "/api/auth/sign-out",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one path at a time.
      const response = await fetchSite(path, {
        headers: { "cf-connecting-ip": ip(), origin: ORIGIN },
        method: "POST",
      });
      expect(response.status, path).not.toBe(503);
      await response.body?.cancel();
    }
  });

  it("serves the sign-in page, so an admin can sign in", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const response = await fetchSite("/sign-in");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("</html>");
  });

  it("answers HEAD with an empty 503", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const response = await fetchSite("/", { method: "HEAD" });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.text()).toBe("");
  });

  it("gates traversal out of an exempt prefix", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    for (const path of [
      "/.well-known/../gestures",
      "/.well-known/%2e%2e/gestures",
      "/api/webhooks/%2e%2e/%2e%2e/gestures",
      "/api/auth/../../gestures",
      "/sign-in/../account",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one path at a time.
      const response = await fetchSite(path);
      expect(response.status, path).toBe(503);
      await response.body?.cancel();
    }
  });

  it("does not exempt look-alike paths", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    for (const path of [
      "/api/healthz",
      "/api/webhooksx",
      "/webhooks/molliex",
      "/webhooks/mollie/x",
      "/webhooks",
      "/.well-knownx",
      "/api/authx",
      "/sign-in-x",
      "/sign-in/extra",
      "/sign-up",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one path at a time.
      const response = await fetchSite(path);
      expect(response.status, path).toBe(503);
      await response.body?.cancel();
    }
  });

  it("refuses a forged, expired or old-version bypass cookie", async () => {
    await setMaintenance({ bypassVersion: 7, enabled: true });
    const valid = await signBypassCookie(SECRET, 7, nowS());
    const [exp] = valid.split(".");
    const cookies = [
      // Forged: a signature from another secret.
      await signBypassCookie(
        "another-secret-at-least-32-characters!",
        7,
        nowS()
      ),
      // Tampered: a later expiry with the old signature.
      `${Number(exp) + HOUR_S}.${valid.split(".")[1]}`,
      // Expired: signed 13 h ago (valid for 12 h).
      await signBypassCookie(SECRET, 7, nowS() - 13 * HOUR_S),
      // An earlier maintenance window's cookie.
      await signBypassCookie(SECRET, 6, nowS()),
      "garbage",
      "",
    ];
    for (const value of cookies) {
      // biome-ignore lint/performance/noAwaitInLoops: one cookie at a time.
      const response = await fetchSite("/", {
        headers: { cookie: `${BYPASS_COOKIE}=${value}` },
      });
      expect(response.status, value).toBe(503);
      await response.body?.cancel();
    }
  });

  it("checks a bypass cookie against a fresh KV read, not the isolate cache", async () => {
    await setMaintenance({ bypassVersion: 7, enabled: true });
    // Primes this isolate's 30 s cache with version 7.
    const primed = await fetchSite("/");
    expect(primed.status).toBe(503);
    await primed.body?.cancel();
    // Another isolate ended the window (version 8) and a new one began.
    await writeKvOnly({ bypassVersion: 8, enabled: true });
    const current = await signBypassCookie(SECRET, 8, nowS());
    const passed = await fetchSite("/", {
      headers: { cookie: `${BYPASS_COOKIE}=${current}` },
    });
    expect(passed.status).toBe(200);
    await passed.body?.cancel();
    const stale = await signBypassCookie(SECRET, 7, nowS());
    const blocked = await fetchSite("/", {
      headers: { cookie: `${BYPASS_COOKIE}=${stale}` },
    });
    expect(blocked.status).toBe(503);
    await blocked.body?.cancel();
  });

  it("lets a valid bypass cookie through", async () => {
    await setMaintenance({ bypassVersion: 7, enabled: true });
    const value = await signBypassCookie(SECRET, 7, nowS());
    const response = await fetchSite("/", {
      headers: { cookie: `theme=dark; ${BYPASS_COOKIE}=${value}` },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("</html>");
  });
});

describe("POST /api/maintenance/bypass", () => {
  let admin = "";
  let adminEmail = "";
  let member = "";

  beforeAll(async () => {
    const adminUser = await signedIn();
    await setRole(adminUser.email, "admin");
    admin = adminUser.cookie;
    adminEmail = adminUser.email;
    member = (await signedIn()).cookie;
  });

  async function setRole(email: string, role: "admin" | "user"): Promise<void> {
    await db
      .prepare("UPDATE user SET role = ? WHERE email = ?")
      .bind(role, email)
      .run();
  }

  /** A same-origin POST from its own IP (unless the test passes one). */
  function bypass(headers: Record<string, string> = {}): Promise<Response> {
    return fetchSite("/api/maintenance/bypass", {
      headers: { "cf-connecting-ip": ip(), origin: ORIGIN, ...headers },
      method: "POST",
    });
  }

  it("refuses anonymous and non-admin callers", async () => {
    await setMaintenance({ bypassVersion: 2, enabled: true });
    const anonymous = await bypass();
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.getSetCookie()).toEqual([]);
    const notAdmin = await bypass({ cookie: member });
    expect(notAdmin.status).toBe(403);
    expect(notAdmin.headers.getSetCookie()).toEqual([]);
  });

  it("refuses a cross-site request (CSRF)", async () => {
    await setMaintenance({ bypassVersion: 2, enabled: true });
    const foreign = await bypass({
      cookie: admin,
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.getSetCookie()).toEqual([]);
  });

  it("only takes POST", async () => {
    const response = await fetchSite("/api/maintenance/bypass", {
      headers: { cookie: admin },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("gives an admin a 12 h cookie that passes the gate", async () => {
    await setMaintenance({ bypassVersion: 2, enabled: true });
    const response = await bypass({ cookie: admin });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [setCookie] = response.headers.getSetCookie();
    expect(setCookie).toMatch(COOKIE_ATTRS);
    const value = setCookie?.split(";")[0] ?? "";
    expect(value.startsWith(`${BYPASS_COOKIE}=`)).toBe(true);
    const { expiresAt } = (await response.json()) as { expiresAt: string };
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(
      11.9 * HOUR_S * 1000
    );

    const page = await fetchSite("/", { headers: { cookie: value } });
    expect(page.status).toBe(200);
    await page.body?.cancel();

    // Turning maintenance off starts a new bypassVersion (the CLI), which
    // voids the cookie for the next window.
    await setMaintenance({ bypassVersion: 3, enabled: true });
    const later = await fetchSite("/", { headers: { cookie: value } });
    expect(later.status).toBe(503);
    await later.body?.cancel();
  });

  it("signs with a fresh KV read, not the isolate cache", async () => {
    await setMaintenance({ bypassVersion: 4, enabled: true });
    const primed = await fetchSite("/");
    expect(primed.status).toBe(503);
    await primed.body?.cancel();
    await writeKvOnly({ bypassVersion: 5, enabled: true });
    const response = await bypass({ cookie: admin });
    expect(response.status).toBe(200);
    const value = response.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const page = await fetchSite("/", { headers: { cookie: value } });
    expect(page.status).toBe(200);
    await page.body?.cancel();
  });

  it("refuses an admin who was demoted after signing in", async () => {
    const demoted = await signedIn();
    await setMaintenance({ bypassVersion: 2, enabled: true });
    await setRole(demoted.email, "admin");
    expect((await bypass({ cookie: demoted.cookie })).status).toBe(200);
    await setRole(demoted.email, "user");
    const response = await bypass({ cookie: demoted.cookie });
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("is rate-limited per IP (RL_AUTH), after the origin check", async () => {
    const address = ip();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one request at a time.
      const response = await bypass({ "cf-connecting-ip": address });
      statuses.push(response.status);
      await response.body?.cancel();
    }
    // The tests run RL_AUTH at 5/60 s.
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    const limited = await bypass({ "cf-connecting-ip": address });
    expect(limited.headers.get("retry-after")).toBe("60");
    // A foreign request is refused before it counts.
    const foreign = await bypass({
      "cf-connecting-ip": ip(),
      origin: "https://evil.example",
    });
    expect(foreign.status).toBe(403);
  });

  it("lets an admin sign in during maintenance, bypass, and use the site", async () => {
    await setMaintenance({ bypassVersion: 9, enabled: true });
    const address = ip();
    const signIn = await fetchSite("/api/auth/sign-in/email", {
      body: JSON.stringify({ email: adminEmail, password: PASSWORD }),
      headers: {
        "cf-connecting-ip": address,
        "content-type": "application/json",
        origin: ORIGIN,
      },
      method: "POST",
    });
    expect(signIn.status).toBe(200);
    const session = signIn.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    // Signed in is not enough: the rest of the site is still closed.
    const closed = await fetchSite("/account", {
      headers: { cookie: session },
    });
    expect(closed.status).toBe(503);
    await closed.body?.cancel();

    const issued = await bypass({ cookie: session });
    expect(issued.status).toBe(200);
    const bypassCookie = issued.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const account = await fetchSite("/account", {
      headers: { cookie: `${session}; ${bypassCookie}` },
    });
    expect(account.status).toBe(200);
    await account.body?.cancel();
  });
});

/*
 * During a window `/api/auth/*` serves only what an existing admin needs
 * to sign in (`AUTH_SIGN_IN_ROUTES`), through a sign-in-only Better Auth:
 * no sign-up, no reset, no account change, and no email to an address
 * without an account.
 */
describe("/api/auth during maintenance", () => {
  const ALLOWED: [method: string, path: string][] = [
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/sign-in/social"],
    ["GET", "/api/auth/callback/google"],
    ["POST", "/api/auth/callback/apple"],
    ["POST", "/api/auth/email-otp/send-verification-otp"],
    ["POST", "/api/auth/sign-in/email-otp"],
    ["POST", "/api/auth/sign-in/magic-link"],
    ["GET", "/api/auth/magic-link/verify"],
    ["GET", "/api/auth/passkey/generate-authenticate-options"],
    ["POST", "/api/auth/passkey/verify-authentication"],
    ["GET", "/api/auth/get-session"],
    ["POST", "/api/auth/get-session"],
    ["POST", "/api/auth/sign-out"],
  ];
  const BLOCKED: [method: string, path: string][] = [
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/request-password-reset"],
    ["POST", "/api/auth/reset-password"],
    ["GET", "/api/auth/reset-password/some-token"],
    ["GET", "/api/auth/verify-email?token=x"],
    ["POST", "/api/auth/send-verification-email"],
    ["POST", "/api/auth/email-otp/request-password-reset"],
    ["POST", "/api/auth/forget-password/email-otp"],
    ["POST", "/api/auth/email-otp/reset-password"],
    ["POST", "/api/auth/email-otp/verify-email"],
    ["POST", "/api/auth/email-otp/check-verification-otp"],
    ["POST", "/api/auth/change-password"],
    ["POST", "/api/auth/change-email"],
    ["POST", "/api/auth/update-user"],
    ["POST", "/api/auth/link-social"],
    ["POST", "/api/auth/unlink-account"],
    ["GET", "/api/auth/list-accounts"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/revoke-session"],
    ["POST", "/api/auth/revoke-sessions"],
    ["POST", "/api/auth/revoke-other-sessions"],
    ["GET", "/api/auth/passkey/generate-register-options"],
    ["POST", "/api/auth/passkey/verify-registration"],
    ["POST", "/api/auth/passkey/delete-passkey"],
    ["POST", "/api/auth/passkey/update-passkey"],
    ["GET", "/api/auth/passkey/list-user-passkeys"],
    ["POST", "/api/auth/admin/set-role"],
    ["GET", "/api/auth/expo-authorization-proxy"],
    ["GET", "/api/auth/ok"],
    // The right path with the wrong method, or a longer path.
    ["GET", "/api/auth/sign-in/email"],
    ["GET", "/api/auth/sign-out"],
    ["POST", "/api/auth/magic-link/verify"],
    ["POST", "/api/auth/sign-in/email/"],
    ["GET", "/api/auth/callback/google/extra"],
    ["GET", "/api/auth/callback/"],
  ];

  let adminEmail = "";

  beforeAll(async () => {
    adminEmail = (await signedIn()).email;
    await db
      .prepare("UPDATE user SET role = 'admin' WHERE email = ?")
      .bind(adminEmail)
      .run();
  });

  function authCall(
    method: string,
    path: string,
    {
      body,
      headers = {},
    }: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    return fetchSite(path, {
      body:
        method === "GET"
          ? undefined
          : JSON.stringify(body === undefined ? {} : body),
      headers: {
        "cf-connecting-ip": ip(),
        "content-type": "application/json",
        origin: ORIGIN,
        ...headers,
      },
      method,
      redirect: "manual",
    });
  }

  /** An email code to the admin: proves the mailbox works, and when. */
  async function adminCode(): Promise<string> {
    const seen = new Set((await mailTo(adminEmail)).map(({ text }) => text));
    const sent = await authCall(
      "POST",
      "/api/auth/email-otp/send-verification-otp",
      { body: { email: adminEmail, type: "sign-in" } }
    );
    expect(sent.status).toBe(200);
    const [message] = await waitForMail(adminEmail, {
      match: ({ text }) => OTP_CODE.test(text) && !seen.has(text),
    });
    return message?.text.match(OTP_CODE)?.[0] ?? "";
  }

  it("lets each sign-in route through", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    for (const [method, path] of ALLOWED) {
      // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
      const response = await authCall(method, path);
      expect(response.status, `${method} ${path}`).not.toBe(503);
      await response.body?.cancel();
    }
  });

  it("answers every other auth route with the JSON 503", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    for (const [method, path] of BLOCKED) {
      // biome-ignore lint/performance/noAwaitInLoops: one route at a time.
      const response = await authCall(method, path);
      expect(response.status, `${method} ${path}`).toBe(503);
      expect(await response.json(), `${method} ${path}`).toEqual({
        code: "MAINTENANCE",
        until: null,
      });
    }
  });

  it("tests every allowed route (the list and this test agree)", () => {
    const tested = ALLOWED.map(([method, path]) =>
      `${method} ${path}`.replace(PROVIDER_SEGMENT, "/callback/:provider")
    );
    expect([...AUTH_SIGN_IN_ROUTES].sort()).toEqual(tested.sort());
  });

  it("creates no user and sends no email for a sign-up, a reset or a stranger's code", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const stranger = `${crypto.randomUUID()}@smog.test`;
    const requests: [string, unknown][] = [
      [
        "/api/auth/sign-up/email",
        { email: stranger, name: "S", password: PASSWORD },
      ],
      ["/api/auth/request-password-reset", { email: adminEmail }],
      ["/api/auth/email-otp/request-password-reset", { email: adminEmail }],
      [
        "/api/auth/email-otp/send-verification-otp",
        { email: stranger, type: "sign-in" },
      ],
      ["/api/auth/sign-in/magic-link", { callbackURL: "/", email: stranger }],
    ];
    const before = (await mailTo(adminEmail)).length;
    for (const [path, body] of requests) {
      // biome-ignore lint/performance/noAwaitInLoops: one request at a time.
      const response = await authCall("POST", path, { body });
      await response.body?.cancel();
    }
    // A code to the admin lands after them: had any of them sent, it
    // would have been mailed by now too.
    await adminCode();
    expect(await mailTo(stranger)).toEqual([]);
    const adminMail = await mailTo(adminEmail);
    expect(adminMail).toHaveLength(before + 1);
    const users = await db
      .prepare("SELECT count(*) AS n FROM user WHERE email = ?")
      .bind(stranger)
      .first<{ n: number }>();
    expect(users?.n).toBe(0);
  });

  it("sends only sign-in codes", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const response = await authCall(
      "POST",
      "/api/auth/email-otp/send-verification-otp",
      { body: { email: adminEmail, type: "forget-password" } }
    );
    expect(response.status).toBe(403);
    await response.body?.cancel();
  });

  it("an admin signs in with an email code", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const otp = await adminCode();
    const response = await authCall("POST", "/api/auth/sign-in/email-otp", {
      body: { email: adminEmail, otp },
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("; ")).toContain(
      "session_token="
    );
  });

  it("a code for an unknown address signs nobody up", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const stranger = `${crypto.randomUUID()}@smog.test`;
    const response = await authCall("POST", "/api/auth/sign-in/email-otp", {
      body: { email: stranger, otp: "123456" },
    });
    expect(response.status).toBe(400);
    const users = await db
      .prepare("SELECT count(*) AS n FROM user WHERE email = ?")
      .bind(stranger)
      .first<{ n: number }>();
    expect(users?.n).toBe(0);
  });

  it("a valid bypass cookie gets the whole of /api/auth", async () => {
    await setMaintenance({ bypassVersion: 3, enabled: true });
    const value = await signBypassCookie(SECRET, 3, nowS());
    const response = await authCall("POST", "/api/auth/sign-up/email", {
      body: {
        email: `${crypto.randomUUID()}@smog.test`,
        name: "B",
        password: PASSWORD,
      },
      headers: { cookie: `${BYPASS_COOKIE}=${value}` },
    });
    expect(response.status).toBe(200);
    await response.body?.cancel();
  });

  it("lets the analytics relay through (it only forwards)", async () => {
    await setMaintenance({ bypassVersion: 1, enabled: true });
    const response = await fetchSite("/api/analytics", {
      body: "{}",
      headers: {
        "cf-connecting-ip": ip(),
        "content-type": "application/json",
        origin: ORIGIN,
      },
      method: "POST",
    });
    expect(response.status).not.toBe(503);
    await response.body?.cancel();
  });
});

describe("bypassCookieHeader", () => {
  it("is Secure outside dev only", () => {
    expect(bypassCookieHeader("v", "dev")).toBe(
      `${BYPASS_COOKIE}=v; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax`
    );
    for (const environment of ["staging", "production"] as const) {
      expect(bypassCookieHeader("v", environment)).toBe(
        `${BYPASS_COOKIE}=v; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`
      );
    }
  });
});

describe("the maintenance page", () => {
  it("renders the theme cookie's theme and follows the system otherwise", () => {
    const state = { bypassVersion: 1, enabled: true };
    const now = Date.now();
    expect(
      renderMaintenancePage({ locale: "nl", now, state, theme: "dark" })
    ).toContain('<html lang="nl" class="dark">');
    expect(
      renderMaintenancePage({ locale: "nl", now, state, theme: "system" })
    ).toContain("prefers-color-scheme: dark");
  });
});
