import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import {
  generateExpiredPayloadCookie,
  headersWithCors,
  logoutOperation,
} from "payload";
import { readBody } from "@/endpoints/auth";
import { SEND_EMAIL } from "@/jobs/sendEmail";
import {
  accountPath,
  confirmEmailPath,
  isCredentialFailure,
  isEmailShaped,
  localeFromForm,
  normaliseEmail,
  seeOther,
  signInPath,
} from "@/lib/authFlow";
import { sha256Hex } from "@/lib/emailChange";
import { field, guardOrigin, pad, readForm } from "@/lib/formPost";
import { type Locale, resolveLocale } from "@/lib/locale";
import type { User } from "@/payload-types";

/**
 * The account page's four writes: change password, ask to change the address,
 * confirm the address, delete the account.
 *
 * ## Two renderers over three shared decisions
 *
 * `decideChangePassword`, `decideRequestEmailChange` and
 * `decideDeleteAccount` are each called from two places: the form handler
 * below it (unchanged behaviour — same guard, same order, same redirects,
 * proven by `account.int.test.ts`, unedited) and its `mobile*` twin near the
 * bottom of this file, which renders the identical decision as a JSON body
 * for the Stage 8 native app instead of a 303. `confirmEmailChange` has no
 * such twin: the link it confirms is a web URL mailed to the visitor, and
 * confirming it in a browser is correct — there is nothing for a mobile
 * renderer to add. Same shape as `endpoints/lists.ts`'s `decideCreateList`
 * and friends, for the same reason: one answer computed once, rendered
 * twice, rather than a second implementation that can drift from the first.
 *
 * **The timing floor travels with the decision, not with either renderer.**
 * `decideChangePassword` and `decideRequestEmailChange` take `started` and
 * call `pad(started)` themselves on every branch that compares a secret —
 * exactly where the un-extracted handlers used to — so a JSON caller is held
 * to the same 500 ms floor as a browser. `decideDeleteAccount` takes no
 * `started` and pads nothing, matching that handler's own original comment:
 * nothing on that path depends on a secret the answer could leak, because it
 * acts on the caller's own account and the confirmation is compared against
 * an address the caller already knows.
 *
 * ## Why these are endpoints and not `app/**​/route.ts`
 *
 * The same measurement as `endpoints/auth.ts`, `endpoints/favorites.ts` and
 * `endpoints/crawler.ts`: a Next route handler that imports Payload becomes
 * its own bundle entry and re-bundles the Payload/D1/drizzle graph into it,
 * measured at **+519 KiB gzipped** against roughly 725 KiB of remaining
 * headroom. `app/(payload)/api/[...slug]/route.ts` already carries that
 * graph, so a handler hung off it costs only the handler, and the public
 * paths are rewrites in `next.config.ts`, which bundle nothing.
 *
 * ## Why forms, and why every answer is a redirect
 *
 * Same as the auth endpoints, and it matters more here: the account page has
 * no client JavaScript at all, so deleting an account cannot be guarded by a
 * `confirm()` — and should not be anyway. The confirmation is a text input
 * the visitor has to type their own address into, which survives a reload, a
 * screen reader, a script blocker and a mis-click, none of which a modal
 * dialog does.
 *
 * ## What is shared with `endpoints/auth.ts`, on purpose
 *
 * The `Origin` check, the `readForm` tolerance and the 500 ms floor all come
 * from `lib/formPost.ts` rather than being written again here. Every handler
 * below is a state-changing POST carrying a session cookie, so every one of
 * them needs all three; a second implementation is a second place for one of
 * them to stop being true.
 */

/** The only collection these endpoints act on. */
const USERS = "users";

/**
 * How long a pending address change stays confirmable.
 *
 * One hour, which is Payload's own lifetime for a `forgotPassword` token
 * (`auth/operations/forgotPassword.js` writes
 * `resetPasswordExpiration = Date.now() + 3600000`). Matching it is not
 * imitation: both are "you asked for this a moment ago, prove you read the
 * mailbox", and a link that outlives the intent is a link sitting in an
 * archived mailbox long after the person forgot they asked. A lapsed link
 * costs one more request and one more password entry.
 */
const CONFIRM_TTL_MS = 60 * 60 * 1000;

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

/** The signed-in account, or `null`. */
function signedInUser(req: PayloadRequest): null | User {
  /*
   * Narrowed on the slug, not on truthiness, for the same reason
   * `lib/session.ts` and `endpoints/favorites.ts` do it: `req.user` is
   * whichever auth collection the token named, and a second one added later
   * must not start rewriting `users` rows.
   *
   * **A mutation sweep confirmed this is unprovable today, and it stays.**
   * Loosening it to `req.user ?? null` failed nothing, because this app has
   * exactly one auth collection, so no request can produce a user whose
   * `collection` is anything else — the two forms are the same function
   * until a second one exists. That is the day the guard earns its place,
   * and the day nobody will be looking for it. Transcript M7 in the Task 5
   * report.
   */
  return req.user?.collection === USERS ? (req.user as User) : null;
}

/**
 * Re-authenticates the visitor by their current password.
 *
 * ## Why `payload.login` and not a bare hash comparison
 *
 * Payload does not export `authenticateLocalStrategy`, and reaching into
 * `dist` does not resolve — the package publishes only `.`, `./internal`,
 * `./node`, `./shared`, `./i18n/*` and `./migrations`. What that constraint
 * buys is better than what it costs: going through the real login operation
 * means this check is **rate limited by the same lockout as the sign-in
 * form** (`maxLoginAttempts: 5`, `lockTime: 10 minutes` — see
 * `collections/Users.ts`), and that `loginAttempts` is reset on success. A
 * hand-rolled comparison would be an unlimited password oracle for anybody
 * holding a borrowed session cookie, which is precisely the attacker this
 * check exists to stop.
 *
 * `req` is deliberately **not** passed. `loginLocal` feeds it to
 * `createLocalReq` and `loginOperation` then assigns `req.user`, so sharing
 * the request would swap the caller's resolved session — including its
 * `_sid` — for a freshly minted one underneath the handler.
 *
 * **What it costs, stated plainly:** a successful check mints a session row
 * in `users.sessions` that nobody holds a token for. `/account/password`
 * clears the array immediately afterwards, so only `/account/email` leaves
 * one — inert, and pruned by `addSessionToUser` once it passes
 * `tokenExpiration`. Avoiding it would mean reimplementing Payload's login
 * to skip `addSessionToUser`, which is a much larger and more dangerous
 * change than an expiring row.
 *
 * ## What the caller must do with `false`
 *
 * Answer exactly as it would for any other refusal. `isCredentialFailure`
 * folds `LockedAuth` in with `AuthenticationError` on purpose, the same way
 * `/auth/sign-in` does: Payload's locked message is a sentence only a real
 * account can provoke, and here it would additionally tell an attacker with
 * a stolen cookie precisely when their guessing budget refills.
 */
async function currentPasswordAccepted(
  req: PayloadRequest,
  user: User,
  password: string
): Promise<boolean> {
  try {
    await req.payload.login({
      collection: USERS,
      data: { email: user.email, password },
    });

    return true;
  } catch (error) {
    if (!isCredentialFailure(error)) {
      throw error;
    }

    return false;
  }
}

/** The expired session cookie every sign-you-out answer carries. */
function expiredCookie(req: PayloadRequest): string {
  return generateExpiredPayloadCookie({
    collectionAuthConfig: req.payload.collections[USERS].config.auth,
    cookiePrefix: req.payload.config.cookiePrefix,
  });
}

/** Where a signed-out caller is sent, whatever they were trying to do. */
function signedOut(locale: Locale): Response {
  return seeOther(signInPath(locale));
}

/** What `changePassword` and `mobileChangePassword` both answer. */
type ChangePasswordOutcome =
  | { status: "signed-out" }
  /** `credentials`: the current password was refused, or the account is
   * locked. `password`: the new password did not clear the policy. */
  | { status: "invalid"; field: "credentials" | "password" }
  | { status: "changed" };

/**
 * The one decision behind both change-password surfaces. See the module
 * comment above for why `started` is a parameter rather than measured
 * inside: both renderers set it at the same point (right after
 * `guardOrigin`, before the body is read) and hand it in unchanged.
 */
async function decideChangePassword(
  req: PayloadRequest,
  started: number,
  input: { current: string; next: string }
): Promise<ChangePasswordOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  if (!(await currentPasswordAccepted(req, user, input.current))) {
    await pad(started);

    return { field: "credentials", status: "invalid" };
  }

  try {
    /*
     * `overrideAccess: false` and the account's own user, so this runs the
     * same access path a `PATCH /api/users/:id` would. `isAdminOrSelf`
     * allows it; `role` and `oauthAccounts` are admin-only at field level,
     * so even if this data object grew a stray key it could not escalate.
     *
     * The new password is validated by `hooks/enforcePasswordPolicy`, which
     * `payload.update` runs as a `beforeValidate` hook before the local
     * strategy hashes anything. That is why this handler does not screen the
     * password itself: one floor, in one place, applied by whichever
     * operation is writing.
     */
    await req.payload.update({
      collection: USERS,
      data: { password: input.next },
      depth: 0,
      id: user.id,
      overrideAccess: false,
      user,
    });
  } catch (error) {
    const paths = validationPaths(error);

    if (paths === null || !paths.includes("password")) {
      throw error;
    }

    /*
     * Safe to report, and it has to be: the visitor cannot fix a password
     * they are not told is unacceptable. It reveals nothing — the account is
     * already known to whoever is posting — and it is a different code from
     * `credentials` because the two are fixed in different boxes on the
     * page.
     */
    await pad(started);

    return { field: "password", status: "invalid" };
  }

  /*
   * **Changing the password ends every session, including this one.** A
   * password is changed for two reasons: it leaked, or somebody else has
   * been using it. Both mean the sessions opened with the old one have to
   * stop working, and `logoutOperation({ allSessions: true })` empties
   * `users.sessions`, which `JWTAuthentication` checks the `sid` against on
   * every request (`payload/dist/auth/strategies/jwt.js`) — so a cookie held
   * on another device stops resolving immediately rather than at its own
   * expiry. `auth/googleStrategy.ts` writes its sessions into the same
   * array and checks them the same way, so a Google session is revoked too.
   *
   * The order is deliberate, because **nothing rolls back** here: the
   * password is written first and the revocation second. The other order
   * risks signing everybody out of an account whose password did not
   * change. This way the worst case is a changed password with stale
   * sessions still live, which the visitor can fix by changing it again —
   * and the cookie (or, for the mobile renderer, the token) is invalid
   * regardless.
   */
  await logoutOperation({
    allSessions: true,
    collection: req.payload.collections[USERS],
    req,
  });

  await pad(started);

  return { status: "changed" };
}

const changePassword: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  const outcome = await decideChangePassword(req, started, {
    current: field(form, "current"),
    next: field(form, "next"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "invalid") {
    return seeOther(accountPath(locale, { error: outcome.field }));
  }

  return seeOther(
    signInPath(locale, { notice: "password-changed" }),
    expiredCookie(req)
  );
};

/** What `requestEmailChange` and `mobileRequestEmailChange` both answer. */
type RequestEmailChangeOutcome =
  | { status: "signed-out" }
  /** `email`: not shaped like an address. `email-unchanged`: the one
   * already on the account. `credentials`: the current password was
   * refused, or the account is locked. */
  | { status: "invalid"; field: "credentials" | "email" | "email-unchanged" }
  | { status: "pending" };

/**
 * The one decision behind both request-email-change surfaces. `locale` is a
 * parameter, not read from the request, because the two renderers carry it
 * differently — a form field here, `?locale=` on the JSON surface — and both
 * need it for the same reason: the queued confirmation mail is sent in it.
 */
async function decideRequestEmailChange(
  req: PayloadRequest,
  started: number,
  locale: Locale,
  input: { current: string; email: string }
): Promise<RequestEmailChangeOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  const email = normaliseEmail(input.email);

  if (!isEmailShaped(email)) {
    await pad(started);

    return { field: "email", status: "invalid" };
  }

  if (email === normaliseEmail(user.email)) {
    await pad(started);

    return { field: "email-unchanged", status: "invalid" };
  }

  if (!(await currentPasswordAccepted(req, user, input.current))) {
    await pad(started);

    return { field: "credentials", status: "invalid" };
  }

  /*
   * **The address is not checked for availability here, and that is the
   * whole enumeration story of this endpoint.** Answering "that address is
   * already registered" would turn the account page into exactly the oracle
   * `/auth/sign-up` was built to close — one request, one bit, for any
   * address the attacker cares to name. So the request is parked whatever
   * the address is, the answer is the same either way, and uniqueness is
   * settled at confirmation time, in front of somebody who has already
   * proved they read the mail there.
   */
  await req.payload.update({
    collection: USERS,
    data: {
      pendingEmail: email,
      pendingEmailExpiresAt: new Date(
        Date.now() + CONFIRM_TTL_MS
      ).toISOString(),
      /*
       * **Cleared, not left alone.** The token is minted by the job that
       * sends it (`lib/emailChange.ts` says why at length), so this write no
       * longer replaces it — and a token left over from an address change
       * started ten minutes ago would otherwise still match this row, which
       * means the link sent to *that* address would confirm *this* one. One
       * pending change, one live link, and starting a new change ends the
       * old one.
       */
      pendingEmailToken: null,
    },
    depth: 0,
    id: user.id,
    /*
     * These three fields are admin-only at field level — see
     * `collections/Users.ts` — precisely so that no visitor can write them
     * over REST and hand themselves a token. This is the one path that may,
     * and it is the same shape as `endpoints/oauth.ts` writing
     * `oauthAccounts`.
     */
    overrideAccess: true,
  });

  /*
   * **Queued, not sent here, and not logged any more.** Stage 4 wrote the
   * confirmation link to the console because there was no adapter; Stage 7
   * has one, and this is the line that became a send.
   *
   * It goes through the queue rather than straight to the binding for two
   * reasons. A send inside this handler would hold the account page open for
   * as long as Cloudflare takes to answer, on a path that is already held to
   * a 500 ms timing floor — and a refusal would be lost, where a queued
   * message is retried and, if it is refused for good, recorded with the
   * reason (`jobs/index.ts`).
   *
   * **The job carries the account id and not the link.** The token does not
   * exist yet: `jobs/sendEmail.ts` mints it at the moment of sending,
   * because a job's input is logged in full by Payload's own error handler
   * whenever a task throws, and a deferred send is an ordinary event.
   *
   * `req.origin` is captured here because the job cannot: a Local API
   * request's origin is `http://localhost`.
   *
   * A queue failure does not fail the request. The change is recorded and
   * the account page already says an address is pending; answering with an
   * error would tell the visitor their change did not happen when it did.
   */
  try {
    await req.payload.jobs.queue({
      input: {
        kind: "email-change",
        locale,
        origin: req.origin ?? "",
        userId: user.id,
      },
      req,
      task: SEND_EMAIL,
    });
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      `[account] Could not queue the confirmation for the address change on account ${user.id}; it will not be sent`
    );
  }

  await pad(started);

  return { status: "pending" };
}

const requestEmailChange: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  const outcome = await decideRequestEmailChange(req, started, locale, {
    current: field(form, "current"),
    email: field(form, "email"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "invalid") {
    return seeOther(accountPath(locale, { error: outcome.field }));
  }

  return seeOther(accountPath(locale, { notice: "email-pending" }));
};

const confirmEmailChange: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const token = field(form, "token");

  /*
   * **No session is required, and that is deliberate.** The token is the
   * capability, and the person who has it is the person who read the mail at
   * the new address — which is the fact being proved. Demanding a session as
   * well would mean the link only worked in the browser the change was
   * started from, which is not where mail is usually read. What it is *not*
   * is a weaker check: without the token nothing here matches, and the token
   * was only ever handed to the new mailbox.
   *
   * It is still a POST behind the `Origin` guard above. A GET link would be
   * a state change a prefetcher, a link scanner or an `<img>` could trigger
   * — and corporate mail scanners follow links in exactly that way — so the
   * mail links to a page and the page carries the button.
   *
   * There is deliberately **no early return for an empty token**. The
   * obvious one — `if (token === "") …` — is unreachable as a *behaviour*:
   * an absent field arrives as `""`, whose digest matches no row, so the
   * lookup below already answers it, and a mutation sweep would have found
   * the branch surviving. An un-provable guard reads like a lock and is not
   * one.
   */
  const { docs } = await req.payload.find({
    collection: USERS,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    // `hidden: true` keeps `pendingEmailToken` out of every response. It does
    // not keep it out of a `where`, which is what makes this lookup possible.
    where: { pendingEmailToken: { equals: await sha256Hex(token) } },
  });

  const account = docs[0] as undefined | User;
  const pending = account?.pendingEmail;
  const expiresAt = Date.parse(account?.pendingEmailExpiresAt ?? "");

  if (
    account === undefined ||
    !pending ||
    Number.isNaN(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return seeOther(confirmEmailPath(locale, { error: "link" }));
  }

  /*
   * **The address is checked for availability here, and it has to be checked
   * rather than caught.**
   *
   * `@payloadcms/drizzle`'s `handleUpsertError` turns a unique-constraint
   * violation into an `email`-path `ValidationError`, but only when the
   * driver reports `error.code === 'SQLITE_CONSTRAINT_UNIQUE'`. **D1 does
   * not.** Measured against this project's own database: updating a user to
   * an address another user already holds throws a bare
   * `DrizzleQueryError` — `Failed query: insert into "users" … on conflict …`
   * — with no `code`, no `data.errors` and no path, which `handleUpsertError`
   * re-throws unchanged. That is the same class of surprise
   * `apps/site/README.md` records for D1's bound-parameter cap, and it means
   * "catch the ValidationError" is a fix that works everywhere except here.
   *
   * So the collision is answered by asking first. The race that leaves —
   * the address being taken between this read and the write below, with no
   * transaction to prevent it — ends at the unique index, which is the right
   * place for a genuinely simultaneous collision to end, and is rethrown as
   * the fault it is rather than dressed up as a bad link.
   *
   * No oracle is created: nothing reaches this line without a token that was
   * only ever handed to the address in question.
   */
  const { totalDocs } = await req.payload.count({
    collection: USERS,
    overrideAccess: true,
    where: { email: { equals: pending } },
  });

  if (totalDocs > 0) {
    /*
     * The pending record is deliberately **left in place**: the link is not
     * the thing that failed, and re-requesting would cost the visitor their
     * password again. They see the same "this link cannot be used" as an
     * expired one, which is all the truth this page can safely tell — the
     * alternative sentence names a registered address.
     */
    return seeOther(confirmEmailPath(locale, { error: "link" }));
  }

  try {
    await req.payload.update({
      collection: USERS,
      data: {
        email: pending,
        pendingEmail: null,
        pendingEmailExpiresAt: null,
        // Cleared in the same write as the address, which is what makes the
        // link single-use. A second press of the button finds nothing.
        pendingEmailToken: null,
      },
      depth: 0,
      id: account.id,
      overrideAccess: true,
    });
  } catch (error) {
    if (validationPaths(error) === null) {
      throw error;
    }

    // The adapter *did* classify it — a non-D1 database, or a D1 that starts
    // reporting the constraint code. Same answer as the check above.
    return seeOther(confirmEmailPath(locale, { error: "link" }));
  }

  /*
   * Sent to sign-in rather than back to the account page, because the
   * address they sign in with has just changed and they may well not be the
   * session that started this. The session itself is untouched: the JWT
   * names an id, not an address.
   */
  return seeOther(signInPath(locale, { notice: "email-changed" }));
};

/** What `deleteAccount` and `mobileDeleteAccount` both answer. */
type DeleteAccountOutcome =
  | { status: "signed-out" }
  /** The typed address did not match the account's. */
  | { status: "invalid" }
  /** The cascade refused; the account still exists. */
  | { status: "failed" }
  | { status: "deleted" };

/**
 * The one decision behind both delete-account surfaces.
 *
 * **Typing the address, not a password — on either surface.** The plan asks
 * for the address and it is the right control for two reasons. It is a
 * confirmation of *intent* rather than of identity — the session already
 * settled identity — and deletion, unlike a password or address change,
 * hands the attacker nothing: it is the one destructive action that cannot
 * be used to take an account over. And a password requirement would lock out
 * precisely the accounts that have no usable password: a Google-created
 * account is given a random 288-bit value nobody knows (`endpoints/
 * oauth.ts`), so its owner could never delete it. A mobile client asking for
 * a password here would be asking for something this endpoint neither wants
 * nor checks.
 *
 * Normalised on both sides, because `users.email` is stored lower-cased and
 * nobody should lose their account over a capital letter — or fail to delete
 * it over one.
 */
async function decideDeleteAccount(
  req: PayloadRequest,
  input: { confirmEmail: string }
): Promise<DeleteAccountOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  if (normaliseEmail(input.confirmEmail) !== normaliseEmail(user.email)) {
    return { status: "invalid" };
  }

  try {
    /*
     * `overrideAccess: true`, because `users.access.delete` is `isAdmin` and
     * stays that way: `DELETE /api/users/:id` should remain an
     * administrator's operation, and this endpoint is the only self-service
     * door. Widening the collection's access to `isAdminOrSelf` would open
     * the REST path to any session, with no typed confirmation in front of
     * it.
     *
     * What this delete drags with it is the point of the whole endpoint, and
     * the two halves pull in opposite directions:
     *
     * - **The user's lists go**, through `hooks/cascadeListsOnUserDelete`. A
     *   private list without an owner is unreachable by any access filter.
     * - **The user's consent records stay**, with a null `user`. That is a
     *   legal-retention requirement from the spec and the entire reason
     *   `user_consents.user` is optional: the column is nullable so the
     *   foreign key's `ON DELETE set null` can execute and the evidence
     *   survives the account it describes. Nothing here may be "tidied up"
     *   into a cascade. `endpoints/account.int.test.ts` fails by name if it
     *   is.
     */
    await req.payload.delete({
      collection: USERS,
      depth: 0,
      id: user.id,
      overrideAccess: true,
    });
  } catch (error) {
    /*
     * The cascade refused — `cascadeListsOnUserDelete` throws an `APIError`
     * naming the lists it could not remove, rather than letting the user
     * delete proceed into a foreign-key failure. The account still exists,
     * so the caller is told so instead of getting Payload's JSON error body
     * in a browser window, or a 500 with no explanation on the JSON surface.
     */
    req.payload.logger.error(
      { err: error, userId: user.id },
      "[account] Failed to delete an account"
    );

    return { status: "failed" };
  }

  return { status: "deleted" };
}

/*
 * Not padded, on either renderer. Nothing on this path depends on a secret
 * the answer could leak — it acts on the caller's own account and the
 * typed-address check compares against an address the caller already knows.
 */
const deleteAccount: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  const outcome = await decideDeleteAccount(req, {
    confirmEmail: field(form, "confirmEmail"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "invalid") {
    return seeOther(accountPath(locale, { error: "confirm" }));
  }

  if (outcome.status === "failed") {
    return seeOther(accountPath(locale, { error: "delete" }));
  }

  return seeOther(
    signInPath(locale, { notice: "deleted" }),
    expiredCookie(req)
  );
};

export const accountEndpoints: Endpoint[] = [
  { handler: changePassword, method: "post", path: "/account/password" },
  { handler: requestEmailChange, method: "post", path: "/account/email" },
  {
    handler: confirmEmailChange,
    method: "post",
    path: "/account/confirm-email",
  },
  { handler: deleteAccount, method: "post", path: "/account/delete" },
];

/* -------------------------------------------------------------------- *
 * Renderer 2: the native app's JSON surface, under `/api/mobile/account/*`.
 * Every outcome above rendered as a body instead of a redirect; no logic
 * lives here beyond that translation. Same shape as `endpoints/lists.ts`'s
 * `/api/mobile/lists/*` renderer.
 * -------------------------------------------------------------------- */

/** `no-store`, CORS-permissive JSON, matching `mobileSignUp`'s own answers. */
function jsonResponse(
  status: number,
  body: unknown,
  req: PayloadRequest
): Response {
  return Response.json(body, {
    headers: headersWithCors({
      headers: new Headers({ "Cache-Control": "no-store" }),
      req,
    }),
    status,
  });
}

/** The locale a JSON caller named in `?locale=`, or the default. */
function localeFromRequest(req: PayloadRequest): Locale {
  return resolveLocale(req.searchParams?.get("locale") ?? undefined);
}

/** A body field as a string, whatever the JSON actually carried. */
function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];

  return typeof value === "string" ? value : "";
}

const mobileChangePassword: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const body = await readBody(req);

  const outcome = await decideChangePassword(req, started, {
    current: stringField(body, "current"),
    next: stringField(body, "next"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { field: outcome.field, status: "invalid" }, req);
  }

  return jsonResponse(200, { status: "changed" }, req);
};

const mobileRequestEmailChange: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const body = await readBody(req);

  const outcome = await decideRequestEmailChange(
    req,
    started,
    localeFromRequest(req),
    {
      current: stringField(body, "current"),
      email: stringField(body, "email"),
    }
  );

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { field: outcome.field, status: "invalid" }, req);
  }

  return jsonResponse(200, { status: "pending" }, req);
};

/**
 * **Requires the account's address, not a password** — see
 * `decideDeleteAccount`'s own comment. A client built from the wrong
 * assumption here would ask its visitor for a password the endpoint never
 * checks, and would have nothing to send when the endpoint asked for the
 * address instead.
 */
const mobileDeleteAccount: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const body = await readBody(req);

  const outcome = await decideDeleteAccount(req, {
    confirmEmail: stringField(body, "confirmEmail"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { status: "invalid" }, req);
  }

  if (outcome.status === "failed") {
    return jsonResponse(500, { status: "failed" }, req);
  }

  return jsonResponse(200, { status: "deleted" }, req);
};

/**
 * The native app's three writes, at flat `/api/mobile/account/*` paths — see
 * `endpoints/lists.ts`'s own `mobileListsEndpoints` for why these are flat
 * siblings rather than nested under a per-action subpath. There is no
 * mobile twin of `confirmEmailChange`: see the module comment.
 */
export const mobileAccountEndpoints: Endpoint[] = [
  {
    handler: mobileChangePassword,
    method: "post",
    path: "/mobile/account/password",
  },
  {
    handler: mobileRequestEmailChange,
    method: "post",
    path: "/mobile/account/email",
  },
  {
    handler: mobileDeleteAccount,
    method: "post",
    path: "/mobile/account/delete",
  },
];
