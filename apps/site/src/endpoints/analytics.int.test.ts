// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
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
const HOUR = 60 * 60 * 1000;
/** Rows per cleanup delete, under D1's cap of 100 bind parameters. */
const CLEANUP_BATCH = 50;
/** The last usable host in TEST-NET-3; running out is a fault, not a wrap. */
const IP_MAX = 254;

let allocated = 0;

/**
 * A `cf-connecting-ip` no other test in this file will be given.
 *
 * **This used to be `Math.random()` over 254 addresses, and that was the
 * defect.** `rateLimitKey` is `cf-connecting-ip` and nothing else — which is
 * the right design and is not what changed — so an address is a budget, and
 * two tests drawing the same number share one. Two of the tests below spend a
 * budget of 120 deliberately, so a collision with either turns some *other*
 * test's 202 into a 429. At ten tests over 254 values that is a few percent a
 * run: it passed ten consecutive CI runs and failed the eleventh, on
 * "refuses nothing on the strength of a missing Origin", with
 * `expected 429 to be 202`.
 *
 * Reproduced deterministically by pinning this function to one address, which
 * failed six of the eleven tests at once — the same assertion CI reported
 * among them. A counter cannot collide, and exhausting the block throws rather
 * than wrapping round to an address already spent.
 *
 * It is deliberately *not* the whole fix. `beforeEach` clears the namespace as
 * well, so that a test which forgets to pass an address — and so lands in the
 * shared `"unknown"` bucket — is still independent of everything that ran
 * before it. Unique addresses make the intent legible; the clear is what makes
 * the property hold whether or not the next person remembers.
 */
function freshClientIp(): string {
  allocated += 1;

  if (allocated > IP_MAX) {
    throw new Error(
      `This file has more tests than TEST-NET-3 has addresses (${IP_MAX}); allocate a second block rather than reusing one.`
    );
  }

  return `203.0.113.${allocated}`;
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

  /**
   * Every counter this file's namespace holds, gone.
   *
   * Batched, for the reason `lib/rateLimit.ts` records at length: a
   * `payload.delete` with a `where` emits one bind parameter per deleted
   * document into its trailing `payload_preferences` delete, and D1 refuses at
   * 100. The rows this file writes are bounded by its own test count — but
   * `.wrangler/state/vitest` is persisted and never cleared, so a run that
   * died before its cleanup leaves its rows behind under a different window
   * key, and enough interrupted runs would cross the cap in a `beforeEach`
   * that is supposed to be the thing making the suite reliable.
   */
  const clearCounters = async (): Promise<void> => {
    for (;;) {
      const { docs } = await payload.find({
        collection: "rate-limits",
        depth: 0,
        limit: CLEANUP_BATCH,
        overrideAccess: true,
        where: { key: { like: "analytics:" } },
      });

      if (docs.length === 0) {
        return;
      }

      await payload.delete({
        collection: "rate-limits",
        overrideAccess: true,
        where: { id: { in: docs.map((row) => row.id) } },
      });
    }
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  /**
   * **No test's result may depend on how many other tests ran first.**
   *
   * The relay's budget is per address per sixty-second window, and two tests
   * below spend one to the last request on purpose. Without this, a test that
   * shared an address with either — by a random collision, by forgetting to
   * pass one and landing in `"unknown"`, or by a leftover row from a run that
   * died — would read the *sum of what ran before it* instead of its own
   * subject, and would do so intermittently. See {@link freshClientIp}.
   */
  beforeEach(async () => {
    await clearCounters();
  });

  afterAll(clearCounters);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts an allowlisted event", async () => {
    const response = await post(trackEvent(), {
      ip: freshClientIp(),
    });

    expect(response.status).toBe(202);
  });

  it("refuses an event that is not in the allowlist", async () => {
    const response = await post(
      { payload: { name: "password_entered", properties: {} }, type: "track" },
      { ip: freshClientIp() }
    );

    expect(response.status).toBe(400);
  });

  it("refuses a payload shape it does not forward", async () => {
    const response = await post(
      { payload: { name: "gesture_viewed" }, type: "alias" },
      { ip: freshClientIp() }
    );

    expect(response.status).toBe(400);
  });

  it("refuses a cross-site post", async () => {
    const response = await post(trackEvent(), {
      ip: freshClientIp(),
      origin: "https://evil.example",
    });

    expect(response.status).toBe(403);
  });

  it("stops forwarding once the limit is spent", async () => {
    // The limiter is keyed on the edge-supplied address, so the test drives it
    // through the same header the Worker will see.
    const ip = freshClientIp();
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
    const ip = freshClientIp();
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
    const ip = freshClientIp();
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
      ip: freshClientIp(),
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
      ip: freshClientIp(),
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
      ip: freshClientIp(),
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
      ip: freshClientIp(),
      origin: null,
    });

    expect(response.status).toBe(202);
  });
});
