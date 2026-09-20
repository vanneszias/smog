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
  isTrustedOrigin,
  localeFromForm,
  normaliseEmail,
  remainingPad,
  seeOther,
  signInPath,
  signUpPath,
} from "@/lib/authFlow";

/**
 * Sign-in, sign-up and sign-out, as Payload endpoints.
 *
 * ## Why these are not `app/**​/route.ts`
 *
 * Same reason as `endpoints/crawler.ts`, and it is a measurement rather than
 * a preference: a Next route handler that imports Payload becomes its own
 * bundle entry and re-bundles the Payload/D1/drizzle graph into it, measured
 * at **+523.65 KiB gzipped** during Stage 3 Task 9 against roughly 760 KiB of
 * remaining headroom. `app/(payload)/api/[...slug]/route.ts` already carries
 * that graph, so a handler added here costs only the handler. The public
 * paths — `/auth/sign-in` and friends — are rewrites in `next.config.ts`,
 * which are routing-manifest entries and bundle nothing at all.
 *
 * ## Why forms and not Server Actions
 *
 * The plan allows either and demands the cost be measured. These are plain
 * `<form method="post">` posts to a URL, which means the pages need no client
 * JavaScript, no hydration and no `"use client"` boundary, and sign-in works
 * with scripting switched off. The measurement is in the task report.
 *
 * ## Every response is a redirect
 *
 * There is deliberately **one** response shape rather than a redirect for
 * browsers and JSON for API clients. The whole value of this file is that
 * three sign-in outcomes are byte-identical and two sign-up outcomes are
 * byte-identical; a second response format is a second place for that
 * property to be true in and a second place for it to quietly stop being
 * true. When a JSON surface is needed — the Stage 8 native app — it should be
 * built here, next to these, and held to the same assertions.
 */

/** The only collection these endpoints will authenticate against. */
const USERS = "users";

/**
 * Reads the submitted form, tolerating a request that has none.
 *
 * `req.formData()` rejects on an empty or unparseable body, and a POST with
 * no body is something a probe does constantly. An empty `FormData` sends it
 * down the ordinary "those credentials are wrong" path instead of a 500.
 */
async function readForm(req: PayloadRequest): Promise<FormData> {
  /*
   * `PayloadRequest` types `formData` as optional — it is the Fetch `Request`
   * method, and Payload does not promise every host provides it — so the
   * guard is a typecheck requirement as much as a runtime one.
   */
  if (typeof req.formData !== "function") {
    return new FormData();
  }

  try {
    return await req.formData();
  } catch {
    return new FormData();
  }
}

function field(form: FormData, name: string): string {
  const value = form.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * Holds the response until {@link AUTH_FLOOR_MS} has passed since `started`.
 *
 * See `lib/authFlow.ts` for the measurements that make this necessary: the
 * unpadded answers separate "registered" from "not registered" in a single
 * request.
 */
function pad(started: number): Promise<void> {
  const wait = remainingPad(Date.now() - started);

  return new Promise((resolve) => setTimeout(resolve, wait));
}

/** 403 for a cross-site POST. Not a redirect: nothing here should be retried. */
function crossSite(): Response {
  return new Response("Cross-site request refused.", {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
    status: 403,
  });
}

function guardOrigin(req: PayloadRequest): null | Response {
  const trusted = isTrustedOrigin({
    origin: req.headers.get("origin"),
    requestOrigin: req.origin ?? "",
  });

  return trusted ? null : crossSite();
}

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
     * that is the fix for Review Focus item 1 as much as a convenience:
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
     * message through would prove the account exists. Task 1 measured all
     * four cases against a real database; the table is in its report.
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

const signUp: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const email = normaliseEmail(form.get("email"));

  if (!isEmailShaped(email)) {
    await pad(started);

    return seeOther(signUpPath(locale, { error: "email" }));
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
     * for an unrelated reason, and `access.create` is explicitly slated to
     * be revisited in this stage. Transcripts in the Task 2 report, S1–S3.
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
      data: { email, password: field(form, "password"), role: "user" },
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
      await pad(started);

      return seeOther(signUpPath(locale, { error: "password" }));
    }

    if (!paths.every((path) => path === "email")) {
      throw error;
    }

    /*
     * An `email`-path validation error, with the format already screened
     * above, is "that address is already registered" — and this is the one
     * branch that must be invisible. It falls through to the same response
     * the successful path returns. Review Focus item 5.
     */
  }

  /*
   * **Sign-up does not sign you in**, and that is what makes the two outcomes
   * identical rather than merely similar. Auto-signing-in a new account would
   * mean the taken-address branch had to answer without a session, which a
   * browser shows as landing signed-out — a one-request oracle no matter how
   * carefully the body is matched. Verifying by email would be the usual way
   * out, and this app has no email adapter (Stage 0), so the neutral landing
   * is the sign-in page with a notice that says "if that address was free,
   * your account is ready".
   */
  await pad(started);

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
 */
async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
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
 * Task 2 closed email enumeration on `/auth/sign-in` and reported that the
 * site as deployed still leaked, because `app/(payload)/api/[...slug]/route.ts`
 * mounts Payload's REST API and its `loginHandler` answers a locked account
 * with "This user is locked due to having too many failed login attempts."
 * An address that was never registered can never lock, so that sentence is a
 * one-request proof that an account exists — the exact leak `/auth/sign-in`
 * was changed to close, still wide open one path over. Reproduced against a
 * running dev server before this was written; the transcript is in the Task 3
 * report.
 *
 * ## Why shadowing works
 *
 * `collections/config/sanitize.js` pushes `authCollectionEndpoints` onto
 * whatever the collection already declares, and `handleEndpoints` takes the
 * **first** match — so a `post /login` declared on `Users` wins over
 * Payload's. Task 2 verified the mechanism; this is the use of it.
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
