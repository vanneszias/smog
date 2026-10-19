import { handleDeadLetterBatch } from "@/worker/dlq-queue";
import { handleEmailBatch } from "@/worker/email-queue";
import { handleEventsBatch } from "@/worker/events-queue";

/**
 * The consumers this Worker runs, by queue name suffix (`smog-<env>-…`).
 * The DLQs come first: `…-email-dlq` must not be read as `…-email`.
 */
const QUEUE_SUFFIXES = {
  dlq: ["-email-dlq", "-sponsorship-events-dlq"],
  email: ["-email"],
  events: ["-sponsorship-events"],
} as const;

export type QueueKind = keyof typeof QUEUE_SUFFIXES;

/**
 * Which consumer a batch is for. Only the suffix counts, so one Worker
 * serves `smog-dev-email`, `smog-staging-email` and `smog-production-email`
 * alike. The two DLQs (`…-dlq`) have a consumer too since phase 9: they
 * are `dlq` (an ordinary queue takes one push consumer); any other queue
 * is `null`.
 */
export function queueKind(queue: string): QueueKind | null {
  for (const [kind, suffixes] of Object.entries(QUEUE_SUFFIXES)) {
    if (suffixes.some((suffix) => queue.endsWith(suffix))) {
      return kind as QueueKind;
    }
  }
  return null;
}

/**
 * The Worker's `queue()` handler: the email consumer (task 2), the
 * sponsorship-events consumer (task 4) or a dead-letter consumer (phase 9
 * task 4). A batch from any other queue is logged and acked, so it never
 * retries into a DLQ.
 */
export async function dispatchQueue(
  batch: MessageBatch,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  switch (queueKind(batch.queue)) {
    case "dlq":
      await handleDeadLetterBatch(batch, env, ctx);
      return;
    case "email":
      await handleEmailBatch(batch, env, ctx);
      return;
    case "events":
      await handleEventsBatch(batch, env, ctx);
      return;
    default:
      console.warn(
        `[worker] Acked ${batch.messages.length} message(s) from an unknown queue ${batch.queue}`
      );
      batch.ackAll();
  }
}
