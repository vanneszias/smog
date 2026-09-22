// @vitest-environment node
import type { PayloadRequest } from "payload";
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSENT_VERSION, recordConsent } from "@/endpoints/consent";
import config from "../payload.config";

/**
 * `POST /api/consent`, driven through `handleEndpoints` against a real
 * database — the same harness `mobileAccount.int.test.ts` and
 * `favorites.int.test.ts` use, for the same reason: half of what can go
 * wrong here is routing and authentication, and neither is exercised by a
 * handler called with a hand-built `req`.
 *
 * `Authorization: JWT …` rather than a cookie, the same choice
 * `mobileAccount.int.test.ts` makes: Payload's own auth strategies resolve a
 * bearer token exactly as they resolve a cookie (`lib/session.ts`'s note that
 * "the bearer path belongs to the REST API, which is still mounted and
 * unaffected"), so this exercises the same `req.user` this handler reads
 * without needing a cookie jar.
 */
describe("the consent endpoint", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const SITE = "http://localhost:3003";
  const PASSWORD = "consent-int-password";
  const RUN = crypto.randomUUID();

  const memberIds: (number | string)[] = [];

  const unique = (prefix: string) =>
    `consent-${prefix}-${RUN}-${crypto.randomUUID()}@example.test`;

  const signIn = async (email: string) => {
    const { token } = await payload.login({
      collection: "users",
      data: { email, password: PASSWORD },
    });

    if (token === undefined) {
      throw new Error("login issued no token");
    }

    return token;
  };

  const createMember = async (prefix: string) => {
    const email = unique(prefix);
    const user = await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    });

    memberIds.push(user.id);

    return { id: user.id, token: await signIn(email) };
  };

  /** `Authorization: JWT …`, never a cookie — see the module doc comment. */
  const post = (
    path: string,
    body: unknown,
    init: { origin?: string; token?: string } = {}
  ) => {
    const headers = new Headers({ "Content-Type": "application/json" });

    if (init.token !== undefined) {
      headers.set("Authorization", `JWT ${init.token}`);
    }

    if (init.origin !== undefined) {
      headers.set("Origin", init.origin);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}/api${path}`, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      }),
    });
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  /**
   * Deletes the consent rows this file wrote before deleting the users they
   * point at, so nothing is left as an orphan for the run after this one —
   * `favorites.int.test.ts`'s note about the shared local D1 at
   * `.wrangler/state/vitest` never being cleared applies here just as much,
   * and this table is the one place in the app where an orphaned row cannot
   * be told apart from a real one by a later reader.
   */
  afterAll(async () => {
    if (memberIds.length > 0) {
      await payload.delete({
        collection: "user-consents",
        where: { user: { in: memberIds } },
      });
    }

    await payload.delete({
      collection: "users",
      where: { email: { like: `consent-${RUN}` } },
    });
  });

  it("records a refusal as a row, not as an absence", async () => {
    /*
     * Review Focus 2, and the reason this stage exists. The column is
     * `integer DEFAULT false NOT NULL`, so "no row" and "a row saying no" are
     * indistinguishable in SQL — and Stage 9 imports into this table. A
     * reconciler that only writes on `true` therefore records nothing for
     * everyone who declined, and the import cannot tell them from the people
     * who were never asked.
     */
    const member = await createMember("declined");

    const response = await post(
      "/consent",
      { analyticsConsent: false },
      { token: member.token }
    );

    expect(response.status).toBe(200);

    const rows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      where: { user: { equals: member.id } },
    });

    expect(rows.totalDocs).toBe(1);
    expect(rows.docs[0]?.analyticsConsent).toBe(false);
    expect(rows.docs[0]?.consentVersion).toBe(CONSENT_VERSION);
  });

  it("appends rather than amends when somebody changes their mind", async () => {
    // The collection denies `update` to everyone. A second decision is a
    // second row, and the history is the evidence.
    const member = await createMember("changed-mind");

    await post("/consent", { analyticsConsent: true }, { token: member.token });
    await post(
      "/consent",
      { analyticsConsent: false },
      { token: member.token }
    );

    const rows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      sort: "createdAt",
      where: { user: { equals: member.id } },
    });

    expect(rows.totalDocs).toBe(2);
    expect(rows.docs.map((row) => row.analyticsConsent)).toEqual([true, false]);
  });

  it("refuses a caller with no session", async () => {
    const response = await post("/consent", { analyticsConsent: true });

    expect(response.status).toBe(401);
  });

  it("refuses a cross-site post", async () => {
    const response = await post(
      "/consent",
      { analyticsConsent: true },
      { origin: "https://evil.example" }
    );

    expect(response.status).toBe(403);
  });

  it("records the account from the session, never one the body names", async () => {
    // The same guard Stage 8 added to the mobile account endpoints, for the
    // same reason: the body must not be able to name a victim.
    const owner = await createMember("consent-owner");
    const stranger = await createMember("consent-stranger");

    await post(
      "/consent",
      { analyticsConsent: true, user: owner.id, userId: owner.id },
      { token: stranger.token }
    );

    const ownerRows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      where: { user: { equals: owner.id } },
    });

    expect(ownerRows.totalDocs).toBe(0);
  });

  it("refuses a body whose analyticsConsent is not a boolean", async () => {
    const member = await createMember("bad-body");

    for (const analyticsConsent of ["true", 1, null, undefined]) {
      const response = await post(
        "/consent",
        { analyticsConsent },
        { token: member.token }
      );

      expect(response.status, JSON.stringify(analyticsConsent)).toBe(400);
    }

    const rows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      where: { user: { equals: member.id } },
    });

    expect(rows.totalDocs).toBe(0);
  });
});

/**
 * `recordConsent` itself, called directly rather than through the endpoint.
 *
 * `recordConsent` only ever reaches `req.payload.create`, so a bare
 * `{ payload }` is everything it needs — the same shape `auth.int.test.ts`
 * uses to call `decideSignUp` directly. The endpoint's own tests above prove
 * the HTTP layer (origin, session, body shape); this proves the writer
 * underneath it holds its contract on its own, independent of how it is
 * reached.
 */
describe("recordConsent", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let req: PayloadRequest;
  const email = `consent-direct-${crypto.randomUUID()}@example.test`;
  let userId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });
    req = { payload } as unknown as PayloadRequest;

    const user = await payload.create({
      collection: "users",
      data: { email, password: "consent-direct-password", role: "user" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await payload.delete({
      collection: "user-consents",
      where: { user: { equals: userId } },
    });
    // `equals`, not `like`: a single known email needs no pattern, and D1
    // refuses a `LIKE` whose pattern crosses its own complexity limit — a
    // full random UUID plus this prefix does, which `like: \`consent-${RUN}\``
    // above stays under only because it is shorter.
    await payload.delete({
      collection: "users",
      where: { email: { equals: email } },
    });
  });

  it("stamps the row with CONSENT_VERSION and the caller's fields", async () => {
    await recordConsent({
      analyticsConsent: true,
      ipAddress: "203.0.113.9",
      req,
      userAgent: "Mozilla/5.0 (direct test)",
      userId,
    });

    const rows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      where: { user: { equals: userId } },
    });

    expect(rows.totalDocs).toBe(1);
    expect(rows.docs[0]).toMatchObject({
      analyticsConsent: true,
      consentVersion: CONSENT_VERSION,
      ipAddress: "203.0.113.9",
      userAgent: "Mozilla/5.0 (direct test)",
    });
  });

  it("writes with a string userId too, since the id arrives as one over HTTP", async () => {
    await recordConsent({
      analyticsConsent: false,
      req,
      userId: String(userId),
    });

    const rows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      sort: "-createdAt",
      where: { user: { equals: userId } },
    });

    expect(rows.docs[0]?.analyticsConsent).toBe(false);
  });
});
