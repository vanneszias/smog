/**
 * The `EMAIL_QUEUE` consumer (phase 6 ruling 8). A stub until task 2: it
 * acks every message, so nothing piles up before the consumer exists.
 * Task 2 parses each message, skips one already sent (KV), renders and
 * sends it, and retries a failed send with backoff.
 */
export function handleEmailBatch(
  batch: MessageBatch,
  _env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  for (const message of batch.messages) {
    message.ack();
  }
  console.log(
    `[email-queue] ${batch.messages.length} message(s) acked (the consumer is phase 6 task 2)`
  );
  return Promise.resolve();
}
