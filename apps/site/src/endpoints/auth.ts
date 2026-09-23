import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import {
  AuthenticationError,
  generateExpiredPayloadCookie,
  generatePayloadCookie,
  headersWithCors,
  loginOperation,
  logoutOperation,
} from "payload";
import { SELF_REGISTRATION } from "@/access";
import {
  homePath,
  isCredentialFailure,
  isEmailShaped,
  localeFromForm,
  normaliseEmail,
  seeOther,
  signInPath,
  signUpPath,
} from "@/lib/authFlow";
import { field, guardOrigin, pad, readForm } from "@/lib/formPost";

/**
 * Sign-in, sign-up and sign-out, as Payload endpoints.
 *
 * ## Why these are not `app/**​/route.ts`
 *
 * Same reason as `endpoints/crawler.ts`, and it is a measurement rather than a
 * preference: a Next route handler that imports Payload becomes its own bundle
 * entry and re-bundles the Payload/D1/drizzle graph into it, measured at
 * **+523.65 KiB gzipped** against roughly 760 KiB of remaining headroom.
 * `app/(payload)/api/[...slug]/route.ts` already carries that graph, so a
 * handler added here costs only the handler. The public paths — `/auth/sign-in`
 * and friends — are rewrites in `next.config.ts`, which are routing-manifest
 * entries and bundle nothing at all.
 *
 * ## Why forms and not Server Actions
 *
 * Either would work, and the cost was measured. These are plain
 * `<form method="post">` posts to a URL, which means the pages need no client
 * JavaScript, no hydration and no `"use client"` boundary, and sign-in works
 * with scripting switched off.
 *
 * ## Every response is a redirect
 *
 * There is deliberately **one** response shape rather than a redirect for
 * browsers and JSON for API clients. The whole value of this file is that
 * three sign-in outcomes are byte-identical and two sign-up outcomes are
 * byte-identical; a second response format is a second place for that
 * property to be true in and a second place for it to quietly stop being
 * true. The JSON surface the native app needs is therefore built here, next
 * to these, and held to the same assertions.
 */

/** The only collection these endpoints will authenticate against. */
const USERS = "users";

/** The paths a `ValidationError` complained about, or `null` if it is not one. */
function validationPaths(error: unknown): null | string[] {
  if (!(error instanceof Error) || error.name !== "ValidationError") {
    return null;
  }

  const data = (error as { data?: { errors?: { path?: unknown }[] } }).data;

  if (!Array.isArray(data?.errors)) {
    return null;
  }

  return data.errors.map((entry) =>
    typeof entry?.path === "string" ? entry.path : ""
  );
}

const signIn: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  try {
    const { token } = await req.payload.login({
      collection: USERS,
      data: {
        email: normaliseEmail(form.get("email")),
        password: field(form, "password"),
      },
    });

    if (token === undefined) {
      // `removeTokenFromResponses` would do this, and a redirect with no
      // cookie would sign nobody in while looking like success.
      throw new Error("login succeeded without issuing a token");
    }

    /*
     * `generatePayloadCookie` rather than a hand-rolled `Set-Cookie`, and
     * that is the fix for the cookie's scope as much as a convenience:
     * `payload/dist/auth/cookies.js` hard-codes `path: '/'` and
     * `httpOnly: true`, and takes `sameSite` and `secure` from the
     * collection's auth config. Every URL on this site is locale-prefixed,
     * so a cookie scoped to the path it was set from — which is what
     * `Set-Cookie: ...` without an explicit `Path` defaults to, the
     * directory of the request URI — would sign the visitor out the moment
     * they switched language, while passing every single-locale test.
     */
    const cookie = generatePayloadCookie({
      collectionAuthConfig: req.payload.collections[USERS].config.auth,
      cookiePrefix: req.payload.config.cookiePrefix,
      token,
    });

    return seeOther(homePath(locale), cookie);
  } catch (error) {
    if (!isCredentialFailure(error)) {
      throw error;
    }

    /*
     * **One answer for every refusal.** Unknown address, wrong password,
     * locked account with the wrong password and locked account with the
     * *right* password all leave here as the same bytes. Payload
     * distinguishes them — it throws `LockedAuth` with "This user is locked
     * due to having too many failed login attempts" for the last two — and an
     * address that was never registered can never lock, so passing that
     * message through would prove the account exists. All four cases were
     * measured against a real database.
     *
     * What that costs: a visitor who really is locked out is told only that
     * the credentials are wrong, with no hint that waiting ten minutes fixes
     * it. The sign-in page therefore tells *everybody* who lands on the error
     * that repeated attempts pause sign-in for a while — advice which is true
     * for the locked visitor, harmless for the one who fat-fingered their
     * password, and useless to an enumerator, because it is on the page for
     * every failure regardless of whether the address exists.
     */
    await pad(started);

    return seeOther(signInPath(locale, { error: "invalid" }));
  }
};

/**
 * The one decision behind both sign-up surfaces: the form POST and
 * `mobileSignUp` below.
 *
 * **This is the whole point of the extraction.** Sign-up's only real
 * property is that a free address and a taken one are indistinguishable to
 * whoever is asking, and a decision that exists in two places is a decision
 * that can agree in one and drift in the other — the same failure mode the
 * header comment on this file argues against for the response *shape*. So
 * "created" and "already registered" are one value, computed once, and each
 * caller only renders it: a redirect here, a JSON body there.
 *
 * Everything below is moved from the previous single-surface `signUp`
 * handler **unchanged** — same guards, same order, same comments. A
 * mutation sweep proved that removing any *two* of `context: {
 * [SELF_REGISTRATION]: true } }`, the field-by-field `data` object, the
 * literal `role: "user"` and `overrideAccess: false` mints an admin, and
 * that removing either one alone changes no answer — which is exactly why
 * none of them may be dropped as redundant here either.
 *
 * **Why `"accepted"` covers both a created account and an address already
 * registered, rather than telling them apart.** Neither renderer signs the
 * caller in on this outcome — see each renderer's own comment — because
 * auto-signing-in a new account would mean the taken-address branch had to
 * answer without a session, which is a one-request oracle no matter how
 * carefully the rest of the response is matched. Verifying by email would be
 * the usual way to tell them apart safely, and sign-up sends no verification
 * mail, so the two stay merged into the one neutral outcome instead.
 */
export async function decideSignUp(
  req: PayloadRequest,
  input: { email: string; password: string }
): Promise<"accepted" | "invalid-email" | "weak-password"> {
  const { email, password } = input;

  if (!isEmailShaped(email)) {
    return "invalid-email";
  }

  try {
    /*
     * **Two guards against an anonymous POST minting an admin, and neither
     * one is redundant — but only the pair is provable.**
     *
     * The first is the `data` object: it is built field by field from named
     * inputs, so nothing the form carries that is not `email` or `password`
     * reaches Payload. `role` appears only because it is `required` and
     * therefore required by the generated `User` type; the literal `"user"`
     * is the value, never the submitted one.
     *
     * The second is `overrideAccess: false`, which runs the *public* create
     * path rather than the Local API's privileged default. `users.access.create`
     * is `() => true` by design, but `role` carries a field-level
     * `create: isAdminField`, so an anonymous create cannot set it whatever
     * the data says.
     *
     * A mutation sweep proved that **removing either one alone changes no
     * answer** — with the literal in place, `overrideAccess: true` still
     * stores `"user"`; with `overrideAccess: false` in place, spreading the
     * form still has `role` stripped — and that **removing both is caught**,
     * loudly, by `cannot be used to mint an admin`. That is the same
     * belt-and-braces shape as `lib/sharedList.ts`, kept for the same
     * reason: each half stops being decorative the day the other is loosened
     * for an unrelated reason.
     */
    await req.payload.create({
      collection: USERS,
      /*
       * The third guard, and the one that closed the REST oracle:
       * `users.access.create` is no longer `() => true`, so this is the only
       * anonymous path that may create a user. `createPayloadRequest` sets
       * `context: {}` for every REST and GraphQL request, so nothing
       * arriving over the network can forge this — see `access/index.ts`.
       */
      context: { [SELF_REGISTRATION]: true },
      data: { email, password, role: "user" },
      overrideAccess: false,
    });
  } catch (error) {
    const paths = validationPaths(error);

    if (paths === null) {
      throw error;
    }

    if (paths.includes("password")) {
      /*
       * Safe to report, and it has to be: the visitor cannot fix a password
       * they are not told is unacceptable. It leaks nothing, because
       * `hooks/enforcePasswordPolicy` is a `beforeValidate` hook and runs
       * *before* the uniqueness check — so a weak password produces exactly
       * this answer whether or not the address is already registered.
       */
      return "weak-password";
    }

    if (!paths.every((path) => path === "email")) {
      throw error;
    }

    /*
     * An `email`-path validation error, with the format already screened
     * above, is "that address is already registered" — and this is the one
     * branch that must be invisible. It falls through to the same outcome
     * the successful path returns.
     */
  }

  return "accepted";
}

const signUp: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  const outcome = await decideSignUp(req, {
    email: normaliseEmail(form.get("email")),
    password: field(form, "password"),
  });

  await pad(started);

  if (outcome === "invalid-email") {
    return seeOther(signUpPath(locale, { error: "email" }));
  }

  if (outcome === "weak-password") {
    return seeOther(signUpPath(locale, { error: "password" }));
  }

  /*
   * Both a created account and an address already registered land here, and
   * **sign-up does not sign you in** — see the note this comment was
   * extracted from. Auto-signing-in would make the taken-address branch
   * answer without a session, which is a one-request oracle no matter how
   * carefully the body is matched.
   */
  return seeOther(signInPath(locale, { notice: "registered" }));
};

const signOut: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  /*
   * Not padded. Sign-out reveals nothing about which addresses exist — it
   * acts on the caller's own cookie — so the half-second would be spent for
   * nothing.
   */
  if (req.user?.collection === USERS) {
    try {
      await logoutOperation({
        allSessions: false,
        collection: req.payload.collections[USERS],
        req,
      });
    } catch (error) {
      /*
       * Revoking the session server-side failed. Expiring the cookie anyway
       * is strictly better than answering 500: the visitor asked to be signed
       * out, and a 500 leaves them holding a live cookie and believing they
       * are not. The session row outlives its cookie and expires with the
       * token.
       */
      req.payload.logger.error(
        { err: error },
        "[auth] Failed to revoke the session on sign-out"
      );
    }
  }

  const expired = generateExpiredPayloadCookie({
    collectionAuthConfig: req.payload.collections[USERS].config.auth,
    cookiePrefix: req.payload.config.cookiePrefix,
  });

  return seeOther(homePath(locale), expired);
};

/**
 * The body of a POST, as a plain object, in every shape Payload accepts.
 *
 * ## Why this function exists at all
 *
 * Custom endpoints do not get `req.data`. `wrapInternalEndpoints`
 * (`payload/dist/utilities/wrapInternalEndpoints.js`) is what calls
 * `addDataAndFileToRequest`, and it wraps only Payload's *own* endpoints —
 * so a collection endpoint that shadows one of them has to read its own
 * body. Verified at the call site; the first version of this handler
 * silently saw `undefined` for every field.
 *
 * ## `multipart/form-data` with a `_payload` field is not an edge case
 *
 * **It is how the admin panel logs in.** Payload's own `Form` submits
 * `multipart/form-data` carrying the JSON body in a single `_payload` field,
 * which `addDataAndFileToRequest` unpacks
 * (`fields?._payload && typeof fields._payload === 'string'`). An earlier
 * version of this handler read `application/json` and
 * `application/x-www-form-urlencoded` only — every integration test passed,
 * `curl` with `-H 'Content-Type: application/json'` passed, and **the admin
 * panel could not sign in**, because it posted a shape nothing here read and
 * got "the email or password provided is incorrect" for correct credentials.
 * Found by a browser, not by a test; `signs in a request shaped the way the
 * admin panel posts it` is the test that would have found it.
 *
 * Files are deliberately not handled: this parses bodies for the login
 * endpoint, and a login carries no upload.
 *
 * Exported for `endpoints/mobileSession.ts`, which needs the same
 * JSON/form/multipart tolerance for its own JSON-only client and has no
 * reason to reimplement it.
 */
export async function readBody(
  req: PayloadRequest
): Promise<Record<string, unknown>> {
  const [type] = (req.headers.get("content-type") ?? "").split(";", 1);

  try {
    if (type === "application/json") {
      return (await req.json?.()) as Record<string, unknown>;
    }

    if (type === "application/x-www-form-urlencoded") {
      return Object.fromEntries(await readForm(req));
    }

    if (type?.startsWith("multipart/")) {
      const form = await readForm(req);
      const embedded = form.get("_payload");

      return typeof embedded === "string"
        ? (JSON.parse(embedded) as Record<string, unknown>)
        : Object.fromEntries(form);
    }
  } catch {
    return {};
  }

  return {};
}

/**
 * `POST /api/users/login`, shadowing Payload's own.
 *
 * ## Why this exists
 *
 * Closing email enumeration on `/auth/sign-in` left the site as deployed still
 * leaking, because `app/(payload)/api/[...slug]/route.ts` mounts Payload's REST
 * API and its `loginHandler` answers a locked account with "This user is locked
 * due to having too many failed login attempts." An address that was never
 * registered can never lock, so that sentence is a one-request proof that an
 * account exists — the exact leak `/auth/sign-in` was changed to close, still
 * wide open one path over. Reproduced against a running dev server before this
 * was written.
 *
 * ## Why shadowing works
 *
 * `collections/config/sanitize.js` pushes `authCollectionEndpoints` onto
 * whatever the collection already declares, and `handleEndpoints` takes the
 * **first** match — so a `post /login` declared on `Users` wins over
 * Payload's. The mechanism is verified; this is the use of it.
 *
 * ## What it costs, stated plainly
 *
 * **The admin panel no longer tells an admin their account is locked.** They
 * see "The email or password provided is incorrect." and are left to work
 * out that waiting ten minutes fixes it. That is a real regression in
 * operator experience, and it is the price of the property: a message only a
 * registered address can provoke is a registered-address oracle whoever is
 * reading it. The public sign-in page states the lockout rule to everybody
 * for this reason; `/admin` is Payload's own screen and cannot.
 *
 * ## What is reimplemented, and what is not
 *
 * The success path mirrors `payload/dist/auth/endpoints/login.js` because
 * that file cannot be imported — `payload`'s `exports` map publishes only
 * `.`, `./internal`, `./node`, `./shared`, `./i18n/*` and `./migrations`, so
 * a deep import into `dist` does not resolve. Everything it needs —
 * `loginOperation`, `generatePayloadCookie`, `headersWithCors` — is exported
 * from the package root, so nothing here reaches past a public API.
 *
 * The failure path is *not* reimplemented: it throws a real
 * `AuthenticationError` and lets `handleEndpoints`' own `routeError` format
 * it. That is what makes the locked answer byte-identical to the
 * unknown-address answer rather than merely similar — the same code produces
 * both.
 */
const usersLogin: PayloadHandler = async (req) => {
  const started = Date.now();
  const collection = req.payload.collections[USERS];
  const body = await readBody(req);
  const depth = Number(req.searchParams.get("depth"));

  try {
    const result = await loginOperation({
      collection,
      data: {
        email: typeof body.email === "string" ? body.email : "",
        password: typeof body.password === "string" ? body.password : "",
      },
      depth: Number.isFinite(depth) ? depth : undefined,
      req,
    });

    if (result.token === undefined) {
      // Same guard as `signIn` above: a 200 with no cookie signs nobody in
      // while looking exactly like success.
      throw new Error("login succeeded without issuing a token");
    }

    const cookie = generatePayloadCookie({
      collectionAuthConfig: collection.config.auth,
      cookiePrefix: req.payload.config.cookiePrefix,
      token: result.token,
    });

    const { token: _token, ...withoutToken } = result;
    const payloadBody = collection.config.auth.removeTokenFromResponses
      ? withoutToken
      : result;

    return Response.json(
      { message: req.t("authentication:passed"), ...payloadBody },
      {
        headers: headersWithCors({
          headers: new Headers({ "Set-Cookie": cookie }),
          req,
        }),
        status: 200,
      }
    );
  } catch (error) {
    if (!isCredentialFailure(error)) {
      throw error;
    }

    /*
     * The same floor as `/auth/sign-in`, and for the same measured reason:
     * `checkLoginPermission` runs before `authenticateLocalStrategy`, so an
     * unknown address and a locked account answer without touching PBKDF2
     * while a wrong password pays 25,000 iterations. Flattening the message
     * without flattening the timing would leave the oracle intact and only
     * make it slightly less obvious.
     */
    await pad(started);

    throw new AuthenticationError(req.t);
  }
};

/**
 * `POST /api/mobile/sign-up` — the JSON sign-up surface the native
 * app needs, and the second (and only other) renderer over
 * {@link decideSignUp}.
 *
 * `/mobile/sign-up` is a **flat sibling**, not `/auth/sign-up/json` or
 * anything nested under `/auth/sign-up`. Same reasoning as
 * `endpoints/lists.ts` gives for `/account/confirm-email`: overlapping
 * endpoint patterns leave Payload's matcher (`handleEndpoints`, first match
 * wins) to choose between them, and the wrong choice here answers
 * "accepted" without accepting anything.
 *
 * Reads the body with `readBody` rather than `readForm`, because a native
 * client posts `application/json` and `readForm` only ever parses form
 * bodies. Everything after that — the origin guard, the timing floor, the
 * shared decision — is identical in spirit to `signUp` above; only the
 * rendering differs, which is the entire point of the extraction.
 */
const mobileSignUp: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const body = await readBody(req);

  const outcome = await decideSignUp(req, {
    email: normaliseEmail(typeof body.email === "string" ? body.email : ""),
    password: typeof body.password === "string" ? body.password : "",
  });

  await pad(started);

  return Response.json(
    { status: outcome },
    {
      headers: headersWithCors({
        headers: new Headers({ "Cache-Control": "no-store" }),
        req,
      }),
      status: outcome === "accepted" ? 200 : 400,
    }
  );
};

/**
 * Endpoints declared on the `users` collection itself.
 *
 * One entry, and it deliberately shadows a built-in. Kept here rather than
 * inline in `collections/Users.ts` so the reasoning sits next to the sign-in
 * endpoint it has to stay identical to.
 */
export const usersCollectionEndpoints: Endpoint[] = [
  { handler: usersLogin, method: "post", path: "/login" },
];

export const authEndpoints: Endpoint[] = [
  { handler: signIn, method: "post", path: "/auth/sign-in" },
  { handler: signUp, method: "post", path: "/auth/sign-up" },
  { handler: signOut, method: "post", path: "/auth/sign-out" },
];

/**
 * The one endpoint the native app adds to this file. See `mobileSignUp`'s
 * own comment for why it lives at a flat path, and `decideSignUp`'s for why
 * it shares a decision with the form endpoint above rather than
 * reimplementing it.
 */
export const mobileAuthEndpoints: Endpoint[] = [
  { handler: mobileSignUp, method: "post", path: "/mobile/sign-up" },
];
