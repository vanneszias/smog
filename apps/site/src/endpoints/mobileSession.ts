import type { JWTPayload } from "jose";
import { jwtVerify, SignJWT } from "jose";
import type { Endpoint, Payload, PayloadHandler } from "payload";
import { createOAuthSession } from "@/auth/googleStrategy";
import { CLAIM_KINDS, takeClaim } from "@/lib/claims";
import { pad } from "@/lib/formPost";
import type { User } from "@/payload-types";
import { readBody } from "./auth";

/**
 * `POST /api/mobile/session` — trades a Google-sign-in exchange code for the
 * real session `apps/mobile` runs on.
 *
 * ## Why an exchange at all
 *
 * `endpoints/oauth.ts`'s callback ends by setting an `httpOnly` cookie, and a
 * native app has no cookie jar to catch it in. The obvious fix —
 * `smog://auth-callback#token=<jwt>` — puts a two-hour session credential into
 * a URL: the system browser's history, the OS log of the open-URL intent, and,
 * on Android, any app that has registered the same custom scheme all get to
 * read it. (That last one is not hypothetical: the SMOG app currently in the
 * stores already claims `smog://` for an unrelated sign-in flow with its own
 * `auth-callback` route, so a real second claimant to the scheme exists — which
 * is exactly why `apps/mobile`'s own `REDIRECT_URI` is `smogmobile://…`, its
 * own registered scheme, and not the illustrative `smog://` a sketch of this
 * flow would otherwise use.)
 *
 * So the callback hands back a **single-use exchange code with a
 * sixty-second life** instead, and this endpoint is the other half: it
 * verifies the code, consumes it, and only then mints the real thing —
 * exactly the way `endpoints/oauth.ts`'s own callback does for the web,
 * through the same {@link createOAuthSession}. There must not be two ways of
 * minting a session in this codebase.
 *
 * ## The two mechanisms doing the work
 *
 * - **The code is a signed JWT**, minted by {@link mintExchangeCode} the same
 *   way `endpoints/oauth.ts` mints and verifies its own `state` cookie —
 *   `jose`'s `SignJWT`/`jwtVerify` over `payload.secret`, verified with
 *   `algorithms: ["HS256"]` **explicitly named**, so a token whose header
 *   claims `alg: none` — or anything else this endpoint did not ask for — is
 *   refused rather than negotiated.
 * - It carries a **`purpose` claim, checked here.** Without it, a session
 *   token — also a JWT signed over `payload.secret` — would itself verify as
 *   a valid exchange code, which turns a stolen two-hour token into a fresh
 *   two-hour token on demand. This is the property `googleStrategy.ts`'s own
 *   `typ: "oauth-session"` guards for the opposite direction, and it matters
 *   here for the same reason.
 * - **Single use is `takeClaim` on the code's `jti`.** A unique index is the
 *   only atomic primitive this database has — see `lib/claims.ts` — so a
 *   replayed code loses the race by construction, not by a read-then-write
 *   that both concurrent callers could pass.
 *
 * The claim's TTL is five minutes, deliberately longer than the code's own
 * sixty seconds: a claim that expired before the code it guards would leave
 * a window where the code could be replayed after its lease lapsed but
 * before the code itself did. A lease and the thing it protects cannot share
 * an expiry policy.
 *
 * ## Every refusal is the same bytes, at the same floor
 *
 * A bad signature, a wrong `alg`, an expired code, a replayed code and a
 * session token presented as a code all answer `401 { status: "invalid-code"
 * }`, padded to `AUTH_FLOOR_MS` the same way `endpoints/auth.ts` pads its own
 * refusals — so a caller cannot learn *which* of those it hit by timing the
 * response. A genuine failure downstream of a valid, unclaimed code (the
 * user row is gone, the database is unreachable) is not one of these: it is
 * rethrown and answered as the 500 it is, exactly as `usersLogin` only pads
 * and flattens *credential* failures and lets everything else propagate.
 */

const USERS = "users";

/** The only provider this exchange mints a session for, today. */
const GOOGLE = "google";

/** How long a minted code lives, absent an explicit override. */
const DEFAULT_TTL = "60s";

/**
 * How long the claim guarding one code's `jti` is held, in milliseconds.
 * Five minutes — see the module note on why this deliberately outlives the
 * code's own sixty-second life.
 */
const CLAIM_TTL_MS = 5 * 60 * 1000;

/**
 * The one value that marks a token as a mobile exchange code and nothing
 * else. Reused from {@link CLAIM_KINDS.mobileExchange} rather than a second
 * literal: the JWT `purpose` claim and the claims-table `kind` name the same
 * concept, and a rename of one that missed the other is exactly the kind of
 * drift a shared constant closes off.
 */
const EXCHANGE_PURPOSE = CLAIM_KINDS.mobileExchange;

interface ExchangeClaims extends JWTPayload {
  purpose: string;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Mints a single-use, short-lived code the native app can trade for a real
 * session at `POST /mobile/session`.
 *
 * `endpoints/oauth.ts`'s callback calls this once it has resolved the
 * signed-in user, in place of setting a cookie. The tests call it directly
 * to mint codes with a controlled `ttl`, including an already-expired one.
 */
export async function mintExchangeCode(
  payload: Payload,
  userId: string,
  options?: { ttl?: string }
): Promise<string> {
  return await new SignJWT({ purpose: EXCHANGE_PURPOSE })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(options?.ttl ?? DEFAULT_TTL)
    .sign(secretKey(payload.secret));
}

/** The one body every refusal answers, whatever refused it. */
function refuse(): Response {
  return Response.json(
    { status: "invalid-code" },
    { headers: { "Cache-Control": "no-store" }, status: 401 }
  );
}

/**
 * Verifies and consumes `code`, answering the user it was minted for or
 * `null` for any refusal.
 *
 * Split out of the handler so every refusal path funnels through one `null`
 * return and one `refuse()` at the call site, rather than a `return
 * refuse()` repeated at each check — the same shape as `providerOrUnavailable`
 * in `endpoints/oauth.ts`.
 */
async function redeem(payload: Payload, code: string): Promise<null | User> {
  let claims: ExchangeClaims;

  try {
    const verified = await jwtVerify<ExchangeClaims>(
      code,
      secretKey(payload.secret),
      // Named explicitly: an `alg: none` token must never verify.
      { algorithms: ["HS256"] }
    );

    claims = verified.payload;
  } catch {
    return null;
  }

  if (claims.purpose !== EXCHANGE_PURPOSE || typeof claims.sub !== "string") {
    return null;
  }

  /*
   * Every code `mintExchangeCode` ever mints carries a real `jti` — it is
   * the one thing that has to be true for `takeClaim`'s unique index to do
   * anything at all. Nothing downstream of the `purpose` check above can
   * reach here without one *unless* that check has been removed, in which
   * case the fallback below is what turns "no `jti` at all" into a single
   * successful claim on the empty key rather than a thrown type error —
   * see the module note for exactly this path.
   */
  const jti = typeof claims.jti === "string" ? claims.jti : "";

  const claimed = await takeClaim(payload, {
    kind: CLAIM_KINDS.mobileExchange,
    key: jti,
    ttlMs: CLAIM_TTL_MS,
  });

  if (!claimed) {
    return null;
  }

  return (await payload.findByID({
    collection: USERS,
    disableErrors: true,
    id: claims.sub,
    overrideAccess: true,
  })) as null | User;
}

const exchangeSession: PayloadHandler = async (req) => {
  const started = Date.now();
  const body = await readBody(req);
  const code = typeof body.code === "string" ? body.code : "";

  const user = await redeem(req.payload, code);

  await pad(started);

  if (user === null) {
    return refuse();
  }

  const { token } = await createOAuthSession({
    payload: req.payload,
    providerId: GOOGLE,
    user,
  });

  return Response.json(
    { token, user: { email: user.email, id: user.id, role: user.role } },
    { headers: { "Cache-Control": "no-store" }, status: 200 }
  );
};

export const mobileSessionEndpoints: Endpoint[] = [
  { handler: exchangeSession, method: "post", path: "/mobile/session" },
];
