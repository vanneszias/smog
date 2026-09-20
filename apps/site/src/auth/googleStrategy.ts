import { decodeJwt, jwtVerify } from "jose";
import type { AuthStrategy, Payload } from "payload";
import { extractJWT, jwtSign } from "payload";
import type { User } from "@/payload-types";

/**
 * Google sign-in as a Payload `AuthStrategy`.
 *
 * ## What the strategy is for, and what it deliberately is not
 *
 * The OAuth callback in `endpoints/oauth.ts` ends by issuing a session. It
 * would have been possible to issue Payload's *own* session token there —
 * `getFieldsToSign` and `jwtSign` are both exported — and let the built-in
 * `local-jwt` strategy authenticate it. That was rejected, and the reason is
 * worth stating because it is the difference between a strategy that earns
 * its place and one that is decoration:
 *
 * - A token `local-jwt` accepts is a token this file could be deleted
 *   without anybody noticing. A mutation that removes the strategy would
 *   survive the whole suite. There is nothing to prove.
 * - More importantly, the two are not the same credential. A password
 *   session means "somebody typed this account's password". A Google
 *   session means "Google says this person controls this address". Later
 *   work — re-authentication before a password change, for one — needs to
 *   tell them apart, and it cannot if both arrive as `local-jwt`.
 *
 * So the callback mints a token in a **shape `local-jwt` cannot read**: it
 * carries `sub`, not the `collection`/`id` pair `JWTAuthentication` reaches
 * for (`payload/dist/auth/strategies/jwt.js`). Remove this strategy and
 * Google sign-in stops working, loudly, in a named test.
 *
 * ## What it shares with a password session, on purpose
 *
 * Everything that is not the token body:
 *
 * - **The same cookie**, `payload-token`, via `generatePayloadCookie`. So
 *   `lib/session.ts` needs no change, and neither does anything that reads a
 *   session.
 * - **The same session store.** The `sid` is a real row in `users.sessions`,
 *   written by {@link createOAuthSession}, so an OAuth session expires when
 *   Payload says it does and `logoutOperation` revokes it — which is why
 *   `authenticate` sets `user._sid`, the field logout filters on
 *   (`payload/dist/auth/operations/logout.js`).
 * - **The same extraction**, `extractJWT`, so the cookie/bearer precedence
 *   and the CSRF handling in `payload/dist/auth/extractJWT.js` apply here
 *   too rather than being reimplemented slightly differently.
 *
 * ## Provider-agnostic, one provider wired
 *
 * `oauthSessionStrategy` is a factory over the provider id, and the id
 * is a claim in the token, so the strategy only answers for tokens its own
 * provider minted. Apple is `oauthSessionStrategy("apple")` plus an entry in
 * `auth/oauthProvider.ts` — the piece that does *not* generalise, and the
 * reason Apple is out of scope here, is that Apple's client secret is itself
 * a signed JWT with an expiry that has to be rotated. None of that touches
 * this file.
 */

/** Marks a token as ours rather than Payload's. */
const OAUTH_TOKEN_TYPE = "oauth-session";

const USERS = "users";

interface OAuthSessionClaims {
  provider: unknown;
  sid: unknown;
  sub: unknown;
  typ: unknown;
}

/**
 * Registers a new session on the user and returns a token naming it.
 *
 * Mirrors `addSessionToUser` (`payload/dist/auth/sessions.js`), which is not
 * exported, through the public local API. Expired rows are dropped on the
 * way past for the same reason Payload drops them: nothing else ever does,
 * and the array is stored in full on every write.
 *
 * **Order matters, because there are no transactions** (the D1 adapter takes
 * `defaultBeginTransaction`, so nothing rolls back). The session row is
 * written *before* the token that names it is handed to the browser: a row
 * with no cookie is an orphan that expires on its own, while a cookie with
 * no row is a session that never worked.
 */
export async function createOAuthSession({
  payload,
  providerId,
  user,
}: {
  payload: Payload;
  providerId: string;
  user: User;
}): Promise<{ sid: string; token: string }> {
  const authConfig = payload.collections[USERS].config.auth;
  const sid = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + authConfig.tokenExpiration * 1000);

  const live = (user.sessions ?? []).filter(
    (session) => new Date(session.expiresAt).getTime() > now.getTime()
  );

  await payload.update({
    collection: USERS,
    data: {
      sessions: [
        ...live,
        {
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          id: sid,
        },
      ],
    },
    id: user.id,
    overrideAccess: true,
  });

  const { token } = await jwtSign({
    fieldsToSign: {
      provider: providerId,
      sid,
      sub: String(user.id),
      typ: OAUTH_TOKEN_TYPE,
    },
    secret: payload.secret,
    tokenExpiration: authConfig.tokenExpiration,
  });

  return { sid, token };
}

/**
 * An `AuthStrategy` that authenticates the sessions `createOAuthSession`
 * mints for one provider.
 *
 * Returning `{ user: null }` is the *common* case and has to be cheap and
 * silent: custom strategies run **before** `local-jwt`
 * (`payload/dist/index.js` builds `authStrategies` from the collections
 * first and appends the JWT strategy last), so this function is on the path
 * of every authenticated request on the site, including the admin panel.
 * Anything it throws is caught and logged as an error by
 * `executeAuthStrategies`, so it throws nothing.
 */
function oauthSessionStrategy(providerId: string): AuthStrategy {
  return {
    authenticate: async ({ headers, payload }) => {
      const token = extractJWT({ headers, payload });

      if (!token) {
        return { user: null };
      }

      /*
       * Triage on the *unverified* body before paying for a signature check.
       *
       * This is safe because nothing is trusted here: the only question
       * asked is "is this token even addressed to this strategy", and a
       * wrong answer in either direction is harmless — a forged `typ` still
       * has to survive `jwtVerify` below, and a token that is not ours falls
       * through to `local-jwt` unchanged. What it buys is that a password
       * session, which is every session today, is not verified twice on
       * every request.
       */
      let unverified: OAuthSessionClaims;

      try {
        unverified = decodeJwt(token) as OAuthSessionClaims;
      } catch {
        return { user: null };
      }

      if (
        unverified.typ !== OAUTH_TOKEN_TYPE ||
        unverified.provider !== providerId
      ) {
        return { user: null };
      }

      try {
        const { payload: claims } = await jwtVerify<OAuthSessionClaims>(
          token,
          new TextEncoder().encode(payload.secret),
          // Pinned, so a token whose header says `alg: none` — or any other
          // algorithm — is refused rather than negotiated.
          { algorithms: ["HS256"] }
        );

        if (
          claims.typ !== OAUTH_TOKEN_TYPE ||
          claims.provider !== providerId ||
          typeof claims.sub !== "string" ||
          typeof claims.sid !== "string"
        ) {
          return { user: null };
        }

        const authConfig = payload.collections[USERS].config.auth;

        const user = (await payload.findByID({
          collection: USERS,
          depth: authConfig.depth,
          disableErrors: true,
          id: claims.sub,
        })) as null | User;

        if (user === null) {
          return { user: null };
        }

        /*
         * The token names a session; the session has to still exist. This is
         * what makes sign-out work — `logoutOperation` deletes the row — and
         * it is the same check `JWTAuthentication` performs for password
         * sessions. Without it the token would be valid until its own expiry
         * whatever the server did.
         */
        if (authConfig.useSessions) {
          const live = (user.sessions ?? []).some(
            (session) => session.id === claims.sid
          );

          if (!live) {
            return { user: null };
          }
        }

        return {
          user: {
            ...user,
            _sid: claims.sid,
            _strategy: providerId,
            collection: USERS,
          },
        };
      } catch {
        return { user: null };
      }
    },
    name: providerId,
  };
}

/**
 * The only provider wired up today.
 *
 * The factory above is deliberately **not** exported: knip fails the build on
 * an export nothing imports, and "exported for the Apple task to use later"
 * is exactly the shape of unused export it exists to catch. Apple's line goes
 * next to this one.
 */
export const googleStrategy = oauthSessionStrategy("google");
