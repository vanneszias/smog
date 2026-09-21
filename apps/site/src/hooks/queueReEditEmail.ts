import type { CollectionAfterChangeHook } from "payload";
import { SEND_EMAIL } from "@/jobs/sendEmail";
import { DEFAULT_LOCALE } from "@/lib/locale";
import type { Sponsorship } from "@/payload-types";

/** The one status whose arrival means a sponsor has been asked for a change. */
const RESUBMISSION = "pending_resubmission";

/**
 * Queues the sponsor's re-edit invitation when an administrator asks them for
 * a change.
 *
 * ## Why here, and not in `endpoints/sponsorships.ts` as the plan says
 *
 * The plan lists `sponsorships.ts` as the file that "logs a link instead of
 * sending it". **It does not, and never did** — nothing in this application
 * has ever produced a re-edit link for anybody. Stage 5 removed the shipped
 * product's bespoke button on purpose: `packages/api`'s `generateReEditLink`
 * set a status, a token and an expiry and handed the URL back to an admin
 * screen with a copy button, and `hooks/manageReEditToken.ts` records the
 * decision that in this port **moving the status to `pending_resubmission` in
 * the admin panel *is* that action**. So the event this hook listens for is
 * exactly the shipped mutation, and there is no endpoint involved at either
 * end.
 *
 * That makes the queue point a collection hook, and `afterChange` rather than
 * `beforeChange` for the reason `hooks/logSponsorshipTransitions.ts` gives:
 * there are no transactions on any write path, so the only ordering tool is
 * which side of the write a thing happens on — and a mail queued before a
 * write that then failed is a sponsor invited to edit a sponsorship nobody
 * moved.
 *
 * ## Only on the transition, and only on an update
 *
 * The same two tests `manageReEditToken` makes, for the same reasons: every
 * update re-submits `status` (Payload merges the document before the hooks
 * run), so an administrator correcting a sponsor's name arrives here with
 * `previousDoc.status === doc.status` and must not re-invite anybody. A
 * create is not a transition either, and `previousDoc` is `{}` on one —
 * without the `operation` test, every fixture that creates a row already in
 * `pending_resubmission` would mail its sponsor.
 *
 * The token is minted by `manageReEditToken` in the `beforeChange` pass of
 * this same write, so by the time this runs the row has one. This hook does
 * not read it and does not carry it: `jobs/sendEmail.ts` reads it back with
 * `showHiddenFields: true` at the moment of sending, because a job's input is
 * a database row that Payload's own error handler writes to the log whenever
 * a task fails.
 *
 * ## The locale is the site default, and that is an honest gap
 *
 * The plan asks for every message "in the recipient's locale". A
 * `sponsorships` row records no language — the wizard's locale lives in the
 * URL and is never stored — so the recipient's locale is genuinely unknown
 * here. `req.locale` is available and is *not* used: on an admin-panel write
 * that is the content locale the administrator is editing in, which is the
 * language of the person clicking the button rather than of the sponsor
 * reading the mail, and a wrong answer that looks derived is worse than a
 * default that is written down. Dutch is the site default and the language
 * every transactional message in the shipped product is written in.
 *
 * ## A failure here does not fail the administrator's save
 *
 * By the time this runs the status has moved and the token has been minted.
 * Throwing would report a failure for a write that happened, and — on the one
 * path where this hook can be reached from a webhook — would turn a delivered
 * payment into an endless redelivery. So a queue failure is logged, loudly
 * enough to be actionable: nobody is going to be invited, and an administrator
 * waiting on a sponsor would otherwise wait for ever.
 */
export const queueReEditEmail: CollectionAfterChangeHook<Sponsorship> = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (
    operation !== "update" ||
    doc.status !== RESUBMISSION ||
    previousDoc.status === RESUBMISSION
  ) {
    return doc;
  }

  try {
    await req.payload.jobs.queue({
      input: {
        kind: "re-edit",
        locale: DEFAULT_LOCALE,
        // Captured from the request that made the change: a job runs under a
        // Local API request, whose origin is `http://localhost`.
        origin: req.origin ?? "",
        sponsorshipId: doc.id,
      },
      req,
      task: SEND_EMAIL,
    });
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      `[queueReEditEmail] Could not queue the re-edit invitation for sponsorship ${doc.id}; the sponsor will not be asked`
    );
  }

  return doc;
};
