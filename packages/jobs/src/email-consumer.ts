/**
 * The email consumer's core (spec §8.1, §8.3, phase 6 ruling 8): one queue
 * message at a time, parsed, dropped when it is an auth email past its
 * validity, skipped when its idempotency key was sent, rendered in its
 * locale, sent with `From`/`Reply-To` from env, and marked sent. It decides
 * what the queue does with the message and never acks or retries itself:
 * the site's `queue()` handler applies the decision.
 */
import {
  deliverEmail,
  type EmailDeliveryEnv,
  EmailRenderError,
  type EmailSender,
  type EmailTemplateId,
  isPermanentSendError,
  type OutboxEmail,
  sendErrorCode,
} from "@smog/email";
import { emailMessageSchema } from "./messages";

/** How long a sent key is remembered: 7 days (spec §8.1). */
export const EMAIL_SENT_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Retry delays: `base × 2^(attempts − 1)`, at most `max`. Auth emails carry
 * a code or a link valid for minutes, so they retry fast; the others wait
 * from 30 s up to an hour.
 */
const RETRY = {
  auth: { base: 5, max: 60 },
  transactional: { base: 30, max: 60 * 60 },
} as const;

function isAuthTemplate(template: EmailTemplateId): boolean {
  return template.startsWith("auth/");
}

/** The KV marker of a sent idempotency key (at most 11 + 480 bytes). */
export function emailSentKey(idempotencyKey: string): string {
  return `email:sent:${idempotencyKey}`;
}

/**
 * The delay before the next try, in seconds; `attempts` starts at 1.
 * `auth/*`: `min(5 × 2^(n − 1), 60)`; others: `min(30 × 2^(n − 1), 3600)`.
 */
export function emailRetryDelaySeconds(
  attempts: number,
  template: EmailTemplateId
): number {
  const { base, max } = isAuthTemplate(template)
    ? RETRY.auth
    : RETRY.transactional;
  const exponent = Math.max(0, Math.floor(attempts) - 1);
  return Math.min(base * 2 ** exponent, max);
}

/**
 * What the queue does with a message. `ack` ends it: sent, a duplicate of a
 * sent key, an auth email past its validity, an invalid envelope, or a
 * send the Email Service refuses for good (the recipient or the payload).
 * `retry` puts it back after `delaySeconds`; after the consumer's
 * `max_retries` the platform moves it to the DLQ, where it can be replayed
 * (a render failure ends there too).
 */
export type EmailDecision =
  | {
      action: "ack";
      outcome: "duplicate" | "expired" | "invalid" | "refused" | "sent";
    }
  | { action: "retry"; delaySeconds: number };

/** The part of a queue `Message` the consumer reads. */
export interface EmailDelivery {
  /** 1 on the first delivery. */
  attempts: number;
  body: unknown;
  id: string;
  /** When the message was enqueued. */
  timestamp: Date;
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
  /** Epoch ms (tests). */
  now?: () => number;
  sender: EmailSender;
}

/**
 * An error for the logs: its name and the Email Service `code`, never its
 * message, which may name the recipient.
 */
function errorLabel(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const code = sendErrorCode(error);
  return code ? `${name} ${code}` : name;
}

/** The validity of an auth email's code or link, in minutes, or `null`. */
function validMinutes(props: Record<string, unknown>): number | null {
  return typeof props.minutes === "number" && props.minutes > 0
    ? props.minutes
    : null;
}

/**
 * Handles one `EMAIL_QUEUE` message. At least once: a crash between the
 * send and the marker may send twice, and the KV marker is a best-effort
 * filter (KV caches a missing key for up to a minute), not a lock. Each
 * outcome is logged once, with the template, the message id and the
 * attempt, never the address or the props.
 */
export async function processEmailMessage(
  delivery: EmailDelivery,
  { env, kv, now = Date.now, sender }: EmailConsumerDeps
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
  const what = `${message.template} (message ${message.id}, attempt ${delivery.attempts})`;
  const delaySeconds = emailRetryDelaySeconds(
    delivery.attempts,
    message.template
  );

  if (isAuthTemplate(message.template)) {
    const minutes = validMinutes(message.props);
    if (
      minutes !== null &&
      now() - delivery.timestamp.getTime() >= minutes * 60 * 1000
    ) {
      // The code or link no longer works, and a newer one may be on its way.
      console.error(`[email] Dropped ${what}: expired (valid ${minutes} min)`);
      return { action: "ack", outcome: "expired" };
    }
  }

  const marker = message.idempotencyKey
    ? emailSentKey(message.idempotencyKey)
    : null;
  if (marker) {
    try {
      if ((await kv.get(marker)) !== null) {
        console.log(`[email] Skipped ${what}: already sent`);
        return { action: "ack", outcome: "duplicate" };
      }
    } catch (error) {
      console.error(
        `[email] Failed to check ${what} against KV; retrying in ${delaySeconds} s: ${errorLabel(error)}`
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
    if (!(error instanceof EmailRenderError) && isPermanentSendError(error)) {
      console.error(
        `[email] Dropped ${what}: the Email Service refused it for good: ${errorLabel(error)}`
      );
      return { action: "ack", outcome: "refused" };
    }
    // A render failure is retried too: it is a producer bug or version
    // skew, and after the retries the DLQ keeps the message for a replay.
    const step = error instanceof EmailRenderError ? "render" : "send";
    console.error(
      `[email] Failed to ${step} ${what}; retrying in ${delaySeconds} s: ${errorLabel(error)}`
    );
    return { action: "retry", delaySeconds };
  }

  if (marker) {
    try {
      await kv.put(marker, "1", { expirationTtl: EMAIL_SENT_TTL_SECONDS });
    } catch (error) {
      // The email is out: retrying would send it again.
      console.error(
        `[email] Failed to mark ${what} as sent: ${errorLabel(error)}`
      );
    }
  }
  return { action: "ack", outcome: "sent" };
}
