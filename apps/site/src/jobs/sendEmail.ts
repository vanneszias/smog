import type { Payload } from "payload";
import { renderEmail } from "@/email/render";
import { confirmEmailPath, sponsorReEditPath } from "@/lib/authFlow";
import { issueEmailChangeToken } from "@/lib/emailChange";
import type { Locale } from "@/lib/locale";
import type { Sponsorship, User } from "@/payload-types";

/**
 * The two messages this application sends, and the one rule they share.
 *
 * Stage 7 owns the scheduler and `jobs/index.ts` owns the retry policy.
 * **This module owns the operation**, on the precedent
 * `jobs/expireSponsorships.ts` set: what is queued, what is read, what is
 * rendered and what is handed to `payload.sendEmail` is testable without a
 * queue, and scheduling it is wiring rather than design.
 *
 * ## The rule: the queue carries identifiers, never a credential
 *
 * Both messages exist to deliver a working link. Neither link is in the job's
 * input, and that is the single most load-bearing decision in this file.
 *
 * A job's `input` is a column in `payload-jobs`, and Payload logs the *whole
 * job* — input included — every time a task throws
 * (`queues/errors/handleTaskError.js`, 3.89.0:
 * `logger.error({ err: error, job, … })`). The retry policy next door is
 * built on the idea that a failed send is ordinary: a quota refusal defers and
 * is tried again. So a token in the input would be written to an error log on
 * precisely the path that is expected to happen, which is the exposure
 * `email/adapter.ts` refuses to create at the other end of the same message —
 * it logs nothing at all, for this reason.
 *
 * So the credential is obtained here, at the last moment before the send:
 *
 * - **the address change** mints one (`lib/emailChange.ts`), because Stage 4
 *   stores only its SHA-256 and a digest cannot be turned back into a link;
 * - **the re-edit invitation** reads one back with `showHiddenFields: true`,
 *   because `collections/Sponsorships.ts` stores that token in the clear and
 *   marks it `hidden: true` — which strips it from every API response and,
 *   until now, from every reader. Stage 5 minted it and nothing has ever read
 *   it out. This is the read it was waiting for.
 *
 * ## Why every refusal below is a success and not an error
 *
 * A sponsorship that has left `pending_resubmission`, an address change that
 * was already confirmed, a row somebody deleted: none of them is a message
 * that failed to send. They are messages that must *not* be sent, and
 * throwing would retry them until the attempts ran out and then file them as
 * failures for an operator to read. They are logged and the job completes.
 *
 * The one genuinely dangerous member of that set is the spent re-edit token.
 * `hooks/manageReEditToken.ts` destroys the token the moment the sponsorship
 * leaves `pending_resubmission`, so a mail queued a minute before an
 * administrator changed their mind would otherwise carry a link the sponsor
 * cannot use — and the page cannot tell a spent token from an invented one,
 * by design. Not sending it is the difference between a sponsor who was never
 * asked and a sponsor who was asked and handed a broken door.
 *
 * ## The locale
 *
 * A parameter, carried from whoever queued the message. The address change
 * has a real answer — the locale of the form the account holder just
 * submitted. **The re-edit invitation does not: a `sponsorships` row records
 * no language**, so the plan's "renders every message in the recipient's
 * locale" is only half-answerable today. `hooks/queueReEditEmail.ts` passes
 * the site default and says why reading the administrator's own session
 * instead would be worse: that is the language of the person clicking the
 * button, not of the sponsor reading the mail.
 */

/** What a queued message names. Identifiers and a locale; never a token. */
export interface SendEmailInput {
  kind: "email-change" | "re-edit";
  locale: Locale;
  /**
   * The scheme and host the link is built on, captured from the request that
   * queued the message.
   *
   * It has to come from the queue side: a job runs under a Local API request,
   * where `createLocalReq` synthesises `http://localhost` when nothing else
   * supplies a URL (3.89.0) — so a link built from the job's own `req.origin`
   * would be a working link to the wrong host.
   */
  origin: string;
  sponsorshipId?: null | number;
  userId?: null | number;
}

/** What one send did, for the task to log and a test to assert on. */
interface SendReport {
  /** The address it went to, or `null` if there was nothing to send. */
  recipient: null | string;
}

const NOTHING_SENT: SendReport = { recipient: null };

/** One row by id, or `null` — `findByID` throws for a row somebody deleted. */
async function findOne<T>(
  payload: Payload,
  collection: "sponsorships" | "users",
  id: number,
  showHiddenFields: boolean
): Promise<null | T> {
  const { docs } = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    showHiddenFields,
    where: { id: { equals: id } },
  });

  return (docs[0] as T | undefined) ?? null;
}

/**
 * The address-change confirmation, to the address being claimed.
 *
 * The recipient is read from the row rather than carried in the input, and
 * that is a guard rather than tidiness: if the account holder started a second
 * change before this one was sent, the pending address and the token below
 * would otherwise disagree — and a confirmation link is only meaningful to the
 * mailbox it proves. Reading both at the same moment keeps them one fact.
 */
async function sendEmailChange(
  payload: Payload,
  input: SendEmailInput
): Promise<SendReport> {
  const userId = input.userId ?? null;

  if (userId === null) {
    payload.logger.error(
      "[sendEmail] An address-change message named no account; nothing was sent"
    );

    return NOTHING_SENT;
  }

  const user = await findOne<User>(payload, "users", userId, false);
  const pending = user?.pendingEmail;

  if (!pending) {
    payload.logger.info(
      `[sendEmail] Account ${userId} has no pending address change; nothing was sent`
    );

    return NOTHING_SENT;
  }

  const token = await issueEmailChangeToken(payload, userId);
  const { subject, text } = renderEmail({
    kind: "email-change",
    locale: input.locale,
    url: `${input.origin}${confirmEmailPath(input.locale, { token })}`,
  });

  await payload.sendEmail({ subject, text, to: pending });

  // The account, not the address, and never the link: a log line that named
  // the pending address would put an unconfirmed address of somebody else's
  // into an operator's console for every change.
  payload.logger.info(
    `[sendEmail] Sent the address-change confirmation for account ${userId}`
  );

  return { recipient: pending };
}

/**
 * The sponsor's re-edit invitation, to the address on the sponsorship.
 *
 * `showHiddenFields: true` is the whole point of this function. Payload
 * deletes a `hidden` field in the `afterRead` field pass unless the caller
 * asks for it (`payload/dist/fields/hooks/afterRead/promise.js`), which is
 * what has kept `reEditToken` out of every response since Stage 5 — including
 * out of the reach of anything that could deliver it.
 */
async function sendReEditInvitation(
  payload: Payload,
  input: SendEmailInput
): Promise<SendReport> {
  const sponsorshipId = input.sponsorshipId ?? null;

  if (sponsorshipId === null) {
    payload.logger.error(
      "[sendEmail] A re-edit invitation named no sponsorship; nothing was sent"
    );

    return NOTHING_SENT;
  }

  const sponsorship = await findOne<Sponsorship>(
    payload,
    "sponsorships",
    sponsorshipId,
    true
  );

  if (sponsorship === null) {
    payload.logger.warn(
      `[sendEmail] Sponsorship ${sponsorshipId} no longer exists; no re-edit invitation was sent`
    );

    return NOTHING_SENT;
  }

  const token = sponsorship.reEditToken;

  if (!token) {
    // Either an administrator moved the sponsorship on again before this ran,
    // or it never carried a token. `hooks/manageReEditToken.ts` destroys the
    // token on the way out of `pending_resubmission`, so this is the ordinary
    // shape of "the invitation was withdrawn".
    payload.logger.info(
      `[sendEmail] Sponsorship ${sponsorshipId} carries no re-edit token any more; no invitation was sent`
    );

    return NOTHING_SENT;
  }

  /*
   * There is deliberately no arm for "the sponsorship has no address".
   * `sponsorEmail` is `required: true` on the collection and NOT NULL in the
   * column, so no row can reach here without one, and a guard nothing can
   * reach is a comment that reads like a lock —
   * `hooks/stampReviewDecision.ts` and `endpoints/account.ts` both made the
   * same call after a mutation sweep found the branch surviving. The two
   * identifier checks above are *not* in that category: they read a job's
   * input, which is a row an older build or a hand-written queue entry could
   * have written.
   */
  const recipient = sponsorship.sponsorEmail;

  const { subject, text } = renderEmail({
    kind: "re-edit",
    locale: input.locale,
    sponsorName: sponsorship.sponsorName,
    url: `${input.origin}${sponsorReEditPath(input.locale, { token })}`,
  });

  await payload.sendEmail({ subject, text, to: recipient });

  // The sponsorship, never the link and never the address.
  payload.logger.info(
    `[sendEmail] Sent the re-edit invitation for sponsorship ${sponsorshipId}`
  );

  return { recipient };
}

export function sendQueuedEmail(
  payload: Payload,
  input: SendEmailInput
): Promise<SendReport> {
  return input.kind === "email-change"
    ? sendEmailChange(payload, input)
    : sendReEditInvitation(payload, input);
}
