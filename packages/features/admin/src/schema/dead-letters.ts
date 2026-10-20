/**
 * `admin.deadLetters.*` (phase 9 task 4, ruling 5): the shapes of the dead
 * letters the DLQ consumers stored in D1. **No shape here has a body**: the
 * stored message (an address, an email's props) is never returned, by the
 * list, the detail or anything else (ruling 5c). Client-safe.
 */
import { DEAD_LETTER_ORIGINS } from "@smog/db/enums";
import { z } from "zod";

export const DEAD_LETTER_PAGE_MAX = 100;
export const DEAD_LETTER_PAGE_DEFAULT = 50;

export const deadLetterOriginSchema = z.enum(DEAD_LETTER_ORIGINS);

/** `open`: neither replayed nor discarded. */
export const DEAD_LETTER_STATUSES = ["open", "replayed", "discarded"] as const;
export type DeadLetterStatus = (typeof DEAD_LETTER_STATUSES)[number];
export const deadLetterStatusSchema = z.enum(DEAD_LETTER_STATUSES);

export const deadLetterListInputSchema = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEAD_LETTER_PAGE_MAX)
    .default(DEAD_LETTER_PAGE_DEFAULT),
  /** The queue the message came from. */
  queue: deadLetterOriginSchema.optional(),
  /** Defaults to `open`. */
  status: deadLetterStatusSchema.default("open"),
});

export type DeadLetterListInput = z.input<typeof deadLetterListInputSchema>;
export type DeadLetterListQuery = z.output<typeof deadLetterListInputSchema>;

/** One dead letter as the admin sees it: no body, no address. */
export const deadLetterSchema = z.object({
  attempts: z.number().int().nonnegative(),
  /** Epoch milliseconds, or `null`. */
  discardedAt: z.number().int().nullable(),
  /** A short reason code why it cannot be replayed, or `null`. */
  error: z.string().nullable(),
  id: z.string(),
  queue: deadLetterOriginSchema,
  /** Epoch milliseconds. */
  receivedAt: z.number().int(),
  replayable: z.boolean(),
  replayedAt: z.number().int().nullable(),
  status: deadLetterStatusSchema,
  /** The email template id or the event type (`unknown` for an invalid message). */
  type: z.string(),
});

export type DeadLetter = z.infer<typeof deadLetterSchema>;

export const deadLetterPageSchema = z.object({
  items: z.array(deadLetterSchema),
  /** Pass as `cursor` for the next (older) page; `null` on the last. */
  nextCursor: z.string().nullable(),
});

export type DeadLetterPage = z.infer<typeof deadLetterPageSchema>;

export const deadLetterIdInputSchema = z.object({
  id: z.string().min(1).max(200),
});

/**
 * Why a replay or a discard was refused (`INVALID_STATE`): someone already
 * replayed or discarded the message, or it cannot be replayed (no body was
 * stored, or it has no idempotency key).
 */
export const DEAD_LETTER_REFUSALS = [
  "alreadyHandled",
  "notReplayable",
] as const;
export type DeadLetterRefusal = (typeof DEAD_LETTER_REFUSALS)[number];

export const deadLetterInvalidStateDataSchema = z.object({
  reason: z.enum(DEAD_LETTER_REFUSALS),
});

export const deadLetterReplayResultSchema = z.object({
  /** Epoch milliseconds. */
  replayedAt: z.number().int(),
});

export const deadLetterDiscardResultSchema = z.object({
  /** Epoch milliseconds. */
  discardedAt: z.number().int(),
});

/** The dashboard card: what waits, per queue, and for how long. */
export const dashboardDeadLettersSchema = z.object({
  email: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  /** Epoch milliseconds of the oldest open dead letter, or `null`. */
  oldestReceivedAt: z.number().int().nullable(),
});
