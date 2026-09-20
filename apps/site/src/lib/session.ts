import type { User } from "@/payload-types";
import { getPayloadClient } from "./payloadClient";

/**
 * The cookie Payload signs a session into.
 *
 * `generatePayloadCookie` names it `${cookiePrefix}-token`
 * (`payload/dist/auth/cookies.js`), and `cookiePrefix` defaults to `payload`
 * (`payload/dist/config/defaults.js:117`) — this app does not set one. It is
 * written out as a literal here because the whole point of the guard below is
 * to answer without booting Payload, and reading the config would boot it.
 *
 * That literal is a coupling, so it is pinned rather than trusted:
 * `session.int.test.ts` builds a header from the *live* `cookiePrefix` and
 * asserts this module recognises it, which fails by name the day somebody
 * sets a prefix.
 */
const SESSION_COOKIE = "payload-token";

/**
 * Whether the request carries a session cookie worth asking Payload about.
 *
 * **This is a real optimisation, not a micro one.** Resolving a session costs
 * a Payload boot, a JWT verify and a `findByID`, and `payload.auth` then runs
 * `getAccessResults` across every collection on top. Most visitors are
 * signed out, and the locale layout asks on every page — including
 * `/{locale}`, which otherwise issues no query at all. Answering `null` from
 * the header keeps that page's cost where it was.
 *
 * **It parses rather than searching the string.** `header.includes()` would
 * match `not-payload-token=…` and `x-payload-token=…`, which is a guard that
 * passes exactly when it should not. An empty value is treated as absent: a
 * cleared cookie is sent as `payload-token=`, and asking Payload to verify an
 * empty token is the boot this exists to avoid.
 *
 * **Only the cookie counts, deliberately.** Payload's `extractJWT` also
 * accepts `Authorization: JWT …`, and this does not — a page is authenticated
 * by the browser's cookie, and the bearer path belongs to the REST API, which
 * is still mounted and unaffected. `session.int.test.ts` pins that as a
 * decision rather than leaving it to be discovered.
 */
export function hasSessionCookie(cookieHeader: null | string): boolean {
  if (cookieHeader === null) {
    return false;
  }

  return cookieHeader.split(";").some((pair) => {
    const separator = pair.indexOf("=");

    if (separator === -1) {
      return false;
    }

    return (
      pair.slice(0, separator).trim() === SESSION_COOKIE &&
      pair.slice(separator + 1).trim() !== ""
    );
  });
}

/**
 * The signed-in user behind a set of request headers, or `null`.
 *
 * Split out from {@link readSession} so it can be driven from a test with a
 * `Headers` object built by hand: `next/headers` only resolves inside a
 * request, so a function that reaches for it directly can only be tested by
 * rendering a page.
 *
 * **Stage 3 Task 5 built `fetchViewer` for this and then deleted it**, because
 * a mutation proved it dead: the page that called it — the shared-list page —
 * answers identically for a signed-in and an anonymous reader, since the share
 * token is the entire capability. Ignoring the viewer there failed no test, so
 * the call was an extra `payload.auth` per request with no observable effect.
 * The difference here is that the caller is the locale layout's account nav,
 * whose *only* input is who you are; `AccountNav.test.tsx` and the e2e specs
 * both fail when this returns the wrong thing. Same helper, opposite verdict,
 * and the thing that decides it is whether any output depends on the answer.
 */
export async function resolveSession(
  requestHeaders: Headers
): Promise<null | User> {
  if (!hasSessionCookie(requestHeaders.get("cookie"))) {
    return null;
  }

  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: requestHeaders });

  /*
   * `payload.auth` resolves whichever auth collection the token names. This
   * app has one, but narrowing on the slug rather than on truthiness means a
   * second auth collection added later cannot quietly start populating the
   * public site's account nav.
   */
  return user?.collection === "users" ? (user as User) : null;
}

/**
 * The signed-in user for the page being rendered, or `null`.
 *
 * `next/headers` is imported dynamically for the same reason
 * `payloadClient.ts` imports Payload dynamically: a static import is hoisted
 * above every early return, and this module is imported by a jsdom unit test
 * that must not drag Next's server runtime in with it.
 *
 * **Calling this opts the route out of static rendering.** Reading request
 * headers is what makes a page dynamic; the cost is measured and recorded in
 * the Stage 4 Task 2 report rather than left as a surprise.
 */
export async function readSession(): Promise<null | User> {
  const { headers } = await import("next/headers");

  return await resolveSession(await headers());
}
