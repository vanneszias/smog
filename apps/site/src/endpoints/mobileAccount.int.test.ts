// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * The native app's three account writes, at `/api/mobile/account/*`, driven
 * through `handleEndpoints` against a real database — the same harness
 * `account.int.test.ts` uses, for the same reason: half of what can go
 * wrong here is routing and authentication, and a handler called with a
 * hand-built `req` exercises neither.
 *
 * **This file exists because `account.int.test.ts` could not change.** The form
 * endpoints' `decide*` functions (`endpoints/account.ts`) are shared with
 * these; that file's 41 tests, run unedited alongside this one, are what prove
 * the extraction changed no guard, no order and no answer for the web surface.
 * What this file adds is the second renderer: a JSON body instead of a 303, and
 * `Authorization: JWT …` instead of a cookie — the native app carries no cookie
 * jar at all.
 *
 * **`/mobile/account/delete` asks for the account's address, not a
 * password.** It is easy to assume this endpoint is password-protected and
 * timing-padded; `endpoints/account.ts`'s `decideDeleteAccount` is neither —
 * it compares a typed address, and the handler is explicitly not padded.
 * This file asserts that contract.
 */
describe("the native app's account endpoints", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const RUN = crypto.randomUUID();
  const PASSWORD = "mobile-account-endpoint-password";
  const SITE = "http://localhost:3003";

  const unique = (prefix: string) =>
    `mobile-account-${prefix}-${RUN}-${crypto.randomUUID()}@example.test`;

  const signIn = async (email: string, password = PASSWORD) => {
    const { token } = await payload.login({
      collection: "users",
      data: { email, password },
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

    return { email, id: user.id, token: await signIn(email) };
  };

  /** `Authorization: JWT …`, never a cookie. */
  const post = (
    path: string,
    body: unknown,
    init: { locale?: string; origin?: string; token?: string } = {}
  ) => {
    const headers = new Headers({ "Content-Type": "application/json" });

    if (init.token !== undefined) {
      headers.set("Authorization", `JWT ${init.token}`);
    }

    if (init.origin !== undefined) {
      headers.set("Origin", init.origin);
    }

    const search = init.locale === undefined ? "" : `?locale=${init.locale}`;

    return handleEndpoints({
      config,
      request: new Request(`${SITE}/api${path}${search}`, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      }),
    });
  };

  const json = async (response: Response) =>
    (await response.json()) as Record<string, unknown>;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterAll(async () => {
    await payload.delete({
      collection: "users",
      where: { email: { like: RUN } },
    });
  });

  describe("the doors every handler has", () => {
    const PATHS = [
      "/mobile/account/password",
      "/mobile/account/email",
      "/mobile/account/delete",
    ];

    it("refuses a cross-site post to every one of them", async () => {
      for (const path of PATHS) {
        const response = await post(
          path,
          {},
          { origin: "https://evil.example" }
        );

        expect(`${path}:${response.status}`).toBe(`${path}:403`);
      }
    });

    it("answers 401 signed-out for every one of them, with no session", async () => {
      for (const path of PATHS) {
        const response = await post(path, {});

        expect(response.status).toBe(401);
        expect(await json(response)).toEqual({ status: "signed-out" });
      }
    });
  });

  describe("change password", () => {
    it("changes the password and answers 200", async () => {
      const member = await createMember("password-ok");

      const response = await post(
        "/mobile/account/password",
        { current: PASSWORD, next: "a-much-better-password-123" },
        { token: member.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "changed" });

      // The new password really works, and the old one no longer does.
      await expect(
        payload.login({
          collection: "users",
          data: { email: member.email, password: "a-much-better-password-123" },
        })
      ).resolves.toBeTruthy();

      await expect(
        payload.login({
          collection: "users",
          data: { email: member.email, password: PASSWORD },
        })
      ).rejects.toThrow();
    });

    it("ends every session, including the one that changed it", async () => {
      const member = await createMember("password-revokes");

      await post(
        "/mobile/account/password",
        { current: PASSWORD, next: "another-fine-password-456" },
        { token: member.token }
      );

      // The very token that authenticated the change no longer resolves.
      const response = await post(
        "/mobile/account/password",
        { current: "another-fine-password-456", next: "irrelevant-789012" },
        { token: member.token }
      );

      expect(response.status).toBe(401);
    });

    it("refuses the wrong current password and changes nothing", async () => {
      const member = await createMember("password-wrong");

      const response = await post(
        "/mobile/account/password",
        { current: "not-it-at-all", next: "a-fine-password-000111" },
        { token: member.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "credentials",
        status: "invalid",
      });
    });

    it("refuses a weak new password", async () => {
      const member = await createMember("password-weak");

      const response = await post(
        "/mobile/account/password",
        { current: PASSWORD, next: "short" },
        { token: member.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "password",
        status: "invalid",
      });
    });

    it("holds a refusal to the timing floor", async () => {
      /*
       * The same assertion `account.int.test.ts` makes about the form
       * surface, repeated here rather than inherited, because what it
       * protects is not the shared decision — it is this renderer's wiring
       * to it. `started` is read in the handler, not in `decideChangePassword`,
       * so a handler that measured after `readBody`, or skipped the shared
       * function for a "quick" local check, would keep every functional
       * assertion in this file green while separating "wrong password" from
       * "locked" by the ~80 ms a PBKDF2 comparison costs. Slack below the
       * 500 ms floor, the way the form suite does it: pinning the exact
       * number fails on a slow machine instead of on a regression.
       */
      const member = await createMember("password-timing");
      const started = Date.now();

      await post(
        "/mobile/account/password",
        { current: "not-the-password", next: "a-fine-password-222333" },
        { token: member.token }
      );

      expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    });

    it("acts on the token's account, never on one the body names", async () => {
      /*
       * Neither JSON body carries a target account, so cross-account use is
       * structurally impossible today — this is the assertion that keeps it
       * that way. A future edit that resolved the account from, say, a body
       * `email` field would turn a stranger's session into a password reset
       * for anybody, and every other test in this file would still pass.
       */
      const owner = await createMember("password-owner");
      const stranger = await createMember("password-stranger");

      const response = await post(
        "/mobile/account/password",
        {
          current: PASSWORD,
          email: owner.email,
          id: owner.id,
          next: "a-fine-password-444555",
          userId: owner.id,
        },
        { token: stranger.token }
      );

      expect(response.status).toBe(200);

      // The owner's password is untouched; the caller's own changed.
      await expect(
        payload.login({
          collection: "users",
          data: { email: owner.email, password: PASSWORD },
        })
      ).resolves.toBeTruthy();

      await expect(
        payload.login({
          collection: "users",
          data: { email: stranger.email, password: "a-fine-password-444555" },
        })
      ).resolves.toBeTruthy();
    });
  });

  describe("request email change", () => {
    it("parks the pending address and answers 200, without changing the session", async () => {
      const member = await createMember("email-ok");

      const response = await post(
        "/mobile/account/email",
        { current: PASSWORD, email: `new-${member.email}` },
        { token: member.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "pending" });

      const reloaded = await payload.findByID({
        collection: "users",
        id: member.id,
        overrideAccess: true,
      });

      expect(reloaded.pendingEmail).toBe(`new-${member.email}`.toLowerCase());
      // The address is not changed yet, and the session used to request the
      // change is still good.
      expect(reloaded.email).toBe(member.email.toLowerCase());
    });

    it("refuses the wrong current password", async () => {
      const member = await createMember("email-wrong-password");

      const response = await post(
        "/mobile/account/email",
        { current: "nope", email: `changed-${member.email}` },
        { token: member.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "credentials",
        status: "invalid",
      });
    });

    it("refuses an address that isn't one", async () => {
      const member = await createMember("email-shape");

      const response = await post(
        "/mobile/account/email",
        { current: PASSWORD, email: "not-an-address" },
        { token: member.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "email",
        status: "invalid",
      });
    });

    it("refuses the address already on the account", async () => {
      const member = await createMember("email-unchanged");

      const response = await post(
        "/mobile/account/email",
        { current: PASSWORD, email: member.email },
        { token: member.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "email-unchanged",
        status: "invalid",
      });
    });

    it("holds a refusal to the timing floor", async () => {
      /*
       * See the same assertion under "change password" for why this is
       * repeated per renderer rather than trusted to the shared decision.
       */
      const member = await createMember("email-timing");
      const started = Date.now();

      await post(
        "/mobile/account/email",
        { current: "not-the-password", email: `moved-${member.email}` },
        { token: member.token }
      );

      expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    });

    it("parks the address on the token's account, not on one the body names", async () => {
      const owner = await createMember("email-owner");
      const stranger = await createMember("email-stranger");
      const wanted = `taken-${stranger.email}`;

      const response = await post(
        "/mobile/account/email",
        {
          current: PASSWORD,
          email: wanted,
          id: owner.id,
          userId: owner.id,
        },
        { token: stranger.token }
      );

      expect(response.status).toBe(200);

      const [reloadedOwner, reloadedStranger] = await Promise.all([
        payload.findByID({
          collection: "users",
          id: owner.id,
          overrideAccess: true,
        }),
        payload.findByID({
          collection: "users",
          id: stranger.id,
          overrideAccess: true,
        }),
      ]);

      expect(reloadedOwner.pendingEmail).toBeFalsy();
      expect(reloadedStranger.pendingEmail).toBe(wanted.toLowerCase());
    });
  });

  describe("delete account", () => {
    /**
     * The load-bearing assertion of this describe block. It is easy to assume
     * this endpoint wants a password; `decideDeleteAccount` wants the account's
     * own address and nothing else. A client sending `{ current: PASSWORD }`
     * here — the password-change shape — would get exactly the same `invalid`
     * answer as one sending no confirmation at all, because the field it reads
     * is `confirmEmail`.
     */
    it("refuses a password where the address belongs", async () => {
      const member = await createMember("delete-password-not-accepted");

      const response = await post(
        "/mobile/account/delete",
        { current: PASSWORD },
        { token: member.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ status: "invalid" });

      const stillThere = await payload.findByID({
        collection: "users",
        id: member.id,
        overrideAccess: true,
      });

      expect(stillThere.id).toBe(member.id);
    });

    it("refuses a mismatched address and deletes nothing", async () => {
      const member = await createMember("delete-mismatch");

      const response = await post(
        "/mobile/account/delete",
        { confirmEmail: "someone-else@example.test" },
        { token: member.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ status: "invalid" });

      await expect(
        payload.findByID({
          collection: "users",
          id: member.id,
          overrideAccess: true,
        })
      ).resolves.toMatchObject({ id: member.id });
    });

    it("deletes the account once the address matches, case-insensitively", async () => {
      const member = await createMember("delete-ok");

      const response = await post(
        "/mobile/account/delete",
        { confirmEmail: member.email.toUpperCase() },
        { token: member.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "deleted" });

      const { totalDocs } = await payload.count({
        collection: "users",
        overrideAccess: true,
        where: { id: { equals: member.id } },
      });

      expect(totalDocs).toBe(0);
    });

    it("cannot be used to delete somebody else's account", async () => {
      const owner = await createMember("delete-owner");
      const stranger = await createMember("delete-stranger");

      const response = await post(
        "/mobile/account/delete",
        { confirmEmail: owner.email },
        { token: stranger.token }
      );

      // The stranger's own address does not match the stranger's own
      // account, so this is an ordinary confirmation mismatch — not a
      // pointer to somebody else's row.
      expect(response.status).toBe(400);

      const ownerStillThere = await payload.findByID({
        collection: "users",
        id: owner.id,
        overrideAccess: true,
      });

      expect(ownerStillThere.id).toBe(owner.id);
    });
  });
});
