// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "@/payload.config";

/**
 * Payload's **mounted REST API**, driven the way an attacker reaches it.
 *
 * `app/(payload)/api/[...slug]/route.ts` mounts the whole REST API, and closing
 * enumeration only on the site's own `/auth/*` endpoints left the site as
 * deployed still leaking on two of Payload's. Reproduced against a running dev
 * server before anything was changed:
 *
 * ```
 * POST /api/users       {fresh}    -> 201 {"doc":{...}}
 * POST /api/users       {existing} -> 400 "A user with the given email is already registered."
 * POST /api/users/login {locked}   -> 401 "This user is locked due to having too many failed login attempts."
 * POST /api/users/login {unknown}  -> 401 "The email or password provided is incorrect."
 * ```
 *
 * This file is the regression test for both closures. It goes through
 * `handleEndpoints` rather than calling a handler, because half of what is
 * being asserted is *routing*: that the collection endpoint declared on
 * `Users` really does shadow the built-in `POST /login`, which is a property
 * of `sanitize.js` and `handleEndpoints`, not of any handler.
 */
describe("the mounted REST API", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const SITE = "http://localhost:3003";
  const PASSWORD = "rest-int-password-1234";
  const WRONG = "rest-int-wrong-password";

  const unique = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.test`;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  const postJson = (path: string, body: unknown) =>
    handleEndpoints({
      config,
      request: new Request(`${SITE}${path}`, {
        body: JSON.stringify(body),
        headers: new Headers({ "Content-Type": "application/json" }),
        method: "POST",
      }),
    });

  /** Everything a client can see, so "both failed" is not good enough. */
  const snapshot = async (response: Response) => ({
    body: await response.text(),
    headers: [...response.headers.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    ),
    status: response.status,
  });

  const createUser = async (prefix: string) => {
    const email = unique(prefix);

    await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    });

    return email;
  };

  /** Locks an account without paying the endpoint's timing floor five times. */
  const lockOut = async (email: string) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await payload
        .login({ collection: "users", data: { email, password: WRONG } })
        .catch(() => null);
    }

    const { docs } = await payload.find({
      collection: "users",
      overrideAccess: true,
      showHiddenFields: true,
      where: { email: { equals: email } },
    });

    const lockUntil = docs[0]?.lockUntil as string | undefined;

    if (
      lockUntil === undefined ||
      new Date(lockUntil).getTime() <= Date.now()
    ) {
      throw new Error(`${email} did not lock after five failed sign-ins`);
    }
  };

  describe("POST /api/users", () => {
    it("refuses an anonymous registration", async () => {
      const response = await postJson("/api/users", {
        email: unique("rest-fresh"),
        password: PASSWORD,
      });

      expect(response.status).toBe(403);
    });

    it("answers a registered address exactly as it answers a free one", async () => {
      const taken = await createUser("rest-taken");

      const onTaken = await postJson("/api/users", {
        email: taken,
        password: PASSWORD,
      });
      const onFree = await postJson("/api/users", {
        email: unique("rest-free"),
        password: PASSWORD,
      });

      /*
       * This is the whole point of closing `access.create`. Before it, these
       * two differed by 201 vs 400 and by a sentence naming the reason — a
       * single unauthenticated request that answers "is this address
       * registered".
       */
      expect(await snapshot(onFree)).toEqual(await snapshot(onTaken));
    });

    it("creates nothing while refusing", async () => {
      const email = unique("rest-not-created");

      await postJson("/api/users", { email, password: PASSWORD });

      const { docs } = await payload.find({
        collection: "users",
        overrideAccess: true,
        where: { email: { equals: email } },
      });

      expect(docs).toHaveLength(0);
    });

    it("still lets the site's own sign-up register somebody", async () => {
      const email = unique("rest-signup");

      const response = await handleEndpoints({
        config,
        request: new Request(`${SITE}/api/auth/sign-up`, {
          body: new URLSearchParams({
            email,
            locale: "nl",
            password: PASSWORD,
          }).toString(),
          headers: new Headers({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
          method: "POST",
        }),
      });

      expect(response.status).toBe(303);

      const { docs } = await payload.find({
        collection: "users",
        overrideAccess: true,
        where: { email: { equals: email } },
      });

      expect(docs).toHaveLength(1);
      expect(docs[0]?.role).toBe("user");
    });
  });

  describe("POST /api/users/login", () => {
    it("answers a locked account exactly as it answers an unknown address", async () => {
      const locked = await createUser("rest-locked");

      await lockOut(locked);

      const onLocked = await postJson("/api/users/login", {
        email: locked,
        password: WRONG,
      });
      const onUnknown = await postJson("/api/users/login", {
        email: unique("rest-unknown"),
        password: WRONG,
      });

      expect(await snapshot(onUnknown)).toEqual(await snapshot(onLocked));
      expect(onLocked.status).toBe(401);
    });

    it("answers a locked account holding the CORRECT password identically too", async () => {
      const locked = await createUser("rest-locked-correct");

      await lockOut(locked);

      const onLocked = await postJson("/api/users/login", {
        email: locked,
        password: PASSWORD,
      });
      const onUnknown = await postJson("/api/users/login", {
        email: unique("rest-unknown-2"),
        password: PASSWORD,
      });

      expect(await snapshot(onUnknown)).toEqual(await snapshot(onLocked));
    });

    it("never says the word locked", async () => {
      const locked = await createUser("rest-locked-word");

      await lockOut(locked);

      const response = await postJson("/api/users/login", {
        email: locked,
        password: PASSWORD,
      });

      expect(await response.text()).not.toContain("locked");
    });

    /**
     * The admin panel consumes this response. If the shadow got the success
     * shape wrong, `/admin` would stop working — and no other test in this
     * suite would notice, because nothing else reads `POST /api/users/login`.
     */
    it("still signs a real account in, with the response the admin panel reads", async () => {
      const email = await createUser("rest-admin-login");

      const response = await postJson("/api/users/login", {
        email,
        password: PASSWORD,
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        exp?: number;
        message?: string;
        token?: string;
        user?: { email?: string };
      };

      expect(body.message).toBe("Authentication Passed");
      expect(body.user?.email).toBe(email);
      expect(typeof body.token).toBe("string");
      expect(typeof body.exp).toBe("number");

      const cookie = response.headers.get("Set-Cookie") ?? "";

      expect(cookie).toContain("payload-token=");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("HttpOnly");
    });

    /**
     * **The admin panel does not post JSON.** Payload's own `Form` submits
     * `multipart/form-data` with the whole body in a single `_payload`
     * field, which `addDataAndFileToRequest` unpacks for its own endpoints
     * and which a shadowing endpoint has to unpack for itself. The first
     * version of the shadow read JSON and urlencoded only: every test in
     * this file passed, `curl -H 'Content-Type: application/json'` passed,
     * and signing in to `/admin` in a real browser answered "the email or
     * password provided is incorrect" for correct credentials. This is that
     * request.
     */
    it("signs in a request shaped the way the admin panel posts it", async () => {
      const email = await createUser("rest-multipart");
      const body = new FormData();

      body.set("_payload", JSON.stringify({ email, password: PASSWORD }));

      const response = await handleEndpoints({
        config,
        request: new Request(`${SITE}/api/users/login`, {
          body,
          method: "POST",
        }),
      });

      expect(response.status).toBe(200);

      const parsed = (await response.json()) as { user?: { email?: string } };

      expect(parsed.user?.email).toBe(email);
      expect(response.headers.get("Set-Cookie")).toContain("payload-token=");
    });

    it("issues a cookie that actually authenticates", async () => {
      const email = await createUser("rest-cookie-works");

      const response = await postJson("/api/users/login", {
        email,
        password: PASSWORD,
      });
      const cookie = (response.headers.get("Set-Cookie") ?? "").split(";")[0];

      const { user } = await payload.auth({
        headers: new Headers({ cookie: cookie ?? "" }),
      });

      expect(user?.email).toBe(email);
    });

    it("holds every refusal to the same floor as the site's sign-in", async () => {
      const started = Date.now();

      await postJson("/api/users/login", {
        email: unique("rest-timing"),
        password: WRONG,
      });

      expect(Date.now() - started).toBeGreaterThanOrEqual(500);
    });
  });
});
