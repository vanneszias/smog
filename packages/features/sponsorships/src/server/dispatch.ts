/**
 * Enqueues what a settle (or another service) returns, after its batch
 * committed (ruling 8): the `payment.settled` / `render.requested` events
 * on `EVENTS_QUEUE` and the keyed emails on `EMAIL_QUEUE`. Every output is
 * enqueued whatever the outcome; a retry re-derives them from D1 and the
 * idempotency keys make the resends safe (task 3 fix round 1, I-1).
 */
import type { OutboxEmail } from "@smog/email";
import {
  type EmailMessage,
  type EnqueueOptions,
  type EventMessage,
  enqueueEmail,
  enqueueEvent,
  type QueueProducer,
} from "@smog/jobs";

export interface SponsorshipQueues {
  email?: QueueProducer<EmailMessage> | undefined;
  events?: QueueProducer<EventMessage> | undefined;
}

export interface Outputs {
  events: readonly EventMessage[];
  notify: readonly OutboxEmail[];
}

function missing(name: string, onFailure: EnqueueOptions["onFailure"]) {
  const error = new Error(`[sponsorships] The ${name} binding is missing`);
  console.error(error.message);
  if (onFailure === "throw") {
    throw error;
  }
}

/**
 * Enqueues `outputs`, events first. With `onFailure: "throw"` (the Mollie
 * webhook, the events consumer) a queue that stays down or is not bound
 * throws, so the caller answers 503 or retries; otherwise it is logged and
 * the answer is `false`.
 */
export async function enqueueOutputs(
  queues: SponsorshipQueues,
  outputs: Outputs,
  options: EnqueueOptions = {}
): Promise<boolean> {
  let all = true;
  if (outputs.events.length > 0 && !queues.events) {
    missing("EVENTS_QUEUE", options.onFailure);
    all = false;
  }
  if (outputs.notify.length > 0 && !queues.email) {
    missing("EMAIL_QUEUE", options.onFailure);
    all = false;
  }
  const { email, events } = queues;
  if (events) {
    for (const event of outputs.events) {
      // biome-ignore lint/performance/noAwaitInLoops: in order, each with its own retries.
      all = (await enqueueEvent(events, event, options)) && all;
    }
  }
  if (email) {
    for (const message of outputs.notify) {
      // biome-ignore lint/performance/noAwaitInLoops: in order, each with its own retries.
      all = (await enqueueEmail(email, message, options)) !== null && all;
    }
  }
  return all;
}
