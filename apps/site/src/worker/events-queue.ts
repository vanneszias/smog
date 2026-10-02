/**
 * The `EVENTS_QUEUE` (`smog-<env>-sponsorship-events`) consumer. A stub
 * until phase 6 task 4: it acks every message. Task 4 handles
 * `payment.settled` (render jobs and emails) and `render.requested` (the
 * `RenderStarter` of ruling 7).
 */
export function handleEventsBatch(
  batch: MessageBatch,
  _env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  for (const message of batch.messages) {
    message.ack();
  }
  console.log(
    `[events-queue] ${batch.messages.length} message(s) acked (the consumer is phase 6 task 4)`
  );
  return Promise.resolve();
}
