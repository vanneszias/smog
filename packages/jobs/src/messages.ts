/**
 * The typed queue messages (spec §8.1, phase 6 ruling 8). Producers
 * validate before sending; consumers parse again (an invalid message is
 * logged and acked, never retried).
 */
import { LOCALES } from "@smog/config/constants";
import type { OutboxEmail } from "@smog/email";
import { EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import { z } from "zod";

/** Cloudflare Queues' limit for one message. */
export const EMAIL_MESSAGE_MAX_BYTES = 128 * 1024;

/** `EMAIL_QUEUE`: one email to render and send. */
export const emailMessageSchema = z.object({
  /** A new UUID per message, for the logs. */
  id: z.uuid(),
  /** The consumer skips a key it sent in the last 7 days (`email:sent:<key>`). */
  idempotencyKey: z.string().min(1).max(512).optional(),
  locale: z.enum(LOCALES),
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
  z.object({
    renderJobId: z.string().min(1),
    type: z.literal("render.requested"),
  }),
]);

export type EventMessage = z.infer<typeof eventMessageSchema>;

/** The size of a message as the queue counts it (its JSON in UTF-8). */
export function messageBytes(message: unknown): number {
  return new TextEncoder().encode(JSON.stringify(message)).byteLength;
}
