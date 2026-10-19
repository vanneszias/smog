/**
 * The dead-letter side of the queues (phase 9 ruling 5): what the consumers
 * of `smog-<env>-email-dlq` and `smog-<env>-sponsorship-events-dlq` store,
 * what a replay re-enqueues, and the KV keys of the loss counter and the
 * daily digest marker. Pure: the D1 writes are in the site's consumer
 * (`apps/site/src/worker/dlq-queue.ts`) and the admin procedures
 * (`@smog/admin/server`).
 *
 * Minimisation (ruling 5c): the body of an email whose template carries a
 * token or a code (`@smog/email/body-policy`), of one without an
 * idempotency key (a replay must not send twice), and of an invalid
 * message is never stored.
 */
import { carriesSecret } from "@smog/email/body-policy";
import { EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import {
  type EmailMessage,
  type EventMessage,
  emailMessageSchema,
  eventMessageSchema,
} from "./messages";

/**
 * The DLQ consumers' retry budget (ruling 5b): a D1 outage must not lose
 * the dead letters, so a failed store is retried 20 times, 300 s apart
 * (about 100 minutes in all, `wrangler.jsonc`).
 */
export const DLQ_MAX_RETRIES = 20;
export const DLQ_RETRY_DELAY_SECONDS = 300;

/** The queue a dead letter came from; replay re-enqueues there. */
export type DeadLetterOrigin = "email" | "events";

/** `…-email-dlq` and `…-sponsorship-events-dlq`; anything else is not ours. */
const DLQ_SUFFIXES: readonly (readonly [string, DeadLetterOrigin])[] = [
  ["-email-dlq", "email"],
  ["-sponsorship-events-dlq", "events"],
];

/** The origin of a DLQ by its name, or `null` for a queue that is not a DLQ of ours. */
export function deadLetterOrigin(queue: string): DeadLetterOrigin | null {
  for (const [suffix, origin] of DLQ_SUFFIXES) {
    if (queue.endsWith(suffix)) {
      return origin;
    }
  }
  return null;
}

/** Why a dead letter has no body to replay (the `error` column's codes). */
export type DeadLetterReason =
  | "invalid_message"
  | "no_idempotency_key"
  | "secret_template";

/** A dead letter as it is stored (`dead_letter`, without the timestamps). */
export interface DeadLetterRecord {
  attempts: number;
  /** The message as JSON; `null` unless it can be replayed. */
  body: string | null;
  error: DeadLetterReason | null;
  id: string;
  originQueue: DeadLetterOrigin;
  queue: string;
  replayable: boolean;
  /** The template id or the event type; `unknown` for an invalid message. */
  type: string;
}

/** The part of a queue `Message` the consumer reads. */
export interface DeadLetterDelivery {
  attempts: number;
  body: unknown;
  id: string;
}

function templateOf(body: unknown): string {
  if (typeof body === "object" && body !== null && "template" in body) {
    const { template } = body as { template: unknown };
    if (
      typeof template === "string" &&
      (EMAIL_TEMPLATE_IDS as readonly string[]).includes(template)
    ) {
      return template;
    }
  }
  return "unknown";
}

function eventTypeOf(body: unknown): string {
  if (typeof body === "object" && body !== null && "type" in body) {
    const { type } = body as { type: unknown };
    if (type === "payment.settled" || type === "render.requested") {
      return type;
    }
  }
  return "unknown";
}

/**
 * The record to store for one message of `queue` (`null` when `queue` is
 * not one of our DLQs). An email is stored with its body only when its
 * template carries no token or code and it has an idempotency key; an
 * event carries ids only and is always stored with its body when valid.
 */
export function toDeadLetter(
  queue: string,
  message: DeadLetterDelivery
): DeadLetterRecord | null {
  const originQueue = deadLetterOrigin(queue);
  if (originQueue === null) {
    return null;
  }
  const base = {
    attempts: message.attempts,
    id: message.id,
    originQueue,
    queue,
  };
  if (originQueue === "events") {
    const parsed = eventMessageSchema.safeParse(message.body);
    return parsed.success
      ? {
          ...base,
          body: JSON.stringify(parsed.data),
          error: null,
          replayable: true,
          type: parsed.data.type,
        }
      : {
          ...base,
          body: null,
          error: "invalid_message",
          replayable: false,
          type: eventTypeOf(message.body),
        };
  }
  const parsed = emailMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    return {
      ...base,
      body: null,
      error: "invalid_message",
      replayable: false,
      type: templateOf(message.body),
    };
  }
  const { template } = parsed.data;
  if (carriesSecret(template)) {
    return {
      ...base,
      body: null,
      error: "secret_template",
      replayable: false,
      type: template,
    };
  }
  if (parsed.data.idempotencyKey === undefined) {
    return {
      ...base,
      body: null,
      error: "no_idempotency_key",
      replayable: false,
      type: template,
    };
  }
  return {
    ...base,
    body: JSON.stringify(parsed.data),
    error: null,
    replayable: true,
    type: template,
  };
}

/** What a replay puts back on the origin queue, or why it cannot. */
export type ReplayMessage =
  | { email: Omit<EmailMessage, "id">; kind: "email" }
  | { event: EventMessage; kind: "event" }
  | { kind: "refused"; reason: DeadLetterReason | "no_body" };

/**
 * Reads a stored body for a replay. An email must carry an idempotency
 * key (the consumer skips a key it already sent, so a replay of a message
 * that was in fact delivered cannot send twice): without one the replay is
 * refused, whatever `replayable` says. An email of a template that carries
 * a secret is refused too, in case such a body was stored by an older
 * deploy.
 */
export function toReplayMessage(
  origin: DeadLetterOrigin,
  body: string | null
): ReplayMessage {
  if (body === null) {
    return { kind: "refused", reason: "no_body" };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { kind: "refused", reason: "invalid_message" };
  }
  if (origin === "events") {
    const parsed = eventMessageSchema.safeParse(json);
    return parsed.success
      ? { event: parsed.data, kind: "event" }
      : { kind: "refused", reason: "invalid_message" };
  }
  const parsed = emailMessageSchema.safeParse(json);
  if (!parsed.success) {
    return { kind: "refused", reason: "invalid_message" };
  }
  if (carriesSecret(parsed.data.template)) {
    return { kind: "refused", reason: "secret_template" };
  }
  if (parsed.data.idempotencyKey === undefined) {
    return { kind: "refused", reason: "no_idempotency_key" };
  }
  const { id: _id, ...email } = parsed.data;
  return { email: email as unknown as Omit<EmailMessage, "id">, kind: "email" };
}

// ── The loss counter and the digest marker (KV) ───────────────────────────

/** A KV key of the loss counter: `dlq-lost:<yyyy-mm-dd>` (UTC). */
export const DLQ_LOST_PREFIX = "dlq-lost:";
/** The counters and the digest marker live 3 days. */
export const DLQ_KV_TTL_SECONDS = 3 * 24 * 60 * 60;

/** `yyyy-mm-dd` in UTC. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function lostCounterKey(now: Date): string {
  return `${DLQ_LOST_PREFIX}${utcDay(now)}`;
}

/** The KV key of the day's digest marker, written after its send was enqueued. */
export function digestMarkerKey(now: Date): string {
  return `dlq-digest:${utcDay(now)}`;
}

/** The part of a KV namespace the counter uses. */
export interface DlqKv {
  get: (key: string) => Promise<string | null>;
  put: (
    key: string,
    value: string,
    options: { expirationTtl: number }
  ) => Promise<void>;
}

/**
 * Counts a message lost for good (the store failed on its last delivery)
 * in `dlq-lost:<date>`. KV has no increment: a read then a write, so two
 * losses at the very same moment may count once; the `[dlq] lost` log line
 * is the exact record. Never throws (KV may be down too).
 */
export async function countLost(kv: DlqKv, now: Date): Promise<void> {
  const key = lostCounterKey(now);
  try {
    const current = Number.parseInt((await kv.get(key)) ?? "0", 10);
    await kv.put(key, String((Number.isFinite(current) ? current : 0) + 1), {
      expirationTtl: DLQ_KV_TTL_SECONDS,
    });
  } catch (error) {
    console.error("[dlq] Failed to count a lost message:", error);
  }
}
