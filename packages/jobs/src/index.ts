// biome-ignore-all lint/performance/noBarrelFile: the `@smog/jobs` entry point.
/**
 * `@smog/jobs`: the typed queue messages, their producers, the cron table,
 * the queue email outbox (spec §8.1, phase 6 rulings
 * 7–9). It holds no feature logic: the consumers and cron handlers that
 * call feature services are wired in `apps/site/src/worker/*`.
 */

export { CRON, type CronName, cronName } from "./cron";
export {
  countLost,
  type DeadLetterDelivery,
  type DeadLetterOrigin,
  type DeadLetterReason,
  type DeadLetterRecord,
  DLQ_KV_TTL_SECONDS,
  DLQ_LOST_PREFIX,
  DLQ_MAX_RETRIES,
  DLQ_RETRY_DELAY_SECONDS,
  type DlqKv,
  deadLetterOrigin,
  digestMarkerKey,
  lostCounterKey,
  type ReplayMessage,
  toDeadLetter,
  toReplayMessage,
  utcDay,
} from "./dead-letter";
export {
  EMAIL_SENT_TTL_SECONDS,
  type EmailConsumerDeps,
  type EmailDecision,
  type EmailDelivery,
  type EmailSentStore,
  emailRetryDelaySeconds,
  emailSentKey,
  processEmailMessage,
} from "./email-consumer";
export {
  EMAIL_IDEMPOTENCY_KEY_MAX,
  EMAIL_MESSAGE_MAX_BYTES,
  type EmailMessage,
  type EventMessage,
  emailMessageSchema,
  eventMessageSchema,
  messageBytes,
} from "./messages";
export { QueueEmailOutbox } from "./outbox";
export { enqueueOutputs, type JobQueues, type Outputs } from "./outputs";
export {
  ENQUEUE_RETRY_DELAYS_MS,
  type EnqueueOptions,
  enqueueEmail,
  enqueueEvent,
  InvalidMessageError,
  type QueueProducer,
} from "./producers";
