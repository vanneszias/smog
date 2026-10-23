import type { Locale } from "@smog/config/constants";
import { deadLetter } from "@smog/db";
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
import { and, count, desc, isNull } from "drizzle-orm";

/**
 * The daily dead-letter digest (phase 9 task 4, ruling 5): the retention
 * cron (03:15 UTC) calls `runDeadLetterDigest`, which sends the
 * `admin_dead_letter` email to every admin **at most once a day** and only
 * when there is something to say:
 * - dead letters nobody replayed or discarded, or
 * - messages lost while D1 was down (the KV counters `dlq-lost:<date>`).
 * Counts and types only, never a body or an address of a stored message.
 *
 * The KV marker `dlq-digest:<date>` (TTL 3 days) is written **after** every
 * send was enqueued, so a failed enqueue does not skip the day: a re-run
 * the same day tries again, and the per-admin idempotency key
 * (`admin_dead_letter:<date>:<adminId>`) keeps the admins already reached
 * from getting a second email. The lost counters read are settled after
 * the marker (the reported part comes off, a loss counted since stays), so a
 * loss is reported once and never dropped unreported.
 */

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
  /** Each counter read, with the value the report counted. */
  lostCounted: { key: string; value: number }[];
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

function counterValue(value: string | null): number {
  const n = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The loss counters still in KV (TTL 3 days): their sum and each value read. */
async function lostCounters(
  kv: DeadLetterDigestDeps["kv"]
): Promise<{ counted: { key: string; value: number }[]; lost: number }> {
  const { keys } = await kv.list({ prefix: DLQ_LOST_PREFIX });
  const counted = await Promise.all(
    keys.map(async (key) => ({
      key: key.name,
      value: counterValue(await kv.get(key.name)),
    }))
  );
  return {
    counted,
    lost: counted.reduce((sum, entry) => sum + entry.value, 0),
  };
}

/**
 * Takes what was reported off a counter, never more: a loss counted after
 * the read (a late DLQ failure between the read and now) stays for the next
 * report. KV has no compare-and-delete, so the key is read again: unchanged
 * it is deleted, grown it keeps the difference. A loss landing between that
 * read and the write is the one remaining window (microseconds, and the
 * `[dlq] lost` log line exists either way).
 */
async function settleLostCounter(
  kv: DeadLetterDigestDeps["kv"],
  { key, value }: { key: string; value: number }
): Promise<void> {
  try {
    const now = counterValue(await kv.get(key));
    if (now <= value) {
      await kv.delete(key);
      return;
    }
    await kv.put(key, String(now - value), {
      expirationTtl: DLQ_KV_TTL_SECONDS,
    });
  } catch (error) {
    console.error("[dlq] Failed to clear a lost counter:", error);
  }
}

async function gather(deps: DeadLetterDigestDeps): Promise<DigestFacts> {
  const [open, lost] = await Promise.all([
    openDeadLetters(deps.db),
    lostCounters(deps.kv),
  ]);
  return { ...open, lost: lost.lost, lostCounted: lost.counted };
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
  if (open === 0 && facts.lost === 0) {
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
  // Reported now: take the reported part off the counters (best effort;
  // their TTL ends them anyway).
  await Promise.all(
    facts.lostCounted.map((entry) => settleLostCounter(kv, entry))
  );
  console.log(
    `[dlq] digest ${JSON.stringify({ admins: admins.length, lost: facts.lost, open })}`
  );
  return { digestSent: admins.length };
}
