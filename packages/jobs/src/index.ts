// biome-ignore-all lint/performance/noBarrelFile: the `@smog/jobs` entry point.
/**
 * `@smog/jobs`: the typed queue messages, their producers, the cron table,
 * the queue email outbox and the render seam (spec §8.1, phase 6 rulings
 * 7–9). It holds no feature logic: the consumers and cron handlers that
 * call feature services are wired in `apps/site/src/worker/*`.
 */

export { CRON, type CronName, cronName } from "./cron";
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
  type QueueProducer,
} from "./producers";
export { pendingRenderStarter, type RenderStarter } from "./render-starter";
