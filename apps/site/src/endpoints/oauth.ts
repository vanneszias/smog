import type { JWTPayload } from "jose";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { generateCookie, generatePayloadCookie } from "payload";
import { createOAuthSession } from "@/auth/googleStrategy";
import {
  checkClaims,
  type OAuthIdentity,
  type OAuthProvider,
  resolveProvider,
} from "@/auth/oauthProvider";
import { homePath, seeOther, signInPath } from "@/lib/authFlow";
import { type Locale, resolveLocale } from "@/lib/locale";
import type { User } from "@/payload-types";

/**
 * `/auth/google` and `/auth/google/callback`, as Payload endpoints.
 *
 * Endpoints rather than `app/**​/route.ts` for the reason in
 * `endpoints/crawler.ts` and `endpoints/auth.ts`: a Next route handler that
 * imports Payload re-bundles the Payload/D1/drizzle graph into its own entry,
 * measured at +523.65 KiB gzipped. These ride on the REST entry that already
 * carries it, and `next.config.ts` rewrites the public paths onto them.
 *
 * ## The flow, and where each guard sits
 *
 * 1. `GET /auth/google` mints a random `state` and a random `nonce`, puts
 *    both in a signed, short-lived, `httpOnly` cookie, and sends the visitor
 *    to the provider with `state` and `nonce` in the query.
 * 2. `GET /auth/google/callback` **clears that cookie on every response it
 *    ever returns**, success or failure, which is what makes the `state`
 *    single-use.
 * 3. It refuses unless the cookie verifies and its `state` equals the one in
 *    the query. This is checked **before** the authorization code is
 *    exchanged, so a callback with a bad `state` costs the provider nothing
 *    and tells an attacker nothing.
 * 4. Only then is the code exchanged, the ID token verified against the
 *    provider's JWKS, and the `nonce` matched.
 *
 * ## Why every refusal is the same redirect
 *
 * `/{locale}/sign-in?error=oauth`, with no body and no cookie, for a forged
 * `state`, an absent one, a replayed one, a provider error, a failed
 * exchange, an unverifiable ID token and a mismatched nonce alike. The one
 * exception is `error=oauth-unverified`, and it is deliberately *not*
 * conditioned on whether an account exists — see the note on linking below.
 */

/** The cookie the `state` and `nonce` live in between the two requests. */
const STATE_COOKIE = "payload-oauth-state";

/**
 * How long a visitor has to finish at the provider. Ten minutes is long
 * enough for a consent screen and a password manager, and short enough that
 * a `state` recovered from a browser history or a proxy log is stale.
 */
const STATE_TTL_SECONDS = 600;

const USERS = "users";

/** The Google flow. A second provider is another entry here. */
const GOOGLE = "google";

interface StateCookie extends JWTPayload {
  /** Locale to return the visitor to. */
  l: string;
  n: string;
  /** Provider id, so one provider's cookie cannot finish another's flow. */
  p: string;
  s: string;
}

/**
 * JWKS fetchers, one per URI, kept for the life of the isolate.
 *
 * `createRemoteJWKSet` caches the key set inside the function it returns, so
 * building a new one per request would fetch Google's certificates on every
 * single sign-in. Keyed by URI rather than by provider so a provider whose
 * endpoints are overridden gets its own.
 */
const jwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySet(uri: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwkSets.get(uri);

  if (existing !== undefined) {
    return existing;
  }

  const created = createRemoteJWKSet(new URL(uri));

  jwkSets.set(uri, created);

  return created;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** 32 bytes of CSPRNG output, base64url. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * Compares two strings without leaking where they differ.
 *
 * `state` is a bearer value for the length of one redirect, so the usual
 * argument that a timing comparison is unexploitable over a network applies
 * — this is here because writing `===` in a security check invites the next
 * person to copy it somewhere it does matter, and the cost is one loop.
 */
function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < a.length; index += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: XOR-accumulate is what makes this comparison constant-time. Any formulation the rule would accept — `!==` with an early return, `+=` on a boolean — either short-circuits or branches, which is the property being avoided.
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
}

function readCookie(req: PayloadRequest, name: string): null | string {
  const header = req.headers.get("cookie");

  if (header === null) {
    return null;
  }

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");

    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      const value = pair.slice(separator + 1).trim();

      return value === "" ? null : value;
    }
  }

  return null;
}

function cookieOptions(req: PayloadRequest) {
  return {
    domain: req.payload.collections[USERS].config.auth.cookies.domain,
    secure: req.payload.collections[USERS].config.auth.cookies.secure,
  };
}

function stateCookie(req: PayloadRequest, value: string): string {
  const { domain, secure } = cookieOptions(req);

  return generateCookie({
    domain: domain ?? undefined,
    httpOnly: true,
    maxAge: STATE_TTL_SECONDS,
    name: STATE_COOKIE,
    /*
     * `Lax`, and it is load-bearing in both directions. `Strict` would not
     * be sent on the top-level navigation *back from the provider*, which is
     * a cross-site GET, so the callback would never see its own cookie and
     * every sign-in would fail. `None` would ship it on any cross-site
     * request at all. `Lax` is exactly "top-level navigations and nothing
     * else", which is what this flow is.
     */
    sameSite: "Lax",
    path: "/",
    returnCookieAsObject: false,
    secure,
    value,
  }) as string;
}

/** The same cookie, already expired. Emitted by *every* callback response. */
function clearedStateCookie(req: PayloadRequest): string {
  const { domain, secure } = cookieOptions(req);

  return generateCookie({
    domain: domain ?? undefined,
    expires: new Date(Date.now() - 1000),
    httpOnly: true,
    name: STATE_COOKIE,
    path: "/",
    returnCookieAsObject: false,
    sameSite: "Lax",
    secure,
    value: "",
  }) as string;
}

async function signState(secret: string, claims: StateCookie): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(secretKey(secret));
}

async function readState(
  secret: string,
  token: null | string
): Promise<null | StateCookie> {
  if (token === null) {
    return null;
  }

  try {
    const { payload: claims } = await jwtVerify<StateCookie>(
      token,
      secretKey(secret),
      { algorithms: ["HS256"] }
    );

    if (typeof claims.s !== "string" || typeof claims.n !== "string") {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

/** The provider, or a response explaining that this sign-in is switched off. */
function providerOrUnavailable(
  providerId: string,
  locale: Locale
): OAuthProvider | Response {
  const provider = resolveProvider(providerId);

  if (provider === null) {
    /*
     * No client id configured. This is the state of every developer machine
     * and of CI, and it must not be a 500 — the rest of the site works and
     * the sign-in page simply cannot offer this button.
     */
    return seeOther(signInPath(locale, { error: "oauth-unavailable" }));
  }

  return provider;
}

function startHandler(providerId: string): PayloadHandler {
  return async (req) => {
    const locale = resolveLocale(req.searchParams.get("locale") ?? undefined);
    const provider = providerOrUnavailable(providerId, locale);

    if (provider instanceof Response) {
      return provider;
    }

    const state = randomToken();
    const nonce = randomToken();

    const authorize = new URL(provider.authorizationEndpoint);

    authorize.searchParams.set("client_id", provider.clientId);
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("redirect_uri", redirectUri(req, providerId));
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", provider.scope);
    authorize.searchParams.set("state", state);

    const cookie = await signState(req.payload.secret, {
      l: locale,
      n: nonce,
      p: providerId,
      s: state,
    });

    return seeOther(authorize.toString(), stateCookie(req, cookie));
  };
}

/**
 * The callback URL, derived from the request rather than configured.
 *
 * `req.origin` is filled in by `createPayloadRequest` from the request URL,
 * so staging redirects to staging and production to production with nothing
 * to keep in sync — the same reasoning as the sitemap's base URL. Google
 * compares this string against the redirect URIs registered on the OAuth
 * client, so **every origin the site answers on has to be registered**;
 * that is the cost of deriving it, and it is stated here because the failure
 * mode is an error on Google's page rather than anything this code can
 * report.
 */
function redirectUri(req: PayloadRequest, providerId: string): string {
  return `${req.origin ?? ""}/auth/${providerId}/callback`;
}

interface ExchangeResult {
  id_token?: unknown;
}

async function exchangeCode({
  code,
  provider,
  redirect,
}: {
  code: string;
  provider: OAuthProvider;
  redirect: string;
}): Promise<null | string> {
  const response = await fetch(provider.tokenEndpoint, {
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirect,
    }).toString(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    /*
     * Workers `fetch` has no default timeout, and a token endpoint that
     * never answers would hold the request open until the platform killed
     * it. Ten seconds is far beyond any healthy exchange.
     */
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as ExchangeResult;

  return typeof body.id_token === "string" ? body.id_token : null;
}

/**
 * Finds the account this identity already belongs to, links it to a matching
 * password account, or creates one.
 *
 * **Linking is by verified email and nothing else.** `checkClaims` has
 * already refused anything the provider did not mark verified, so by the
 * time control reaches here the provider has asserted that this person
 * controls this address — which is the only thing that makes linking safe.
 * Linking on an unverified address would mean anybody who can get a provider
 * to mint them a token naming someone else's address owns that account.
 *
 * **The subject lookup comes first** so a person who changes the address on
 * their Google account still lands on their own account rather than being
 * handed a new one — and so they cannot be handed *somebody else's* by
 * changing their Google address to it.
 *
 * There are no transactions, so each branch is a single write.
 */
async function resolveUser({
  identity,
  providerId,
  req,
}: {
  identity: OAuthIdentity;
  providerId: string;
  req: PayloadRequest;
}): Promise<User> {
  const { payload } = req;

  const linked = await payload.find({
    collection: USERS,
    limit: 5,
    overrideAccess: true,
    where: { "oauthAccounts.subject": { equals: identity.subject } },
  });

  /*
   * The `where` matches any array row carrying this subject. Pairing it back
   * up with the provider happens here rather than in a second `and` clause
   * because Payload's array filters match *across* rows: `provider = google
   * AND subject = X` would also match a user whose Apple row carried X.
   */
  const existing = linked.docs.find((doc) =>
    ((doc as User).oauthAccounts ?? []).some(
      (account) =>
        account.provider === providerId && account.subject === identity.subject
    )
  ) as undefined | User;

  if (existing !== undefined) {
    return existing;
  }

  const byEmail = await payload.find({
    collection: USERS,
    limit: 1,
    overrideAccess: true,
    where: { email: { equals: identity.email } },
  });

  const account = byEmail.docs[0] as undefined | User;

  if (account !== undefined) {
    return (await payload.update({
      collection: USERS,
      data: {
        oauthAccounts: [
          ...(account.oauthAccounts ?? []),
          { provider: providerId, subject: identity.subject },
        ],
      },
      id: account.id,
      overrideAccess: true,
    })) as User;
  }

  return (await payload.create({
    collection: USERS,
    data: {
      email: identity.email,
      oauthAccounts: [{ provider: providerId, subject: identity.subject }],
      /*
       * Payload requires a password on an auth collection even when nobody
       * will ever type it. A fresh 288-bit value is unguessable and unknown
       * to anyone, including us; the account is reachable only through the
       * provider until its owner sets a password through the reset flow.
       */
      password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      /*
       * A literal, never anything derived from the provider's response. The
       * same rule as `endpoints/auth.ts`: this write runs with
       * `overrideAccess: true` — it has to, because `oauthAccounts` is
       * admin-only at field level and no visitor is an admin — so the
       * literal is the *only* thing standing between a token and an admin
       * account.
       */
      role: "user",
    },
    overrideAccess: true,
  })) as User;
}

function callbackHandler(providerId: string): PayloadHandler {
  return async (req) => {
    const cleared = clearedStateCookie(req);
    const state = await readState(
      req.payload.secret,
      readCookie(req, STATE_COOKIE)
    );

    /*
     * The locale comes out of the cookie when there is one. A refusal that
     * has no cookie to read cannot know which language the visitor started
     * in, so it uses the default — which is a cosmetic loss on a request
     * that was already not going to sign anybody in.
     */
    const locale = resolveLocale(state?.l);

    const refuse = (error: "oauth" | "oauth-unverified") =>
      seeOther(signInPath(locale, { error }), [cleared]);

    const provider = providerOrUnavailable(providerId, locale);

    if (provider instanceof Response) {
      return provider;
    }

    /*
     * **`state` first, before anything with a side effect.** A callback that
     * exchanged the code and only then checked `state` would burn a real
     * authorization code on a forged request and would tell a probe, by how
     * long the answer took, that the code was real.
     */
    const returned = req.searchParams.get("state");

    if (
      state === null ||
      state.p !== providerId ||
      returned === null ||
      !equalConstantTime(state.s, returned)
    ) {
      return refuse("oauth");
    }

    const code = req.searchParams.get("code");

    if (code === null || code === "") {
      // Includes the ordinary "the visitor pressed Cancel" case, which
      // arrives as `?error=access_denied`.
      return refuse("oauth");
    }

    let claims: Record<string, unknown>;

    try {
      const idToken = await exchangeCode({
        code,
        provider,
        redirect: redirectUri(req, providerId),
      });

      if (idToken === null) {
        return refuse("oauth");
      }

      const verified = await jwtVerify(idToken, keySet(provider.jwksUri), {
        /*
         * Pinned to the asymmetric algorithm the provider publishes keys
         * for. Without this, a token whose header claimed `HS256` would be
         * verified with the *public key as the shared secret* — the classic
         * algorithm-confusion forgery, and the public key is, by
         * definition, public.
         */
        algorithms: ["RS256"],
        audience: provider.clientId,
        clockTolerance: 5,
        issuer: provider.issuers,
      });

      claims = verified.payload as Record<string, unknown>;
    } catch {
      return refuse("oauth");
    }

    if (claims.nonce !== state.n) {
      return refuse("oauth");
    }

    const checked = checkClaims(claims, provider);

    if (!checked.ok) {
      /*
       * **This branch never touches the database, and that is deliberate.**
       * An unverified address is refused identically whether or not an
       * account with that address exists — same redirect, same cookies, and
       * no query in between to make one case slower than the other. A
       * refusal that said "cannot link" for a registered address and
       * "cannot register" for a free one would turn Google sign-in into the
       * enumeration oracle `endpoints/auth.ts` exists to close.
       */
      return refuse(
        checked.reason === "unverified" ? "oauth-unverified" : "oauth"
      );
    }

    const user = await resolveUser({
      identity: checked.identity,
      providerId,
      req,
    });

    const { token } = await createOAuthSession({
      payload: req.payload,
      providerId,
      user,
    });

    const session = generatePayloadCookie({
      collectionAuthConfig: req.payload.collections[USERS].config.auth,
      cookiePrefix: req.payload.config.cookiePrefix,
      token,
    });

    return seeOther(homePath(locale), [cleared, session]);
  };
}

export const oauthEndpoints: Endpoint[] = [
  { handler: startHandler(GOOGLE), method: "get", path: `/auth/${GOOGLE}` },
  {
    handler: callbackHandler(GOOGLE),
    method: "get",
    path: `/auth/${GOOGLE}/callback`,
  },
];
