import { isEmailShaped, normaliseEmail } from "@/lib/authFlow";

/**
 * The names of the OpenID Connect claims this app reads.
 *
 * Configuration rather than literals because the point of this module is
 * that a second provider is a data change. Google, Apple and Microsoft all
 * use `sub`/`email`/`email_verified`, so today every provider would name the
 * same three — but "every provider agrees" is a fact about the providers we
 * have looked at, not a property of the protocol, and the place to discover
 * a disagreement is a config file rather than a conditional in the handler.
 */
export interface OAuthClaimNames {
  email: string;
  emailVerified: string;
  subject: string;
}

/** Everything the endpoints need to talk to one identity provider. */
export interface OAuthProvider {
  authorizationEndpoint: string;
  claims: OAuthClaimNames;
  clientId: string;
  clientSecret: string;
  /** Also the value of the `provider` claim in the sessions we mint. */
  id: string;
  /**
   * Every `iss` value the provider is allowed to use.
   *
   * A list rather than a string because Google really does use two —
   * `https://accounts.google.com` and the bare `accounts.google.com` — and
   * an implementation that pins one of them rejects half of Google's
   * tokens. Verified against Google's published discovery document, which
   * names the first, and its documentation, which tells verifiers to accept
   * both.
   */
  issuers: string[];
  jwksUri: string;
  scope: string;
  tokenEndpoint: string;
}

type ProviderDefaults = Omit<OAuthProvider, "clientId" | "clientSecret">;

/**
 * Google's real endpoints.
 *
 * These are the values a deployment uses; only `clientId` and
 * `clientSecret` come from the environment in production. They are written
 * out rather than discovered from
 * `https://accounts.google.com/.well-known/openid-configuration` on purpose:
 * discovery is a network round trip on the sign-in path, and a discovery
 * document fetched over a hijacked connection is a way to move the token
 * endpoint. Re-check them if Google publishes a change.
 */
const GOOGLE: ProviderDefaults = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  claims: { email: "email", emailVerified: "email_verified", subject: "sub" },
  id: "google",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  /*
   * `openid email` and not `profile`. Nothing in this app stores a display
   * name or an avatar, so asking for them would widen the consent screen for
   * data we would throw away.
   */
  scope: "openid email",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

const DEFAULTS: Record<string, ProviderDefaults> = { google: GOOGLE };

/** The environment variables that may move a provider's endpoints. */
const ENDPOINT_OVERRIDES = [
  "AUTHORIZATION_ENDPOINT",
  "ISSUER",
  "JWKS_URI",
  "TOKEN_ENDPOINT",
] as const;

type Env = Record<string, string | undefined>;

const read = (env: Env, name: string): string => (env[name] ?? "").trim();

/**
 * The provider configuration for `id`, or `null` when it is not configured.
 *
 * **`null` is a supported state, not an error.** There are no Google
 * credentials in development or in CI, and a missing `GOOGLE_CLIENT_ID` must
 * leave the rest of the site working — so the endpoints stay mounted and
 * answer "that sign-in method is unavailable" rather than the config failing
 * to build.
 *
 * ## The endpoint overrides, and why they cannot be set in production
 *
 * `GOOGLE_TOKEN_ENDPOINT`, `GOOGLE_JWKS_URI`, `GOOGLE_ISSUER` and
 * `GOOGLE_AUTHORIZATION_ENDPOINT` point this provider somewhere other than
 * Google. That is what lets `endpoints/oauth.int.test.ts` run the real
 * handler against a real OpenID provider it controls, over real HTTP, with
 * no credentials and no branch in the handler.
 *
 * An environment variable that can move the token endpoint is also an
 * environment variable that can send a client secret — and accept an
 * identity assertion — from somewhere an attacker chose. So it is refused
 * outright when `NODE_ENV` is `production`, the same shape of guard as
 * `seed/guard.ts`. A production Worker uses Google's endpoints or none.
 *
 * They are **all-or-nothing**: a partial override throws rather than
 * silently mixing a fake issuer with Google's real JWKS, which is the
 * combination that would look like it worked.
 */
export function resolveProvider(
  id: string,
  env: Env = process.env
): null | OAuthProvider {
  const defaults = DEFAULTS[id];

  if (defaults === undefined) {
    return null;
  }

  const prefix = id.toUpperCase();
  const clientId = read(env, `${prefix}_CLIENT_ID`);
  const clientSecret = read(env, `${prefix}_CLIENT_SECRET`);

  if (clientId === "" || clientSecret === "") {
    return null;
  }

  const overrides = ENDPOINT_OVERRIDES.map((name) =>
    read(env, `${prefix}_${name}`)
  );

  if (overrides.every((value) => value === "")) {
    return { ...defaults, clientId, clientSecret };
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      `Refusing to override ${id} OAuth endpoints in production. Unset ${ENDPOINT_OVERRIDES.map(
        (name) => `${prefix}_${name}`
      ).join(", ")}.`
    );
  }

  if (overrides.some((value) => value === "")) {
    throw new Error(
      `Partial ${id} OAuth endpoint override. Set all of ${ENDPOINT_OVERRIDES.map(
        (name) => `${prefix}_${name}`
      ).join(", ")} or none of them.`
    );
  }

  const [authorizationEndpoint, issuer, jwksUri, tokenEndpoint] = overrides;

  return {
    ...defaults,
    authorizationEndpoint: authorizationEndpoint as string,
    clientId,
    clientSecret,
    issuers: [issuer as string],
    jwksUri: jwksUri as string,
    tokenEndpoint: tokenEndpoint as string,
  };
}

/** What the endpoint needs out of a verified ID token. */
export interface OAuthIdentity {
  email: string;
  /** The provider's stable, never-reused identifier for the account. */
  subject: string;
}

/**
 * Not exported: `checkClaims`'s return type is inferred at every call site,
 * and knip fails the build on an exported type nothing imports.
 */
type ClaimCheck =
  | { identity: OAuthIdentity; ok: true }
  | { ok: false; reason: "email" | "subject" | "unverified" };

/**
 * True only when the provider positively asserts the address is verified.
 *
 * Both `true` and `"true"` are accepted, because Google has shipped
 * `email_verified` as a JSON string in some responses and as a boolean in
 * others. Everything else — `false`, `"false"`, absent, `1`, `null` — is
 * **not verified**. The default has to be "no": treating a missing claim as
 * a verified address is how an account gets taken over by somebody who
 * registered a lookalike at a provider that never checked their mail.
 */
function assertsVerifiedEmail(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Narrows raw ID-token claims to an identity, or says why it will not.
 *
 * Separated from the signature check so this is a pure function of a claims
 * object: signature verification needs the network and a key, and these
 * rules need neither.
 *
 * **The address must be verified even when no account exists yet.** The plan
 * only demands it for *linking* to an existing password account, which is
 * the account-takeover case. Requiring it for registration too closes the
 * quieter one: an unverified address creates an account holding a name that
 * is not the signer's, and the real owner then cannot register it and cannot
 * be told why without leaking that it is taken.
 */
export function checkClaims(
  claims: Record<string, unknown>,
  provider: OAuthProvider
): ClaimCheck {
  const subject = claims[provider.claims.subject];

  if (typeof subject !== "string" || subject.trim() === "") {
    return { ok: false, reason: "subject" };
  }

  const email = normaliseEmail(claims[provider.claims.email]);

  if (!isEmailShaped(email)) {
    return { ok: false, reason: "email" };
  }

  if (!assertsVerifiedEmail(claims[provider.claims.emailVerified])) {
    return { ok: false, reason: "unverified" };
  }

  return { identity: { email, subject: subject.trim() }, ok: true };
}
