/**
 * The producers (phase 6 ruling 8). State is written first; the message is
 * enqueued after the D1 batch. A failed send is retried 3 times in the
 * process (100, 400 and 1600 ms). After that it is logged
 * `[jobs] Failed to enqueue <type>` and, by default, swallowed: queues are
 * highly available, and an admin action or a cron must not fail after its
 * change is committed. The Mollie webhook passes `onFailure: "throw"`, so it
 * answers 503 and Mollie retries.
 */
import { newId } from "@smog/utils";
import {
  EMAIL_MESSAGE_MAX_BYTES,
  type EmailMessage,
  type EventMessage,
  emailMessageSchema,
  eventMessageSchema,
  messageBytes,
} from "./messages";

/** The part of a Cloudflare `Queue` binding a producer uses. */
export interface QueueProducer<Body> {
  send: (
    body: Body,
    options?: { contentType?: "json"; delaySeconds?: number }
  ) => Promise<unknown>;
}

export const ENQUEUE_RETRY_DELAYS_MS = [100, 400, 1600] as const;

/**
 * A message that cannot be enqueued as it is (it fails its schema, or is
 * over 128 KB): a bug or bad data, which no retry fixes.
 */
export class InvalidMessageError extends Error {
  /** The template or event type, for the log line. */
  readonly what: string;

  constructor(message: string, what: string) {
    super(message);
    this.name = "InvalidMessageError";
    this.what = what;
  }
}

export interface EnqueueOptions {
  /** `log` (default): log and swallow after the retries; `throw`: rethrow. */
  onFailure?: "log" | "throw";
  /** Tests skip the real waits. */
  sleep?: (ms: number) => Promise<void>;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** One send plus the retries. `true` when the queue took the message. */
async function sendWithRetries<Body>(
  queue: QueueProducer<Body>,
  body: Body,
  what: string,
  { onFailure = "log", sleep = wait }: EnqueueOptions
): Promise<boolean> {
  let lastError: unknown;
  for (
    let attempt = 0;
    attempt <= ENQUEUE_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    if (attempt > 0) {
      // biome-ignore lint/performance/noAwaitInLoops: retries wait their backoff, one after another.
      await sleep(ENQUEUE_RETRY_DELAYS_MS[attempt - 1] ?? 0);
    }
    try {
      await queue.send(body, { contentType: "json" });
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  console.error(`[jobs] Failed to enqueue ${what}:`, lastError);
  if (onFailure === "throw") {
    throw lastError;
  }
  return false;
}

/**
 * Validates an email (a new `id`, the schema, at most 128 KB) and puts it
 * on `EMAIL_QUEUE`. Returns the message, or `null` when the queue stayed
 * down and the failure was swallowed. An invalid message always throws
 * `InvalidMessageError`: retrying would not help (`enqueueOutputs` drops
 * it and goes on).
 */
export async function enqueueEmail(
  queue: QueueProducer<EmailMessage>,
  email: Omit<EmailMessage, "id">,
  options: EnqueueOptions = {}
): Promise<EmailMessage | null> {
  const message = { ...email, id: newId() } as EmailMessage;
  const parsed = emailMessageSchema.safeParse(message);
  if (!parsed.success) {
    const error = new InvalidMessageError(
      `[jobs] Invalid email message for ${String(email.template)}: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
      String(email.template)
    );
    console.error(error.message);
    throw error;
  }
  const bytes = messageBytes(message);
  if (bytes > EMAIL_MESSAGE_MAX_BYTES) {
    const error = new InvalidMessageError(
      `[jobs] The ${message.template} message is ${bytes} bytes; a queue message holds at most 128 KB`,
      message.template
    );
    console.error(error.message);
    throw error;
  }
  const sent = await sendWithRetries(queue, message, message.template, options);
  return sent ? message : null;
}

/**
 * Validates an event and puts it on `EVENTS_QUEUE`. `false` when the queue
 * stayed down and the failure was swallowed.
 */
export async function enqueueEvent(
  queue: QueueProducer<EventMessage>,
  event: EventMessage,
  options: EnqueueOptions = {}
): Promise<boolean> {
  const parsed = eventMessageSchema.safeParse(event);
  if (!parsed.success) {
    const error = new InvalidMessageError(
      `[jobs] Invalid event message: ${JSON.stringify(event)}`,
      String((event as { type?: unknown }).type)
    );
    console.error(error.message);
    throw error;
  }
  return await sendWithRetries(queue, parsed.data, parsed.data.type, options);
}
