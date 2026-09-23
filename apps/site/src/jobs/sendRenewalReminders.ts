import type { Payload } from "payload";
import { SEND_EMAIL } from "@/jobs/sendEmail";
import { DEFAULT_LOCALE } from "@/lib/locale";

/**
 * Asks the sponsors whose term is nearly up whether they would like another
 * one.
 *
 * `jobs/index.ts` owns the scheduler. **This module owns the operation**, on
 * the precedent `jobs/expireSponsorships.ts` and `jobs/cleanupStalePayments.ts`
 * set, so scheduling it is wiring rather than design.
 *
 * ## What this sweep does, and the one thing it deliberately does not
 *
 * It selects and it queues. It does **not** send, and it does **not** write
 * `renewalReminderSentAt` — `jobs/sendEmail.ts` does both, in that order, and
 * says at length why.
 *
 * The short version is the "never dropped" half of the rule `jobs/sendEmail.ts`
 * states. A reminder refused for quota must *defer*, not drop:
 * `E_DAILY_LIMIT_EXCEEDED` says nothing about this sponsorship, and the
 * `send-email` task is where a refusal is classified and a deferral is given a
 * backoff. A sweep that sent directly would have to reimplement that
 * classification, or drop the message, or block the whole sweep on one
 * recipient. Handing the queue an identifier costs one row and inherits the
 * policy.
 *
 * Marking the reminder sent immediately after the enqueue would be simpler,
 * and wrong: the mark would then record a message that had merely been
 * *accepted for delivery*, which is not the fact the column is used for.
 *
 * ## The window
 *
 * Thirty days: one reminder about a month before expiry. A sponsorship whose
 * term has already ended is excluded as well, and that is not the same
 * condition: the status only becomes `expired` once `expire-sponsorships` has
 * run, so between the two there is a row that is `active`, out of term, and
 * would otherwise be told its sponsorship ends on a date in the past.
 *
 * ## Nothing here is claimed
 *
 * Unlike `cleanup-stale-payments`, which takes a lease per row. The mechanism
 * that stops a sponsorship being reminded twice is
 * `renewalReminderSentAt`, read at send time — so two overlapping sweeps
 * queueing two jobs for one sponsorship costs one extra row in
 * `payload-jobs` and sends one message, which is exactly what one sweep would
 * have done. A claim would buy tidiness and another thing to get wrong; a
 * lease that expired mid-flight would buy the duplicate it was meant to
 * prevent.
 */

/** How long before the end of the term a sponsor is asked. */
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How many sponsorships one run takes on.
 *
 * Bounded for the reason the other two jobs record: an unbounded read has
 * already broken this suite once, at 132 bound parameters against D1's
 * documented cap of 100.
 *
 * Soonest expiry first, which is the ordering in which a bound cannot cost
 * anybody their reminder: the row nearest its deadline is always in the page,
 * and a row that is queued leaves the candidate set the moment the message is
 * sent. A backlog therefore delays the sponsors with the most time left, which
 * is the only group that can afford it.
 */
const PAGE = 200;

/** What one run did, for the scheduler to log and a test to assert on. */
interface ReminderReport {
  /** Sponsorships whose reminder is now in the queue. */
  queued: number;
  /** Sponsorships whose message could not be queued at all. */
  failures: number;
}

export async function sendRenewalReminders(
  payload: Payload,
  now: Date,
  origin: string
): Promise<ReminderReport> {
  const report: ReminderReport = { failures: 0, queued: 0 };

  const { docs: due } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "endDate",
    where: {
      and: [
        { status: { equals: "active" } },
        // Already reminded. An optimisation rather than the guard: the guard
        // is the same column read at send time, because a job deferred by a
        // quota refusal is still in the queue when tomorrow's sweep runs.
        { renewalReminderSentAt: { exists: false } },
        { endDate: { greater_than: now.toISOString() } },
        {
          endDate: {
            less_than_equal: new Date(now.getTime() + WINDOW_MS).toISOString(),
          },
        },
      ],
    },
  });

  for (const sponsorship of due) {
    try {
      await payload.jobs.queue({
        input: {
          /*
           * The site default, and an honest gap rather than a guess. A
           * `sponsorships` row records no language — the wizard's locale lives
           * in the URL and is never stored — so there is nothing to read the
           * sponsor's own language off. `hooks/queueReEditEmail.ts` records
           * the same limitation for the same reason, and this job has even
           * less to go on: there is no request behind it at all.
           */
          locale: DEFAULT_LOCALE,
          kind: "renewal-reminder",
          origin,
          sponsorshipId: sponsorship.id,
        },
        task: SEND_EMAIL,
      });
      report.queued += 1;
    } catch (error) {
      report.failures += 1;
      payload.logger.error(
        { err: error },
        `[sendRenewalReminders] Could not queue the renewal reminder for sponsorship ${sponsorship.id}; nobody will be asked until the next sweep`
      );
    }
  }

  payload.logger.info(
    `[sendRenewalReminders] Queued ${report.queued} renewal reminder(s); ${report.failures} could not be queued`
  );

  return report;
}
