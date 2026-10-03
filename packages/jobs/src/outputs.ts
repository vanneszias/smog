/**
 * What a feature service returns for its caller to enqueue after its D1
 * batch committed (phase 6 ruling 8): events for `EVENTS_QUEUE` and keyed
 * emails for `EMAIL_QUEUE`. Every feature and the site put them on the
 * queues with `enqueueOutputs`, and every caller takes the queues from the
 * rpc context's env (`RpcEnv`) or the Worker's bindings: one way in.
 */
import type { OutboxEmail } from "@smog/email";
import type { EmailMessage, EventMessage } from "./messages";
import {
  type EnqueueOptions,
  enqueueEmail,
  enqueueEvent,
  type QueueProducer,
} from "./producers";

/** The two queue bindings (either may be missing in a broken config). */
export interface JobQueues {
  email?: QueueProducer<EmailMessage> | undefined;
  events?: QueueProducer<EventMessage> | undefined;
}

export interface Outputs {
  events: readonly EventMessage[];
  notify: readonly OutboxEmail[];
}

function missing(name: string, onFailure: EnqueueOptions["onFailure"]) {
  const error = new Error(`[jobs] The ${name} binding is missing`);
  console.error(error.message);
  if (onFailure === "throw") {
    throw error;
  }
}

/**
 * Enqueues `outputs`, events first, each message with the producers' 3
 * in-process retries. In `throw` mode (the Mollie webhook, the events
 * consumer) a queue that stays down, or is not bound, throws, so the
 * caller answers 503 or retries and re-derives the outputs; by default it
 * is logged and the answer is `false` (admin actions, crons, polls).
 */
export async function enqueueOutputs(
  queues: JobQueues,
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
