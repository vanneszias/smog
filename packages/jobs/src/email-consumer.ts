/**
 * The email consumer's core (spec §8.1, §8.3, phase 6 ruling 8): one queue
 * message at a time, parsed, skipped when its idempotency key was sent,
 * rendered in its locale, sent with `From`/`Reply-To` from env, and marked
 * sent. It decides what the queue does with the message and never acks or
 * retries itself: the site's `queue()` handler applies the decision.
 */
import {
  deliverEmail,
  type EmailDeliveryEnv,
  EmailRenderError,
  type EmailSender,
  type OutboxEmail,
} from "@smog/email";
import { emailMessageSchema } from "./messages";

/** How long a sent key is remembered: 7 days (spec §8.1). */
export const EMAIL_SENT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** The first retry waits 30 s, each next one twice as long, at most an hour. */
const RETRY_BASE_SECONDS = 30;
const RETRY_MAX_SECONDS = 60 * 60;

/** The KV marker of a sent idempotency key (at most 11 + 480 bytes). */
export function emailSentKey(idempotencyKey: string): string {
  return `email:sent:${idempotencyKey}`;
}

/** `min(30 × 2^(attempts − 1), 3600)` seconds; `attempts` starts at 1. */
export function emailRetryDelaySeconds(attempts: number): number {
  const exponent = Math.max(0, Math.floor(attempts) - 1);
  return Math.min(RETRY_BASE_SECONDS * 2 ** exponent, RETRY_MAX_SECONDS);
}

/**
 * What the queue does with a message. `ack` ends it: sent, a duplicate of a
 * sent key, or a message retrying cannot fix (invalid, unrenderable).
 * `retry` puts it back after `delaySeconds`; after the consumer's
 * `max_retries` the platform moves it to the DLQ.
 */
export type EmailDecision =
  | {
      action: "ack";
      outcome: "duplicate" | "invalid" | "sent" | "unrenderable";
    }
  | { action: "retry"; delaySeconds: number };

/** The part of a queue `Message` the consumer reads. */
export interface EmailDelivery {
  /** 1 on the first delivery. */
  attempts: number;
  body: unknown;
  id: string;
}

/** The KV calls the idempotency markers use (the `KV` binding in the site). */
export interface EmailSentStore {
  get: (key: string) => Promise<string | null>;
  put: (
    key: string,
    value: string,
    options: { expirationTtl: number }
  ) => Promise<void>;
}

export interface EmailConsumerDeps {
  env: EmailDeliveryEnv;
  kv: EmailSentStore;
  sender: EmailSender;
}

/**
 * Handles one `EMAIL_QUEUE` message. At least once: a crash between the
 * send and the marker may send twice, which is accepted (ruling 8). Logs
 * carry the template and the message id, never the address or the props.
 */
export async function processEmailMessage(
  delivery: EmailDelivery,
  { env, kv, sender }: EmailConsumerDeps
): Promise<EmailDecision> {
  const parsed = emailMessageSchema.safeParse(delivery.body);
  if (!parsed.success) {
    console.error(
      `[email] Dropped an invalid message ${delivery.id}: ${parsed.error.issues
        .map((issue) => issue.path.join(".") || "(body)")
        .join(", ")}`
    );
    return { action: "ack", outcome: "invalid" };
  }
  const message = parsed.data;
  const what = `${message.template} (message ${message.id}`;
  const marker = message.idempotencyKey
    ? emailSentKey(message.idempotencyKey)
    : null;

  if (marker) {
    try {
      if ((await kv.get(marker)) !== null) {
        console.log(`[email] Skipped ${what}): already sent`);
        return { action: "ack", outcome: "duplicate" };
      }
    } catch (error) {
      const delaySeconds = emailRetryDelaySeconds(delivery.attempts);
      console.error(
        `[email] Failed to check ${what}) against KV; retrying in ${delaySeconds} s:`,
        error
      );
      return { action: "retry", delaySeconds };
    }
  }

  try {
    // The schema checked the envelope; the template's own types checked
    // the props at the producer, and a render failure is caught below.
    await deliverEmail(sender, {
      email: message as unknown as OutboxEmail,
      env,
    });
  } catch (error) {
    if (error instanceof EmailRenderError) {
      console.error(`[email] Dropped ${what}): it cannot be rendered`, error);
      return { action: "ack", outcome: "unrenderable" };
    }
    const delaySeconds = emailRetryDelaySeconds(delivery.attempts);
    console.error(
      `[email] Failed to send ${what}, attempt ${delivery.attempts}); retrying in ${delaySeconds} s:`,
      error
    );
    return { action: "retry", delaySeconds };
  }

  if (marker) {
    try {
      await kv.put(marker, "1", { expirationTtl: EMAIL_SENT_TTL_SECONDS });
    } catch (error) {
      // The email is out: retrying would send it again.
      console.error(`[email] Failed to mark ${what}) as sent:`, error);
    }
  }
  return { action: "ack", outcome: "sent" };
}
