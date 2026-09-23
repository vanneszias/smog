import type {
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from "payload";
import { ValidationError } from "payload";

/**
 * The floor, in characters. Twelve rather than Payload's built-in three.
 *
 * Payload validates password *presence*, not strength: the only length rule
 * on the local strategy is `minLength = 3`, hard-coded as a default parameter
 * of `password()` in `payload/dist/fields/validations.js` and called from
 * `generatePasswordSaltHash` with a synthesised field descriptor that passes
 * no `minLength` at all. Verified against a real database before this hook
 * existed: `payload.create` accepted `"abc"`.
 */
const MIN_LENGTH = 12;

/**
 * There is deliberately **no maximum**.
 *
 * An upper bound on password length is a denial-of-service control, and it
 * only earns its place when the KDF is expensive. Ours is not — 25,000
 * PBKDF2 iterations is roughly 24× cheaper than current guidance (see the
 * header of `collections/Users.ts`), so a long password costs us almost
 * nothing and a cap would only frustrate password managers, which generate
 * long strings by default. Payload still applies `config.defaultMaxTextLength`
 * (40,000) as a backstop, which is far above anything a human or a manager
 * produces. `Users.password.int.test.ts` pins that a 200-character password
 * is accepted.
 */

/**
 * Passwords rejected outright, matched case-insensitively against the whole
 * string.
 *
 * This is a deny-list, not a strength meter, and it is small on purpose: it
 * ships inside the Worker, where every kilobyte is measured against a 10 MiB
 * budget, and a full breach corpus belongs behind a network call this app
 * deliberately does not make. `MIN_LENGTH` already rejects the classic
 * top-20 — `password`, `123456`, `qwerty` and friends are all shorter than
 * twelve — so the entries that earn their place here are the ones a
 * twelve-character floor *invites*: the same guesses, padded out to length.
 */
const COMMON_PASSWORDS = new Set([
  "123456789012",
  "1234567890123",
  "12345678901234",
  "123456789012345",
  "1234567890123456",
  "111111111111",
  "000000000000",
  "abcdefghijkl",
  "administrator",
  "iloveyou1234",
  "letmein12345",
  "password1234",
  "passwordpassword",
  "qwertyuiop12",
  "qwertyuiopasdfgh",
  "qwerty123456",
  "trustno1trustno1",
  "welcome12345",
  "changeme1234",
  "correcthorsebatterystaple",
]);

/**
 * Returns the reason a password is unacceptable, or `null` if it is fine.
 *
 * Kept separate from the hook so the rules read as rules, and so the order
 * is explicit: length first, because it is the cheaper check and because
 * the deny-list is written assuming it has already run.
 */
const rejectionReason = (password: string): null | string => {
  if (password.length < MIN_LENGTH) {
    return `Passwords must be at least ${MIN_LENGTH} characters long.`;
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Choose something less guessable.";
  }

  return null;
};

/**
 * Rejects weak passwords on `users`.
 *
 * **Why a collection hook and not a field `validate`.** Payload's password
 * is not a real field — it never reaches `collection.fields`, and the local
 * strategy hashes `data.password` directly
 * (`auth/strategies/local/register.js` on create,
 * `collections/operations/utilities/update.js:26` on update), so there is no
 * field config to hang a `validate` on. `beforeValidate` is the first
 * collection hook both of those paths run, and it still sees the raw
 * `data.password` before either hashes it.
 *
 * **It may only throw, never rewrite.** Both call sites capture the
 * plaintext *before* the hooks run — `create.js` passes `data.password`
 * from the incoming argument, and the update utility binds
 * `const password = data?.password` at line 26 — so a hook that normalised
 * the value would store a hash of something the user never typed. Returning
 * `data` unchanged is the only safe shape.
 *
 * **What this does not cover: `resetPassword`.** That operation hashes
 * first and calls `beforeValidate` afterwards, with the *user document* as
 * `data` rather than the submitted body
 * (`auth/operations/resetPassword.js`), so `data.password` is undefined
 * there and this hook cannot see it. {@link enforcePasswordPolicyOnReset}
 * closes that path; it is a separate hook because it has to run at a
 * different point in the same operation.
 */
export const enforcePasswordPolicy: CollectionBeforeValidateHook = ({
  data,
}) => {
  const password = (data as { password?: unknown } | undefined)?.password;

  if (typeof password !== "string") {
    return data;
  }

  const reason = rejectionReason(password);

  if (reason === null) {
    return data;
  }

  throw new ValidationError({
    collection: "users",
    errors: [{ message: reason, path: "password" }],
  });
};

/**
 * The same floor, applied to `resetPassword`.
 *
 * ## The gap this closes
 *
 * `enforcePasswordPolicy` above cannot see a reset. `resetPasswordOperation`
 * (`payload/dist/auth/operations/resetPassword.js`, 3.89.0) calls
 * `generatePasswordSaltHash` **first** and only then runs the collection's
 * `beforeValidate` hooks, passing the *user document* — the one carrying the
 * freshly written `salt` and `hash` — as `data`. By the time a
 * `beforeValidate` hook runs there is no plaintext left in `data` to inspect,
 * so the floor that every other path enforces simply is not applied.
 *
 * What is applied instead is Payload's own: `generatePasswordSaltHash` runs
 * `password()` from `fields/validations.js` with a synthesised field
 * descriptor that passes no `minLength`, so the default parameter —
 * `minLength = 3` — is the entire rule. **A reset could set a
 * three-character password**, on an account whose twelve-character floor had
 * been enforced at every other door.
 *
 * Without an email adapter it would be unreachable, because `forgotPassword`
 * would write the token to the console instead of delivering it; with one, it
 * is live. It is also the *only* way into a Google-created account that has
 * never set a password — `endpoints/oauth.ts` gives those a random 288-bit
 * value nobody knows — so the reset path is not a corner of this system, it is
 * the main door for one class of account.
 *
 * ## Why a `beforeOperation` hook and not an endpoint override
 *
 * The obvious fix is to shadow `POST /api/users/reset-password` the way
 * `endpoints/auth.ts` shadows `/login`. It is not necessary.
 * `resetPasswordOperation` calls `buildBeforeOperation` as the first step
 * inside its transaction — **before the token is looked up, and long before
 * `generatePasswordSaltHash` is reached** — and that helper hands every
 * `beforeOperation` hook the operation's own `args`, `data.password` included:
 * the plaintext, exactly as submitted
 * (`collections/operations/utilities/buildBeforeOperation.js`). Verified at the
 * call site.
 *
 * A hook is strictly better than an endpoint override here: it covers the
 * REST endpoint, the GraphQL mutation, the admin panel's reset screen and
 * `payload.resetPassword` from server code, where an override covers one of
 * the four and leaves the rest on Payload's three-character floor.
 *
 * **It must narrow on `operation`.** `beforeOperation` fires for every
 * operation on this collection — `login`, `create`, `read`, all of them —
 * and `args` has a different shape for each. `Users.password.int.test.ts`
 * pins that an ordinary sign-in still works with this hook installed, which
 * is the test a missing narrow fails.
 */
export const enforcePasswordPolicyOnReset: CollectionBeforeOperationHook = ({
  args,
  operation,
}) => {
  if (operation !== "resetPassword") {
    return;
  }

  const password = (args as { data?: { password?: unknown } }).data?.password;

  /*
   * A non-string is left alone rather than rejected. `resetPasswordOperation`
   * has its own answer for a missing password — `Missing required data.`,
   * a 400 — and reporting it here as a weak password would be a worse
   * message for the same request.
   */
  if (typeof password !== "string") {
    return;
  }

  const reason = rejectionReason(password);

  if (reason === null) {
    return;
  }

  throw new ValidationError({
    collection: "users",
    errors: [{ message: reason, path: "password" }],
  });
};
