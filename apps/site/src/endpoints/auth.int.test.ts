// @vitest-environment node
import type { PayloadRequest } from "payload";
import {
  AuthenticationError,
  Forbidden,
  getPayload,
  handleEndpoints,
  LockedAuth,
  UnverifiedEmail,
  ValidationError,
} from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_FLOOR_MS, isCredentialFailure } from "@/lib/authFlow";
import { resolveSession } from "@/lib/session";
import config from "../payload.config";
import { decideSignUp } from "./auth";

/**
 * The auth endpoints, driven through `handleEndpoints` against a real
 * database.
 *
 * `handleEndpoints` rather than calling the handlers directly, because half
 * of what can go wrong here is routing: the path these are registered at has
 * to be the path `/api/auth/*` resolves to, and a handler tested in isolation
 * passes whatever it is mounted at. This is the same reasoning as
 * `tests/e2e/crawler.spec.ts`, one layer down.
 *
 * **The enumeration assertions compare whole responses, not status codes.**
 * A test that asserts "both fail" passes against the exact leak these
 * endpoints exist to close, because Payload fails both — with different
 * sentences.
 */
describe("auth endpoints", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  /**
   * A minimal stand-in for a real `PayloadRequest`, for calling
   * `decideSignUp` directly rather than through `handleEndpoints`.
   *
   * `decideSignUp` only ever reaches `req.payload.create`, so a bare
   * `{ payload }` is everything it needs — the same shape
   * `Users.escalation.int.test.ts` uses to call `payload.create` with a
   * forged `req.user`.
   */
  let req: PayloadRequest;

  const SITE = "http://localhost:3003";
  const PASSWORD = "endpoint-int-password";
  const WRONG = "endpoint-int-wrong-password";

  const unique = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.test`;

  beforeAll(async () => {
    payload = await getPayload({ config });
    req = { payload } as unknown as PayloadRequest;
  });

  const post = (
    path: string,
    fields: Record<string, string>,
    init: { cookie?: string; origin?: string } = {}
  ) => {
    const headers = new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    if (init.origin !== undefined) {
      headers.set("Origin", init.origin);
    }

    if (init.cookie !== undefined) {
      headers.set("Cookie", init.cookie);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}${path}`, {
        body: new URLSearchParams(fields).toString(),
        headers,
        method: "POST",
      }),
    });
  };

  const signIn = (
    email: string,
    password: string,
    init?: { cookie?: string; origin?: string }
  ) => post("/api/auth/sign-in", { email, locale: "nl", password }, init);

  /**
   * Everything about a response that a client can see.
   *
   * Headers are sorted so the comparison does not depend on emission order,
   * and `Set-Cookie` is included rather than stripped — its presence or
   * absence is exactly the kind of difference that would give the game away.
   */
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

  /**
   * Locks an account, without paying the endpoint's timing floor five times.
   *
   * It asserts the lock rather than assuming it. Without that, a change that
   * stopped accounts locking would leave the two tests below comparing one
   * wrong-password response against another — passing, and proving nothing
   * about `LockedAuth`, which is precisely a failure mode once found here.
   */
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
    const lockedUntilMs =
      lockUntil === undefined ? 0 : new Date(lockUntil).getTime();

    if (lockedUntilMs <= Date.now()) {
      // Thrown rather than asserted: a fixture that did not produce the state
      // it promises is a broken fixture, and it should say so from here
      // rather than leave a caller comparing two wrong-password responses and
      // calling it a `LockedAuth` test.
      throw new Error(`${email} did not lock after five failed sign-ins`);
    }
  };

  describe("sign-in", () => {
    it("signs a real account in and redirects to its locale", async () => {
      const email = await createUser("signin");
      const response = await signIn(email, PASSWORD);

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/nl");
    });

    it("scopes the session cookie to the whole site, not to one locale", async () => {
      /*
       * The cookie's scope, at the unit of the header itself. Every URL on
       * this site is locale-prefixed, so a cookie without `Path=/` applies to
       * the directory it was set from and disappears the moment the visitor
       * switches language — while passing every single-locale test there is.
       * `tests/e2e/auth.spec.ts` drives the same claim through a browser.
       */
      const email = await createUser("cookie-scope");
      const cookie = (await signIn(email, PASSWORD)).headers.get("Set-Cookie");

      expect(cookie).toContain("Path=/");
      expect(cookie).not.toContain("Path=/nl");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Secure");
    });

    it("issues a cookie that actually resolves back to the account", async () => {
      // "A cookie was set" and "you are signed in" are different claims, and
      // only the second one is the feature.
      const email = await createUser("cookie-works");
      const cookie = (await signIn(email, PASSWORD)).headers.get("Set-Cookie");
      const value = (cookie ?? "").split(";")[0];

      const user = await resolveSession(new Headers({ cookie: value }));

      expect(user?.email).toBe(email);
    });

    it("answers an unknown address and a wrong password identically", async () => {
      const email = await createUser("same-bytes");

      const unknown = await snapshot(await signIn(unique("nobody"), WRONG));
      const wrong = await snapshot(await signIn(email, WRONG));

      expect(wrong).toEqual(unknown);
      expect(unknown.status).toBe(303);
      expect(unknown.headers).toContainEqual([
        "location",
        "/nl/sign-in?error=invalid",
      ]);
    });

    it("answers a locked account exactly as it answers an unknown address", async () => {
      /*
       * **The assertion these endpoints exist for.** Payload throws
       * `LockedAuth` here — "This user is locked due to having too many failed
       * login attempts" — and an address that was never registered can never
       * lock, so that sentence is proof the account exists. It was measured
       * against a real database; `endpoints/auth.ts` flattens it.
       */
      const email = await createUser("locked");

      await lockOut(email);

      const locked = await snapshot(await signIn(email, WRONG));
      const unknown = await snapshot(await signIn(unique("nobody"), WRONG));

      expect(locked).toEqual(unknown);
    });

    it("answers a locked account holding the CORRECT password identically too", async () => {
      // The half that matters. A locked account given the right password is
      // the one case where Payload's answer is not "wrong password" in any
      // sense, so it is the case most likely to be let through.
      const email = await createUser("locked-correct");

      await lockOut(email);

      const locked = await snapshot(await signIn(email, PASSWORD));
      const unknown = await snapshot(await signIn(unique("nobody"), WRONG));

      expect(locked).toEqual(unknown);
      expect(locked.headers.map(([name]) => name)).not.toContain("set-cookie");
    });

    it("answers a missing password the same way, rather than with a field error", async () => {
      const email = await createUser("no-password");

      const blank = await snapshot(
        await post("/api/auth/sign-in", { email, locale: "nl", password: "" })
      );
      const unknown = await snapshot(await signIn(unique("nobody"), WRONG));

      expect(blank).toEqual(unknown);
    });

    it("holds every refusal for the same minimum time", async () => {
      /*
       * The other half of the leak, and the one flattening the body does not
       * touch: `checkLoginPermission` runs before `authenticateLocalStrategy`,
       * so an unknown address answers without touching PBKDF2 while a wrong
       * password on a live account pays 25,000 iterations. Measured on this
       * project's database, the two distributions did not overlap at all —
       * 10.5 ms against 76.7 ms medians — which is a one-request classifier.
       *
       * The floor is asserted with slack below it, because a test that pins
       * the exact wall-clock of a `setTimeout` is a flaky test.
       */
      const email = await createUser("timing");

      const startUnknown = Date.now();
      await signIn(unique("nobody"), WRONG);
      const unknownMs = Date.now() - startUnknown;

      const startWrong = Date.now();
      await signIn(email, WRONG);
      const wrongMs = Date.now() - startWrong;

      expect(unknownMs).toBeGreaterThanOrEqual(450);
      expect(wrongMs).toBeGreaterThanOrEqual(450);
    });

    it("refuses a cross-site post outright", async () => {
      const email = await createUser("csrf");
      const response = await signIn(email, PASSWORD, {
        origin: "https://evil.example",
      });

      expect(response.status).toBe(403);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });

    it("accepts a post from this site's own origin", async () => {
      const email = await createUser("same-origin");
      const response = await signIn(email, PASSWORD, { origin: SITE });

      expect(response.status).toBe(303);
      expect(response.headers.get("Set-Cookie")).toContain("payload-token=");
    });

    it("sends the visitor back to the locale they submitted from", async () => {
      const email = await createUser("locale");
      const response = await post("/api/auth/sign-in", {
        email,
        locale: "fr",
        password: PASSWORD,
      });

      expect(response.headers.get("Location")).toBe("/fr");
    });

    it("clamps an unknown locale rather than redirecting wherever it says", async () => {
      const email = await createUser("open-redirect");
      const response = await post("/api/auth/sign-in", {
        email,
        locale: "//evil.example",
        password: PASSWORD,
      });

      expect(response.headers.get("Location")).toBe("/nl");
    });
  });

  describe("sign-up", () => {
    const signUp = (
      email: string,
      password: string,
      extra: Record<string, string> = {}
    ) => post("/api/auth/sign-up", { email, locale: "nl", password, ...extra });

    it("creates an account and sends the visitor to sign in", async () => {
      const email = unique("fresh");
      const response = await signUp(email, PASSWORD);

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(
        "/nl/sign-in?notice=registered"
      );

      const found = await payload.find({
        collection: "users",
        where: { email: { equals: email } },
      });

      expect(found.totalDocs).toBe(1);
    });

    it("answers a taken address exactly as it answers a fresh one", async () => {
      /*
       * The no-enumeration rule for sign-up. Sign-up sends no verification
       * mail, so the usual "we have sent you a link" landing is not
       * available — which is why sign-up does not sign you in: a branch that
       * could not issue a session would be visibly different no matter how
       * carefully the bytes matched.
       */
      const taken = await createUser("taken");

      const duplicate = await snapshot(await signUp(taken, PASSWORD));
      const fresh = await snapshot(await signUp(unique("fresh"), PASSWORD));

      expect(duplicate).toEqual(fresh);
    });

    it("does not create a second account for a taken address", async () => {
      // The other side of the assertion above: identical answers must not be
      // bought by actually registering the duplicate.
      const taken = await createUser("taken-once");

      await signUp(taken, "a-completely-different-password");

      const found = await payload.find({
        collection: "users",
        where: { email: { equals: taken } },
      });

      expect(found.totalDocs).toBe(1);
    });

    it("does not let the original account's password be overwritten", async () => {
      const taken = await createUser("taken-password");

      await signUp(taken, "an-attackers-chosen-password");

      const result = await payload.login({
        collection: "users",
        data: { email: taken, password: PASSWORD },
      });

      expect(result.token).toBeTruthy();
    });

    it("holds both sign-up outcomes for the same minimum time", async () => {
      // Unpadded, a taken address answered in 8.3 ms and a fresh one in
      // 82.7 ms, because only the fresh one reaches the KDF.
      const taken = await createUser("timing-taken");

      const startTaken = Date.now();
      await signUp(taken, PASSWORD);
      const takenMs = Date.now() - startTaken;

      const startFresh = Date.now();
      await signUp(unique("timing-fresh"), PASSWORD);
      const freshMs = Date.now() - startFresh;

      expect(takenMs).toBeGreaterThanOrEqual(450);
      expect(freshMs).toBeGreaterThanOrEqual(450);
    });

    it("reports a weak password, because the visitor has to be able to fix it", async () => {
      const response = await signUp(unique("weak"), "short");

      expect(response.headers.get("Location")).toBe(
        "/nl/sign-up?error=password"
      );
    });

    it("reports a weak password identically for a taken and a fresh address", async () => {
      /*
       * Reporting the password problem is only safe because
       * `enforcePasswordPolicy` is a `beforeValidate` hook and therefore runs
       * *before* the uniqueness check. If it ran after, "your password is too
       * short" versus "your account is ready" would be the enumeration oracle
       * again, wearing a different hat.
       */
      const taken = await createUser("weak-taken");

      const onTaken = await snapshot(await signUp(taken, "short"));
      const onFresh = await snapshot(
        await signUp(unique("weak-fresh"), "short")
      );

      expect(onTaken).toEqual(onFresh);
    });

    it("reports a malformed address before it reaches the database", async () => {
      const response = await signUp("not-an-address", PASSWORD);

      expect(response.headers.get("Location")).toBe("/nl/sign-up?error=email");
    });

    it("screens exactly the addresses Payload's own validator would reject", async () => {
      /*
       * The agreement `endpoints/auth.ts` depends on. Because every
       * `email`-path validation error is treated as "already registered", an
       * address this endpoint accepts but Payload rejects would tell the
       * visitor to go and sign in to an account that does not exist. Driven
       * against a real `payload.create` rather than against the regex.
       */
      await expect(
        payload.create({
          collection: "users",
          data: {
            email: "user..name@example.com",
            password: PASSWORD,
            role: "user",
          },
        })
      ).rejects.toThrow();
    });

    it("cannot be used to mint an admin", async () => {
      // The form has no `role` field, but nothing stops a POST from adding
      // one. `overrideAccess: false` is what makes the field guard run.
      const email = unique("escalate");

      await signUp(email, PASSWORD, { role: "admin" });

      const found = await payload.find({
        collection: "users",
        overrideAccess: true,
        where: { email: { equals: email } },
      });

      expect(found.docs[0]?.role).toBe("user");
    });

    it("stores the address lowercased, so sign-in finds it", async () => {
      const email = unique("MiXeD").toUpperCase();

      await signUp(email, PASSWORD);

      const response = await signIn(email.toLowerCase(), PASSWORD);

      expect(response.headers.get("Location")).toBe("/nl");
    });

    it("refuses a cross-site post", async () => {
      const response = await post(
        "/api/auth/sign-up",
        { email: unique("csrf"), locale: "nl", password: PASSWORD },
        { origin: "https://evil.example" }
      );

      expect(response.status).toBe(403);
    });
  });

  describe("decideSignUp", () => {
    it("answers the same for a free address and a registered one", async () => {
      const free = await decideSignUp(req, {
        email: "nobody@example.test",
        password: "correct horse battery staple",
      });

      // The first call registered it. The second is the taken-address branch.
      const taken = await decideSignUp(req, {
        email: "nobody@example.test",
        password: "correct horse battery staple",
      });

      expect(free).toBe("accepted");
      expect(taken).toBe("accepted");
    });

    it("reports a malformed address", async () => {
      await expect(
        decideSignUp(req, {
          email: "not-an-address",
          password: "correct horse battery staple",
        })
      ).resolves.toBe("invalid-email");
    });

    it("reports a weak password", async () => {
      await expect(
        decideSignUp(req, { email: "weak@example.test", password: "x" })
      ).resolves.toBe("weak-password");
    });

    it("really did create the first account", async () => {
      const found = await payload.find({
        collection: "users",
        where: { email: { equals: "nobody@example.test" } },
      });

      expect(found.totalDocs).toBe(1);
    });
  });

  describe("POST /api/mobile/sign-up", () => {
    /**
     * `handleEndpoints`, not a real `fetch`, for the same reason every other
     * endpoint in this file is driven this way — there is no live server
     * under Vitest. `handleEndpoints` still resolves the request through the
     * real endpoint matcher, which is what a routing mistake (the flat-path
     * concern `mobileSignUp`'s own comment raises) would actually fail.
     */
    const postJson = (body: unknown, init: { origin?: string } = {}) => {
      const headers = new Headers({ "Content-Type": "application/json" });

      if (init.origin !== undefined) {
        headers.set("Origin", init.origin);
      }

      return handleEndpoints({
        config,
        request: new Request(`${SITE}/api/mobile/sign-up`, {
          body: JSON.stringify(body),
          headers,
          method: "POST",
        }),
      });
    };

    it("answers byte-identically for a free address and a registered one", async () => {
      const first = await snapshot(
        await postJson({ email: "json@example.test", password: PASSWORD })
      );
      const second = await snapshot(
        await postJson({ email: "json@example.test", password: PASSWORD })
      );

      expect(first).toEqual(second);
    });

    it("created the account on the first call", async () => {
      const found = await payload.find({
        collection: "users",
        where: { email: { equals: "json@example.test" } },
      });

      expect(found.totalDocs).toBe(1);
    });

    it("never returns a token", async () => {
      const body = await (
        await postJson({ email: "token@example.test", password: PASSWORD })
      ).text();

      expect(body).not.toMatch(/token/i);
    });

    it("gives the new account the user role, not admin", async () => {
      await postJson({ email: "role@example.test", password: PASSWORD });

      const found = await payload.find({
        collection: "users",
        where: { email: { equals: "role@example.test" } },
      });

      expect(found.docs[0]?.role).toBe("user");
    });

    it("cannot be used to mint an admin", async () => {
      await postJson({
        email: "admin@example.test",
        password: PASSWORD,
        role: "admin",
      });

      const found = await payload.find({
        collection: "users",
        where: { email: { equals: "admin@example.test" } },
      });

      expect(found.docs[0]?.role).toBe("user");
    });

    it("refuses a cross-site POST", async () => {
      const response = await postJson(
        { email: "csrf@example.test", password: PASSWORD },
        { origin: "https://evil.test" }
      );

      expect(response.status).toBe(403);
    });

    it("takes at least the auth floor even for a malformed address", async () => {
      const started = Date.now();
      await postJson({ email: "nope", password: PASSWORD });

      expect(Date.now() - started).toBeGreaterThanOrEqual(AUTH_FLOOR_MS);
    });
  });

  describe("sign-out", () => {
    const sessionCookie = async (email: string) => {
      const header = (await signIn(email, PASSWORD)).headers.get("Set-Cookie");

      return (header ?? "").split(";")[0];
    };

    it("expires the cookie and returns to the locale", async () => {
      const email = await createUser("signout");
      const cookie = await sessionCookie(email);

      const response = await post(
        "/api/auth/sign-out",
        { locale: "nl" },
        { cookie }
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/nl");
      expect(response.headers.get("Set-Cookie")).toContain("payload-token=;");
      expect(response.headers.get("Set-Cookie")).toContain("Path=/");
    });

    it("revokes the session server-side, not only in the browser", async () => {
      /*
       * The assertion that separates a real sign-out from a cleared cookie. A
       * token whose `sid` is gone resolves to nobody — `JWTAuthentication`
       * looks the session up in `user.sessions` — so a copy of the cookie
       * taken before signing out is worthless afterwards. Without this,
       * "signed out" would mean "your browser forgot".
       */
      const email = await createUser("revoke");
      const cookie = await sessionCookie(email);

      expect((await resolveSession(new Headers({ cookie })))?.email).toBe(
        email
      );

      await post("/api/auth/sign-out", { locale: "nl" }, { cookie });

      expect(await resolveSession(new Headers({ cookie }))).toBeNull();
    });

    it("is harmless when nobody is signed in", async () => {
      const response = await post("/api/auth/sign-out", { locale: "en" });

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/en");
    });

    it("refuses a cross-site post", async () => {
      const email = await createUser("signout-csrf");
      const cookie = await sessionCookie(email);

      const response = await post(
        "/api/auth/sign-out",
        { locale: "nl" },
        { cookie, origin: "https://evil.example" }
      );

      expect(response.status).toBe(403);
      expect(await resolveSession(new Headers({ cookie }))).not.toBeNull();
    });
  });

  describe("the error names this endpoint classifies by", () => {
    /*
     * `isCredentialFailure` matches on `error.name` so `lib/authFlow.ts` can
     * stay free of a runtime `payload` import and be unit-tested under jsdom.
     * That is only safe while the names are the class names, so the real
     * classes are instantiated here and checked. A rename under a dependency
     * bump fails this by name rather than turning every wrong password into a
     * 500 — or, worse, turning a database outage into "your password is
     * wrong".
     */
    it("recognises the real Payload classes", () => {
      expect(isCredentialFailure(new AuthenticationError())).toBe(true);
      expect(isCredentialFailure(new LockedAuth())).toBe(true);
      expect(isCredentialFailure(new UnverifiedEmail({}))).toBe(true);
      expect(isCredentialFailure(new Forbidden())).toBe(true);
      expect(
        isCredentialFailure(
          new ValidationError({ collection: "users", errors: [] })
        )
      ).toBe(true);
    });
  });
});
