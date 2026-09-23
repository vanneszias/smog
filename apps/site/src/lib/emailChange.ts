import type { Payload } from "payload";

/**
 * The confirmation token behind an address change: how it is stored, and who
 * is allowed to hold it.
 *
 * ## Why the token is minted by the thing that sends it
 *
 * Minting it inside `POST /account/email` would be the obvious place. But the
 * send is a *queued job* — which moves the decision, because a job's `input`
 * is a row in `payload-jobs` and Payload's own error handler logs the whole
 * job, `input` and all, every time a task throws
 * (`queues/errors/handleTaskError.js`, 3.89.0: `logger.error({ err, job, … })`).
 *
 * A retry policy that defers a quota refusal means task failures are an
 * ordinary, expected event. So a confirmation link put in the job's input
 * would be written to an error log on exactly the path the retry policy exists
 * to make routine — which is the failure `email/adapter.ts` refuses to
 * introduce at the other end of the same message.
 *
 * Hence the rule this module exists to keep: **the queue carries identifiers,
 * and the credential is created at the moment of sending.** The sponsor's
 * re-edit token obeys the same rule from the other direction —
 * `jobs/sendEmail.ts` reads it back out of the row with
 * `showHiddenFields: true` rather than carrying it.
 *
 * The cost is one extra write per send, and one property worth stating
 * plainly: a pending change whose mail never got queued is unconfirmable,
 * because no digest was ever stored. That is the correct failure — the link
 * that would confirm it was never sent to anybody — and it lapses on its own
 * within the hour `endpoints/account.ts` gives it.
 */

const HEX = 16;
const BYTE_HEX_WIDTH = 2;

/** Bytes of entropy in a confirmation token. */
const TOKEN_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(HEX).padStart(BYTE_HEX_WIDTH, "0")
  ).join("");
}

/**
 * What is stored for a confirmation token: its SHA-256, never the token.
 *
 * Payload keeps `resetPasswordToken` in the clear, so a database dump is a
 * set of usable reset links. There is no reason to repeat that here: the
 * lookup is an equality on a value the holder of the link can recompute, and
 * nobody else can invert.
 *
 * `crypto.subtle` rather than `node:crypto` because this runs in workerd,
 * where the Web Crypto API is the one that exists.
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return toHex(new Uint8Array(digest));
}

/**
 * Mints a fresh confirmation token for an account, stores its digest, and
 * hands the caller the only copy of the token itself.
 *
 * `overrideAccess: true` because `pendingEmailToken` is admin-only at field
 * level — `collections/Users.ts` makes it so precisely to stop a visitor
 * writing themselves one over REST — and this, like the endpoint that starts
 * the change, is a path that may.
 *
 * Nothing here touches `pendingEmail` or `pendingEmailExpiresAt`. The address
 * and the deadline are what the account holder asked for, in the request they
 * authenticated; this only attaches the credential that proves they read the
 * mail. A re-mint on a retried send therefore invalidates the previous
 * attempt's link and changes nothing else, which is what "the link in the
 * newest mail is the one that works" means.
 */
export async function issueEmailChangeToken(
  payload: Payload,
  userId: number | string
): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));

  await payload.update({
    collection: "users",
    data: { pendingEmailToken: await sha256Hex(token) },
    depth: 0,
    id: userId,
    overrideAccess: true,
  });

  return token;
}
