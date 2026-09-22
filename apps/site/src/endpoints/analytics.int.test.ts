// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ANALYTICS_LIMIT } from "@/endpoints/analytics";
import config from "../payload.config";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, so
 * fixtures keyed on a fixed name collide with an earlier run's rows — and
 * `rate_limits.key` is UNIQUE, so a collision throws inside `beforeAll`, which
 * Vitest reports as *skipped* rather than failed.
 */
const RUN = crypto.randomUUID().slice(0, 8);

const SITE = "http://localhost:3003";
const PATH = "/api/analytics/track";
const PASSWORD = "analytics-int-password";
const IP_MAX = 254;
const HOUR = 60 * 60 * 1000;

/** A fresh `cf-connecting-ip` per test, so no two tests share a budget. */
function documentationIp(block: string): string {
  return `${block}.${Math.floor(Math.random() * IP_MAX) + 1}`;
}

/**
 * Puts a variable back the way it was, including back to *absent*.
 *
 * `process.env.X = undefined` leaves the string `"undefined"` behind, and
 * `vitest.config.mts` sets `isolate: false`, so every file this worker runs
 * afterwards shares this process. A leftover `OPENPANEL_CLIENT_SECRET` would
 * send a later file's events at a real vendor.
 */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];

    return;
  }

  process.env[name] = value;
}

/**
 * `POST /api/analytics/track`, driven through `handleEndpoints` against a real
 * database.
 *
 * `handleEndpoints` rather than the handler directly, for the reason
 * `sponsorships.int.test.ts` gives: half of what can go wrong is routing, and a
 * handler called with a hand-built `req` passes whatever path it is mounted at.
 * It also makes `Origin`, `cf-connecting-ip` and `Cookie` real headers rather
 * than properties somebody set — which matters more here than usual, because
 * three of the properties under test *are* about which header is believed.
 */
describe("the analytics relay", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const post = (
    body: unknown,
    options: {
      cookie?: string;
      forwardedFor?: string;
      ip?: string;
      origin?: null | string;
    } = {}
  ) => {
    const headers = new Headers({ "Content-Type": "application/json" });

    if (options.origin !== null) {
      headers.set("Origin", options.origin ?? SITE);
    }

    if (options.ip) {
      headers.set("cf-connecting-ip", options.ip);
    }

    if (options.forwardedFor) {
      headers.set("x-forwarded-for", options.forwardedFor);
    }

    if (options.cookie) {
      headers.set("Cookie", options.cookie);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}${PATH}`, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      }),
    });
  };

  /**
   * Consent rows in the order they were given, oldest first.
   *
   * `createdAt` is set explicitly and an hour apart rather than left to the
   * clock: two rows written back to back can land in the same millisecond, and
   * a `-createdAt` sort over a tie would decide the test rather than the
   * handler.
   */
  const recordConsents = async (
    user: number,
    grants: boolean[]
  ): Promise<void> => {
    for (const [index, analyticsConsent] of grants.entries()) {
      await payload.create({
        collection: "user-consents",
        data: {
          analyticsConsent,
          consentVersion: "1",
          createdAt: new Date(
            Date.now() - (grants.length - index) * HOUR
          ).toISOString(),
          user,
        },
        overrideAccess: true,
      });
    }
  };

  const trackEvent = (name = "gesture_viewed") => ({
    payload: { name, properties: {} },
    type: "track",
  });

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterAll(async () => {
    await payload.delete({
      collection: "rate-limits",
      overrideAccess: true,
      where: { key: { like: "analytics:" } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts an allowlisted event", async () => {
    const response = await post(trackEvent(), {
      ip: documentationIp("203.0.113"),
    });

    expect(response.status).toBe(202);
  });

  it("refuses an event that is not in the allowlist", async () => {
    const response = await post(
      { payload: { name: "password_entered", properties: {} }, type: "track" },
      { ip: documentationIp("203.0.113") }
    );

    expect(response.status).toBe(400);
  });

  it("refuses a payload shape it does not forward", async () => {
    const response = await post(
      { payload: { name: "gesture_viewed" }, type: "alias" },
      { ip: documentationIp("203.0.113") }
    );

    expect(response.status).toBe(400);
  });

  it("refuses a cross-site post", async () => {
    const response = await post(trackEvent(), {
      ip: documentationIp("203.0.113"),
      origin: "https://evil.example",
    });

    expect(response.status).toBe(403);
  });

  it("stops forwarding once the limit is spent", async () => {
    // The limiter is keyed on the edge-supplied address, so the test drives it
    // through the same header the Worker will see.
    const ip = documentationIp("203.0.113");
    const send = () => post(trackEvent(), { ip });

    for (let attempt = 0; attempt < ANALYTICS_LIMIT; attempt += 1) {
      expect((await send()).status).toBe(202);
    }

    const refusedResponse = await send();
    expect(refusedResponse.status).toBe(429);
    expect(refusedResponse.headers.get("Retry-After")).not.toBeNull();
  });

  it("does not let a client-supplied header buy a fresh budget", async () => {
    /*
     * The bypass this guards: `x-forwarded-for` is attacker-controlled, and a
     * limiter that keys on it counts every request as a new client. On
     * Cloudflare, `cf-connecting-ip` is set by the edge and is the only one of
     * the four that is not.
     */
    const ip = documentationIp("198.51.100");
    const send = (spoofed?: string) =>
      post(trackEvent(), { forwardedFor: spoofed, ip });

    for (let attempt = 0; attempt < ANALYTICS_LIMIT; attempt += 1) {
      await send();
    }

    expect((await send("10.0.0.1")).status).toBe(429);
  });

  it("forwards the credentials the browser never sees, and the visitor's address", async () => {
    /*
     * The whole reason the relay exists, asserted rather than assumed. The
     * request is intercepted at `fetch`, so nothing leaves the test process.
     */
    const ip = documentationIp("203.0.113");
    const before = {
      id: process.env.OPENPANEL_CLIENT_ID,
      secret: process.env.OPENPANEL_CLIENT_SECRET,
      url: process.env.OPENPANEL_API_URL,
    };
    const sent = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 202 }))
    );

    process.env.OPENPANEL_CLIENT_ID = `stub-id-${RUN}`;
    process.env.OPENPANEL_CLIENT_SECRET = `stub-secret-${RUN}`;
    process.env.OPENPANEL_API_URL = "https://analytics.invalid/api";
    vi.stubGlobal("fetch", sent);

    try {
      expect((await post(trackEvent(), { ip })).status).toBe(202);
    } finally {
      restoreEnv("OPENPANEL_CLIENT_ID", before.id);
      restoreEnv("OPENPANEL_CLIENT_SECRET", before.secret);
      restoreEnv("OPENPANEL_API_URL", before.url);
    }

    expect(sent).toHaveBeenCalledTimes(1);

    const [url, init] = sent.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(url).toBe("https://analytics.invalid/api/track");
    expect(headers.get("openpanel-client-secret")).toBe(`stub-secret-${RUN}`);
    expect(headers.get("x-client-ip")).toBe(ip);
    expect(JSON.parse(String(init.body))).toEqual(trackEvent());
  });

  it("accepts the event and forwards nothing when the vendor is not configured", async () => {
    /*
     * A site whose analytics vendor is unconfigured must still serve pages —
     * every local checkout and CI is in this state. `index.ts:163-166` answers
     * 202 and drops the event, and so does this.
     */
    const sent = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 202 }))
    );
    vi.stubGlobal("fetch", sent);

    const response = await post(trackEvent(), {
      ip: documentationIp("203.0.113"),
    });

    expect(response.status).toBe(202);
    expect(sent).not.toHaveBeenCalled();
  });

  it("refuses a signed-in visitor whose record says no", async () => {
    /*
     * The one thing the relay can check that the browser cannot: a session
     * whose account last told the *server* not to be tracked. `user-consents`
     * is append-only, so the newest row is what counts — the refusal is
     * recorded second here, after a grant, so a handler reading the oldest row
     * would let this through.
     */
    const email = `analytics-${RUN}-${crypto.randomUUID()}@example.test`;
    const user = await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    });

    await recordConsents(Number(user.id), [true, false]);

    const { token } = await payload.login({
      collection: "users",
      data: { email, password: PASSWORD },
    });

    const response = await post(trackEvent(), {
      cookie: `payload-token=${token}`,
      ip: documentationIp("203.0.113"),
    });

    expect(response.status).toBe(403);
  });

  it("accepts a signed-in visitor whose record says yes", async () => {
    const email = `analytics-${RUN}-${crypto.randomUUID()}@example.test`;
    const user = await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    });

    await recordConsents(Number(user.id), [false, true]);

    const { token } = await payload.login({
      collection: "users",
      data: { email, password: PASSWORD },
    });

    const response = await post(trackEvent(), {
      cookie: `payload-token=${token}`,
      ip: documentationIp("203.0.113"),
    });

    expect(response.status).toBe(202);
  });

  it("refuses nothing on the strength of a missing Origin", async () => {
    /*
     * `isTrustedOrigin` treats an absent `Origin` as trusted, deliberately:
     * native and server-to-server callers send none, and the native app is one
     * of this relay's clients. Asserted so that tightening it becomes a
     * decision rather than an accident.
     */
    const response = await post(trackEvent(), {
      ip: documentationIp("203.0.113"),
      origin: null,
    });

    expect(response.status).toBe(202);
  });
});
