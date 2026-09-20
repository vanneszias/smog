import { type Locale, resolveLocale } from "./locale";

/**
 * The floor, in milliseconds, that every sign-in failure and *both* sign-up
 * outcomes are padded out to.
 *
 * ## Why this number exists at all
 *
 * Payload answers the three sign-in cases at wildly different speeds, because
 * `checkLoginPermission` runs **before** `authenticateLocalStrategy`
 * (`payload/dist/auth/operations/login.js`): an unknown address and a locked
 * account both throw before PBKDF2 is ever reached, while a wrong password on
 * a live account pays all 25,000 iterations first. Measured against this
 * project's real database, 25 samples each:
 *
 * | case | median | min | max |
 * |---|---:|---:|---:|
 * | unknown address | 10.51 ms | 7.82 | 20.39 |
 * | wrong password, live account | 76.74 ms | 71.07 | **94.08** |
 * | locked account (either password) | 7.89 ms | 7.18 | 31.42 |
 * | sign-up, fresh address | 82.65 ms | 80.14 | **101.33** |
 * | sign-up, address already taken | 8.29 ms | 7.62 | 9.02 |
 *
 * The two distributions **do not overlap**: the slowest unknown-address
 * answer came back faster than the fastest wrong-password answer. That is not
 * a statistical side channel needing thousands of samples to exploit — it is a
 * single-request classifier for "is this address registered", which is exactly
 * what Review Focus item 5 forbids. Flattening the `LockedAuth` *message* in
 * `endpoints/auth.ts` closes the body half of the leak and leaves this half
 * wide open, so both are closed together.
 *
 * ## Why a floor rather than a dummy hash
 *
 * The other standard fix is to hash a throwaway password whenever the account
 * is missing or locked, so the expensive term is paid either way. It is a
 * better fix in principle — it tracks the platform instead of a number
 * someone measured once — but it cannot be reached from here: the branch is
 * inside `loginOperation`, which this app calls rather than reimplements, and
 * reimplementing Payload's login to insert a decoy hash is a much larger and
 * more dangerous change than a wrapper that waits.
 *
 * ## Why 500
 *
 * Five times the slowest measured answer (101.33 ms), so the floor is not
 * grazed by an unlucky request — and a floor that the real work overruns is a
 * floor that leaks on exactly those requests. It is wall-clock, not CPU:
 * Cloudflare bills Workers for CPU time, and a pending timer costs none. The
 * price is half a second on a mistyped password and on every sign-up, which
 * is smaller than the navigation it is attached to.
 *
 * Re-measure this if the KDF, the database or the runtime changes. The
 * measurement lives in `.superpowers/sdd/2026-09-20-stage-4-auth/task-2-report.md`.
 */
export const AUTH_FLOOR_MS = 500;

/** How much longer a response must be held to reach {@link AUTH_FLOOR_MS}. */
export function remainingPad(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return AUTH_FLOOR_MS;
  }

  return Math.max(0, AUTH_FLOOR_MS - elapsedMs);
}

/**
 * The error classes Payload raises that mean "these credentials are not
 * good", as opposed to "something broke".
 *
 * Matched by `name` rather than with `instanceof` so this module stays free
 * of a runtime `payload` import and can be unit-tested under jsdom. That is
 * safe because `APIError`'s base class assigns `this.name =
 * this.constructor.name` (`payload/dist/errors/APIError.js`), so the name is
 * the class name and not a hand-written string that could drift from it.
 * `endpoints/auth.int.test.ts` asserts each of these against a real
 * instance of the corresponding Payload class, so a rename in a dependency
 * bump fails a test rather than silently turning every sign-in into a 500.
 *
 * Everything not on this list is rethrown. A D1 outage must not be reported
 * to the visitor as "the email or password is incorrect": that is a lie, it
 * sends them to reset a password that was fine, and it hides the outage.
 */
const CREDENTIAL_FAILURES = new Set([
  "AuthenticationError",
  "Forbidden",
  "LockedAuth",
  "UnverifiedEmail",
  "ValidationError",
]);

/**
 * True when the error means the submitted credentials were refused.
 *
 * **`LockedAuth` is deliberately in the same bucket as `AuthenticationError`.**
 * That is the whole point: Payload answers a locked account with "This user is
 * locked due to having too many failed login attempts", and an address that
 * was never registered can never lock, so that sentence proves the account
 * exists. Collapsing the classes here is what makes the six-failures response
 * byte-identical to the unknown-address one.
 */
export function isCredentialFailure(error: unknown): boolean {
  return error instanceof Error && CREDENTIAL_FAILURES.has(error.name);
}

/**
 * Payload's own email regex, copied from
 * `payload/dist/fields/validations.js` (3.89.0) rather than approximated.
 *
 * It has to be *this* expression and not a looser one. Sign-up cannot
 * distinguish "that address is already registered" from "your account is
 * ready" — that distinction is the enumeration leak — so the endpoint treats
 * every `email`-path validation error Payload raises as the neutral outcome.
 * If this check accepted an address Payload's own validator rejects, the
 * visitor would be told to go and sign in to an account that was never
 * created. Screening the format here, with the same rule, is what keeps the
 * only surviving `email`-path error the uniqueness one.
 *
 * Re-check it on a Payload upgrade; `endpoints/auth.int.test.ts` pins the
 * agreement against a real `payload.create`.
 */
const EMAIL_PATTERN =
  /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/** Normalises an address the way Payload's login operation does. */
export function normaliseEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isEmailShaped(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

/**
 * Whether a state-changing request came from this site.
 *
 * `SameSite=Lax` — Payload's default, confirmed in
 * `collections/config/defaults.js` — already keeps the session cookie off a
 * cross-site POST, which covers sign-out. It does **not** cover login CSRF:
 * signing a visitor into an account the attacker controls needs no cookie of
 * the victim's at all, and from then on everything they save lands in the
 * attacker's account.
 *
 * Absent `Origin` is allowed. Browsers send it on every POST — that is the
 * case this guard is for — and an attacker cannot make a browser omit it.
 * Refusing requests without one would only lock out non-browser clients
 * (`curl`, the integration tests, a future native app) while blocking nothing.
 */
export function isTrustedOrigin({
  origin,
  requestOrigin,
}: {
  origin: null | string;
  requestOrigin: string;
}): boolean {
  if (origin === null || origin === "") {
    return true;
  }

  return origin === requestOrigin;
}

/** The locale-prefixed home page. */
export function homePath(locale: Locale): string {
  return `/${locale}`;
}

/**
 * The codes a form page may be sent back with.
 *
 * Codes rather than messages, so the page owns the wording and nothing a
 * visitor is shown can be dictated by whoever wrote the link they followed.
 * A `?error=` carrying free text is a phishing surface even when React
 * escapes it.
 */
type SignInError =
  | "invalid"
  /** The OAuth flow was refused. One code for every reason it can be. */
  | "oauth"
  /** No client credentials are configured for that provider. */
  | "oauth-unavailable"
  /**
   * The provider would not assert that the address is verified.
   *
   * Separate from `oauth` because it is the one OAuth refusal the visitor
   * can act on, and because it says nothing about this site: it is a fact
   * about their account at the provider, returned identically whether or
   * not an account exists here.
   */
  | "oauth-unverified";
type SignUpError = "email" | "password";
type SignInNotice = "registered";

export function signInPath(
  locale: Locale,
  query?: { error?: SignInError; notice?: SignInNotice }
): string {
  return withQuery(`/${locale}/sign-in`, query);
}

export function signUpPath(locale: Locale, query?: { error?: SignUpError }) {
  return withQuery(`/${locale}/sign-up`, query);
}

function withQuery(
  path: string,
  query: Record<string, string | undefined> | undefined
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }

  const search = params.toString();

  return search === "" ? path : `${path}?${search}`;
}

/**
 * The redirect every one of these endpoints answers with.
 *
 * **303 and not 302.** A browser following a 302 after a POST is only
 * allowed by convention to switch to GET; 303 says so normatively, and
 * `fetch`-based clients follow the letter. Getting it wrong means the browser
 * re-POSTs the credentials at the page it lands on.
 *
 * **`Cache-Control: no-store` on every one of them**, including the failures.
 * These responses carry `Set-Cookie`, and a shared cache that stored one
 * would hand somebody else's session to the next visitor.
 */
export function seeOther(
  location: string,
  setCookie?: string | string[]
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Location: location,
  });

  /*
   * `append`, not `set`, and an array rather than a joined string: the OAuth
   * callback has to clear its `state` cookie *and* set a session cookie on
   * the same response. `Set-Cookie` is the one header a comma cannot join —
   * a cookie value may contain one — so two cookies are two header lines,
   * which is what `Headers.append` emits and what `getSetCookie()` reads
   * back.
   */
  for (const cookie of typeof setCookie === "string"
    ? [setCookie]
    : (setCookie ?? [])) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(null, { headers, status: 303 });
}

/** Narrows a form field to the locale it names, falling back to the default. */
export function localeFromForm(value: unknown): Locale {
  return resolveLocale(typeof value === "string" ? value : undefined);
}
