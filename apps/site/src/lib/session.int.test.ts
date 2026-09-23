// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { hasSessionCookie, resolveSession } from "./session";

/**
 * `resolveSession` against a real database and a real token.
 *
 * The unit test next door proves the cookie *parser*. This proves the thing
 * that parser is for: that a token Payload issued, carried the way a browser
 * carries it, resolves back to the account that signed in — and that
 * everything else resolves to `null` rather than to somebody.
 */
describe("resolveSession", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let email: string;
  let token: string;

  const PASSWORD = "session-int-password";

  beforeAll(async () => {
    payload = await getPayload({ config });
    email = `session-${crypto.randomUUID()}@example.test`;

    await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    });

    const result = await payload.login({
      collection: "users",
      data: { email, password: PASSWORD },
    });

    if (result.token === undefined) {
      throw new Error("login issued no token");
    }

    token = result.token;
  });

  const headersWith = (entries: Record<string, string>) => new Headers(entries);

  it("resolves the account behind a session cookie", async () => {
    const user = await resolveSession(
      headersWith({ cookie: `payload-token=${token}` })
    );

    expect(user?.email).toBe(email);
  });

  it("resolves it alongside other cookies", async () => {
    const user = await resolveSession(
      headersWith({ cookie: `theme=dark; payload-token=${token}; x=1` })
    );

    expect(user?.email).toBe(email);
  });

  it("answers null for a request with no cookies", async () => {
    expect(await resolveSession(new Headers())).toBeNull();
  });

  it("answers null for a forged token rather than throwing", async () => {
    // A bad cookie is what a visitor whose secret was rotated sends. It has to
    // render the signed-out header, not a 500 on every page.
    expect(
      await resolveSession(headersWith({ cookie: "payload-token=not.a.jwt" }))
    ).toBeNull();
  });

  it("answers null for a token signed for nobody", async () => {
    const [header, , signature] = token.split(".");
    const tampered = `${header}.eyJpZCI6OTk5OTk5OTksImNvbGxlY3Rpb24iOiJ1c2VycyJ9.${signature}`;

    expect(
      await resolveSession(headersWith({ cookie: `payload-token=${tampered}` }))
    ).toBeNull();
  });

  it("ignores a bearer token, which belongs to the REST API and not to a page", async () => {
    /*
     * A deliberate narrowing, pinned so it is a decision rather than a
     * discovery. Payload's `extractJWT` also accepts `Authorization: JWT …`,
     * and `hasSessionCookie` short-circuits before Payload ever looks — which
     * is what keeps an anonymous page view from booting it. Pages are
     * authenticated by the browser's cookie; `app/(payload)/api/[...slug]` is
     * where a bearer token is honoured, and it is untouched by this.
     */
    expect(
      await resolveSession(headersWith({ Authorization: `JWT ${token}` }))
    ).toBeNull();
  });

  it("looks for the cookie name this deployment actually sets", () => {
    /*
     * `session.ts` hard-codes `payload-token` so the guard can answer without
     * booting Payload. This is the other end of that trade: the live config's
     * `cookiePrefix` is read here and the guard is asked about the name it
     * produces, so setting a prefix fails this test by name instead of
     * silently signing everybody out of the public site while leaving the
     * admin panel working.
     */
    const live = `${payload.config.cookiePrefix}-token`;

    expect(hasSessionCookie(`${live}=${token}`)).toBe(true);
  });
});
