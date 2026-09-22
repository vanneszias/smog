// @vitest-environment node
import { SignJWT } from "jose";
import { getPayload, handleEndpoints } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { createOAuthSession } from "@/auth/googleStrategy";
import { AUTH_FLOOR_MS } from "@/lib/authFlow";
import type { User } from "@/payload-types";
import config from "../payload.config";
import { mintExchangeCode } from "./mobileSession";

/**
 * `POST /api/mobile/session`, driven through `handleEndpoints` against a
 * real database — same reasoning as `oauth.int.test.ts` and
 * `auth.int.test.ts`: routing and Payload's own auth strategies are half of
 * what can go wrong here, and a handler called with a hand-built `req`
 * exercises neither.
 *
 * The eighth test — "survives two concurrent redemptions" — is the property
 * `takeClaim`'s unique index exists for, written the same way Stage 5's
 * "survives two concurrent deliveries of the same payment" is: `unique:
 * false` on the claims `key` field fails this one, and Stage 5's and Stage
 * 6's own concurrency tests through the same table with it, which is the
 * point of merging them into one mechanism. See the task report for that
 * mutation's output.
 *
 * The sixth — "refuses a session token presented as an exchange code" — is
 * the one that is easy to omit and expensive to omit: without the `purpose`
 * claim checked in `redeem`, a session token verifies as a perfectly good
 * exchange code, because both are JWTs signed over `payload.secret`. See the
 * task report for what removing that check does to this test.
 *
 * **That test presents a Google session token — `createOAuthSession`'s own
 * — and not a plain password one**, and the difference is load-bearing
 * rather than cosmetic. Payload's own `getFieldsToSign`
 * (`payload/dist/auth/getFieldsToSign.js`) signs a local-jwt session as
 * `{ id, collection, email, sid? }`: no `sub` claim at all, so it can never
 * satisfy `redeem`'s `typeof claims.sub === "string"` check whether or not
 * `purpose` is being checked, and a mutation that deletes the `purpose`
 * check would still pass a test written against it — the exact "could not
 * fail" shape this stage's assertions are checked against. A Google session
 * token, from the same `createOAuthSession` the callback and this endpoint
 * both call, carries `sub: String(user.id)` — see `auth/googleStrategy.ts`
 * — so it is a real, minted, HS256-over-`payload.secret` token that only
 * `purpose` stands between and a fresh session. Confirmed against the
 * removed check: see the task report.
 */
describe("POST /api/mobile/session", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let user: User;

  const SITE = "http://localhost:3003";
  const PASSWORD = "mobile-session-int-password";

  beforeAll(async () => {
    payload = await getPayload({ config });

    user = (await payload.create({
      collection: "users",
      data: {
        email: `mobile-session-${crypto.randomUUID()}@example.test`,
        password: PASSWORD,
        role: "user",
      },
    })) as User;
  });

  const post = (body: unknown) =>
    handleEndpoints({
      config,
      request: new Request(`${SITE}/api/mobile/session`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    });

  /** A token signed like an exchange code, but with whatever secret and claims a test wants. */
  const signWith = (
    secret: string,
    claims: Record<string, unknown>
  ): Promise<string> =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(secret));

  /** The exchange endpoint's success body, typed once for every test that reads it. */
  const sessionBody = async (
    response: Response
  ): Promise<{ token?: string; user?: { id?: number } }> =>
    (await response.json()) as { token?: string; user?: { id?: number } };

  it("exchanges a fresh code for a token", async () => {
    const code = await mintExchangeCode(payload, String(user.id));
    const response = await post({ code });

    expect(response.status).toBe(200);
    expect((await sessionBody(response)).token).toEqual(expect.any(String));
  });

  it("returns a token that actually authenticates", async () => {
    const code = await mintExchangeCode(payload, String(user.id));
    const { token } = await sessionBody(await post({ code }));

    const me = await handleEndpoints({
      config,
      request: new Request(`${SITE}/api/users/me`, {
        headers: { Authorization: `JWT ${token}` },
      }),
    });

    expect((await sessionBody(me)).user?.id).toBe(user.id);
  });

  it("refuses the same code twice", async () => {
    const code = await mintExchangeCode(payload, String(user.id));

    expect((await post({ code })).status).toBe(200);
    expect((await post({ code })).status).toBe(401);
  });

  it("refuses a code that has expired", async () => {
    const code = await mintExchangeCode(payload, String(user.id), {
      ttl: "-1s",
    });

    expect((await post({ code })).status).toBe(401);
  });

  it("refuses a code signed with a different secret", async () => {
    const code = await signWith("not-the-secret", {
      purpose: "mobile-exchange",
      sub: String(user.id),
    });

    expect((await post({ code })).status).toBe(401);
  });

  /**
   * The property `purpose` exists to guard. `createOAuthSession` mints this
   * exact session over the same secret, with a `sub` claim in the same
   * shape `mintExchangeCode` uses — the only thing standing between it and
   * a fresh session at this endpoint is `claims.purpose !== "mobile-exchange"`.
   * Without that check, a stolen two-hour Google session token trades for a
   * fresh one on demand. See the module doc for why this is a Google
   * session and not a password one.
   */
  it("refuses a session token presented as an exchange code", async () => {
    const { token } = await createOAuthSession({
      payload,
      providerId: "google",
      user,
    });

    expect((await post({ code: token })).status).toBe(401);
  });

  /**
   * Not load-bearing the same way — see the module doc: a password session
   * lacks `sub` entirely, so it is refused whether or not `purpose` is
   * checked — but worth asserting anyway, since it is the shape a caller is
   * actually most likely to try.
   */
  it("also refuses a plain password session presented as an exchange code", async () => {
    const { token } = await payload.login({
      collection: "users",
      data: { email: user.email, password: PASSWORD },
    });

    expect((await post({ code: token })).status).toBe(401);
  });

  it("answers the same bytes for every refusal", async () => {
    const expired = await post({
      code: await mintExchangeCode(payload, String(user.id), { ttl: "-1s" }),
    });
    const forged = await post({
      code: await signWith("not-the-secret", {
        purpose: "mobile-exchange",
        sub: String(user.id),
      }),
    });

    expect(await expired.text()).toBe(await forged.text());
  });

  it("survives two concurrent redemptions of one code", async () => {
    const code = await mintExchangeCode(payload, String(user.id));
    const [a, b] = await Promise.all([post({ code }), post({ code })]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it("takes at least the auth floor even for an obviously malformed code", async () => {
    const started = Date.now();

    await post({ code: "not-a-jwt" });

    expect(Date.now() - started).toBeGreaterThanOrEqual(AUTH_FLOOR_MS);
  });
});
