/**
 * The typed queue messages (spec §8.1, phase 6 ruling 8). Producers
 * validate before sending; consumers parse again (an invalid message is
 * logged and acked, never retried).
 */
import { localeCodeSchema } from "@smog/config/locale";
import type { OutboxEmail } from "@smog/email";
import { EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import { z } from "zod";

/** Cloudflare Queues' limit for one message. */
export const EMAIL_MESSAGE_MAX_BYTES = 128 * 1024;

/**
 * The consumer marks a sent key as KV `email:sent:<key>`, and a KV key
 * holds at most 512 bytes: 480 leaves room for the prefix (M6).
 */
export const EMAIL_IDEMPOTENCY_KEY_MAX = 480;

/** `EMAIL_QUEUE`: one email to render and send. */
export const emailMessageSchema = z.object({
  /** A new UUID per message, for the logs. */
  id: z.uuid(),
  /** The consumer skips a key it sent in the last 7 days (`email:sent:<key>`). */
  idempotencyKey: z.string().min(1).max(EMAIL_IDEMPOTENCY_KEY_MAX).optional(),
  locale: localeCodeSchema,
  /** The template's props; the template's own types checked them at the producer. */
  props: z.record(z.string(), z.unknown()),
  template: z.enum(EMAIL_TEMPLATE_IDS),
  to: z.email(),
});

/** What travels on `EMAIL_QUEUE`: an outbox email plus its message id. */
export type EmailMessage = OutboxEmail & { id: string };

/** `EVENTS_QUEUE` (`smog-<env>-sponsorship-events`). */
export const eventMessageSchema = z.discriminatedUnion("type", [
  z.object({
    paymentId: z.string().min(1),
    type: z.literal("payment.settled"),
  }),
  /**
   * Legacy (phase 10b task 9): nothing produces it any more, but a message
   * queued or dead-lettered before the render pipeline was retired still
   * parses, and the events consumer acks it without acting.
   */
  z.object({
    renderJobId: z.string().min(1),
    type: z.literal("render.requested"),
  }),
]);

export type EventMessage = z.infer<typeof eventMessageSchema>;

/**
 * The size of a message as the queue stores it: the producers send with
 * `contentType: "json"`, so this is its JSON in UTF-8 (the default `v8`
 * serialisation would count differently, M7).
 */
export function messageBytes(message: unknown): number {
  return new TextEncoder().encode(JSON.stringify(message)).byteLength;
}
