import type { Locale } from "@smog/config/constants";
import { deadLetter, sponsorship } from "@smog/db";
import type { Db } from "@smog/db/client";
import {
  DLQ_KV_TTL_SECONDS,
  DLQ_LOST_PREFIX,
  digestMarkerKey,
  type EmailMessage,
  enqueueEmail,
  type QueueProducer,
  utcDay,
} from "@smog/jobs";
import { DAY_MS } from "@smog/utils";
import { and, count, desc, eq, isNull, lt } from "drizzle-orm";

/**
 * The daily dead-letter digest (phase 9 task 4, ruling 5): the retention
 * cron (03:15 UTC) calls `runDeadLetterDigest`, which sends the
 * `admin_dead_letter` email to every admin **at most once a day** and only
 * when there is something to say:
 * - dead letters nobody replayed or discarded, or
 * - messages lost while D1 was down (the KV counters `dlq-lost:<date>`), or
 * - sponsorships in `render_failed` for more than 24 hours.
 * Counts and types only, never a body or an address of a stored message.
 *
 * The KV marker `dlq-digest:<date>` (TTL 3 days) is written **after** every
 * send was enqueued, so a failed enqueue does not skip the day: a re-run
 * the same day tries again, and the per-admin idempotency key
 * (`admin_dead_letter:<date>:<adminId>`) keeps the admins already reached
 * from getting a second email. The lost counters read are cleared after
 * the marker, so a loss is reported once.
 */

/** A `render_failed` sponsorship is reported once it has been so for this long. */
export const RENDER_FAILED_ALERT_MS = DAY_MS;
/** At most this many types in the email. */
const DIGEST_TYPES_MAX = 10;

/** The admins the digest goes to, as `adminRecipients` (`@smog/sponsorships/server`) lists them. */
export interface DigestRecipient {
  email: string;
  id: string;
  locale: Locale;
}

export interface DeadLetterDigestDeps {
  db: Db;
  kv: Pick<KVNamespace, "delete" | "get" | "list" | "put">;
  now: Date;
  /** `EMAIL_QUEUE`; without it the run fails (nothing can be sent). */
  queue: QueueProducer<EmailMessage> | undefined;
  /** Injected by the Worker: another feature's server is not imported here. */
  recipients: (db: Db, now: Date) => Promise<DigestRecipient[]>;
  /** `SITE_URL`, for the link to the screen. */
  siteUrl: string;
}

export interface DeadLetterDigestResult {
  /** Admins the email was enqueued for. */
  digestSent: number;
}

interface DigestFacts {
  emailOpen: number;
  eventsOpen: number;
  lost: number;
  lostKeys: string[];
  renderFailed: number;
  types: { count: number; type: string }[];
}

async function openDeadLetters(
  db: Db
): Promise<Pick<DigestFacts, "emailOpen" | "eventsOpen" | "types">> {
  const open = and(
    isNull(deadLetter.replayedAt),
    isNull(deadLetter.discardedAt)
  );
  const [byQueue, byType] = await db.batch([
    db
      .select({ n: count(), queue: deadLetter.originQueue })
      .from(deadLetter)
      .where(open)
      .groupBy(deadLetter.originQueue),
    db
      .select({ n: count(), type: deadLetter.type })
      .from(deadLetter)
      .where(open)
      .groupBy(deadLetter.type)
      .orderBy(desc(count()), deadLetter.type)
      .limit(DIGEST_TYPES_MAX),
  ]);
  const of = (queue: "email" | "events") =>
    byQueue.find((row) => row.queue === queue)?.n ?? 0;
  return {
    emailOpen: of("email"),
    eventsOpen: of("events"),
    types: byType.map((row) => ({ count: row.n, type: row.type })),
  };
}

/** The loss counters still in KV (TTL 3 days): their sum and their keys. */
async function lostCounters(
  kv: DeadLetterDigestDeps["kv"]
): Promise<{ keys: string[]; lost: number }> {
  const { keys } = await kv.list({ prefix: DLQ_LOST_PREFIX });
  const values = await Promise.all(keys.map((key) => kv.get(key.name)));
  const lost = values.reduce((sum, value) => {
    const n = Number.parseInt(value ?? "0", 10);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return { keys: keys.map((key) => key.name), lost };
}

async function renderFailedForTooLong(db: Db, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(sponsorship)
    .where(
      and(
        eq(sponsorship.status, "render_failed"),
        lt(
          sponsorship.updatedAt,
          new Date(now.getTime() - RENDER_FAILED_ALERT_MS)
        )
      )
    );
  return row?.n ?? 0;
}

async function gather(deps: DeadLetterDigestDeps): Promise<DigestFacts> {
  const [open, lost, renderFailed] = await Promise.all([
    openDeadLetters(deps.db),
    lostCounters(deps.kv),
    renderFailedForTooLong(deps.db, deps.now),
  ]);
  return { ...open, lost: lost.lost, lostKeys: lost.keys, renderFailed };
}

/**
 * Sends today's digest unless it was already sent or there is nothing to
 * report. Throws when a send could not be enqueued (the marker is then not
 * written, and the cron logs and rethrows).
 */
export async function runDeadLetterDigest(
  deps: DeadLetterDigestDeps
): Promise<DeadLetterDigestResult> {
  const { db, kv, now, queue, recipients, siteUrl } = deps;
  const none: DeadLetterDigestResult = { digestSent: 0 };
  const marker = digestMarkerKey(now);
  if ((await kv.get(marker)) !== null) {
    return none;
  }
  const facts = await gather(deps);
  const open = facts.emailOpen + facts.eventsOpen;
  if (open === 0 && facts.lost === 0 && facts.renderFailed === 0) {
    return none;
  }
  const admins = await recipients(db, now);
  if (admins.length === 0) {
    console.warn(
      "[dlq] The dead-letter digest has no admin to go to; it is tried again on the next run"
    );
    return none;
  }
  if (!queue) {
    throw new Error("[dlq] The EMAIL_QUEUE binding is missing");
  }
  const day = utcDay(now);
  const url = new URL("/admin/dead-letters", siteUrl).toString();
  const props = {
    emailOpen: facts.emailOpen,
    eventsOpen: facts.eventsOpen,
    lost: facts.lost,
    renderFailed: facts.renderFailed,
    types: facts.types,
    url,
  };
  for (const admin of admins) {
    // biome-ignore lint/performance/noAwaitInLoops: in order; the first failure stops the run before the marker is written.
    await enqueueEmail(
      queue,
      {
        idempotencyKey: `admin_dead_letter:${day}:${admin.id}`,
        locale: admin.locale,
        props,
        template: "transactional/admin-dead-letter",
        to: admin.email,
      },
      { onFailure: "throw" }
    );
  }
  await kv.put(marker, "1", { expirationTtl: DLQ_KV_TTL_SECONDS });
  // Reported now: clear the counters (best effort; their TTL ends them anyway).
  await Promise.all(
    facts.lostKeys.map((key) =>
      kv.delete(key).catch((error: unknown) => {
        console.error("[dlq] Failed to clear a lost counter:", error);
      })
    )
  );
  console.log(
    `[dlq] digest ${JSON.stringify({ admins: admins.length, lost: facts.lost, open, renderFailed: facts.renderFailed })}`
  );
  return { digestSent: admins.length };
}
