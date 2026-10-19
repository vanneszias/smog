import { deadLetter } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import {
  countLost,
  type DeadLetterDelivery,
  DLQ_MAX_RETRIES,
  DLQ_RETRY_DELAY_SECONDS,
  type DlqKv,
  toDeadLetter,
} from "@smog/jobs";
import { siteEnv } from "@/server/auth";

/**
 * The consumers of the two DLQs (`smog-<env>-email-dlq`,
 * `smog-<env>-sponsorship-events-dlq`; phase 9 ruling 5): each message is
 * stored in D1 `dead_letter` (id = the queue message id, so a redelivery
 * inserts nothing) and acked. What is stored is decided by `toDeadLetter`
 * (`@smog/jobs`): an email whose template carries a token or a code gets no
 * body and cannot be replayed.
 *
 * No silent loss while D1 is down (ruling 5b): a failed store retries the
 * message after `DLQ_RETRY_DELAY_SECONDS`; the consumer has `max_retries`
 * `DLQ_MAX_RETRIES` (`wrangler.jsonc`), so a D1 outage of about 100 minutes
 * loses nothing. Only when the last delivery fails too is the message
 * lost: `[dlq] lost {…}` (queue, type and id, never a body or an address),
 * and the KV counter `dlq-lost:<date>` that the daily digest reports.
 */

export interface DlqDeps {
  db: Db;
  kv: DlqKv;
  now?: () => Date;
}

export type DlqDecision =
  | { action: "ack" }
  | { action: "retry"; delaySeconds: number };

/** Handles one message of `queue` (see the module comment). */
export async function processDeadLetter(
  queue: string,
  message: DeadLetterDelivery,
  deps: DlqDeps
): Promise<DlqDecision> {
  const now = deps.now?.() ?? new Date();
  const record = toDeadLetter(queue, message);
  if (record === null) {
    console.warn(
      `[dlq] Acked message ${message.id} from ${queue}: not a dead-letter queue of this app`
    );
    return { action: "ack" };
  }
  try {
    await deps.db
      .insert(deadLetter)
      .values({
        attempts: record.attempts,
        body: record.body,
        error: record.error,
        id: record.id,
        originQueue: record.originQueue,
        queue: record.queue,
        receivedAt: now,
        replayable: record.replayable,
        type: record.type,
      })
      .onConflictDoNothing();
    return { action: "ack" };
  } catch (error) {
    if (message.attempts > DLQ_MAX_RETRIES) {
      console.error(
        `[dlq] lost ${JSON.stringify({ id: record.id, queue, type: record.type })}`
      );
      await countLost(deps.kv, now);
      return { action: "ack" };
    }
    console.error(
      `[dlq] Failed to store message ${record.id} (attempt ${message.attempts}); retrying in ${DLQ_RETRY_DELAY_SECONDS} s:`,
      error
    );
    return { action: "retry", delaySeconds: DLQ_RETRY_DELAY_SECONDS };
  }
}

/** The `queue()` branch for a DLQ batch: one message at a time. */
export async function handleDeadLetterBatch(
  batch: MessageBatch,
  _env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const { db: d1, kv } = siteEnv();
  const deps: DlqDeps = { db: createDb(d1), kv };
  for (const message of batch.messages) {
    // biome-ignore lint/performance/noAwaitInLoops: one message at a time, so a D1 outage retries them in order.
    const decision = await processDeadLetter(batch.queue, message, deps);
    if (decision.action === "retry") {
      message.retry({ delaySeconds: decision.delaySeconds });
    } else {
      message.ack();
    }
  }
}
