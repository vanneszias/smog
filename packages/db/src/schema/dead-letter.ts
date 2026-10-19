/** The dead-letter store (phase 9, ruling 5; migration 0013). */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { DEAD_LETTER_ORIGINS } from "../enums";
import { col, inValues, timestamp } from "./columns";

/**
 * One message a DLQ consumer took from `smog-<env>-email-dlq` or
 * `smog-<env>-sponsorship-events-dlq`. `id` is the queue message id, so a
 * redelivery of the same message inserts nothing.
 *
 * Minimisation (ruling 5c): `body` is the message as JSON only when it can
 * be replayed. An email whose template carries a token or a code, a
 * message without an idempotency key, and an invalid message are stored
 * with `body` NULL and `replayable` 0 (they can only be discarded).
 * Nothing in the admin API ever returns `body`. Rows are removed by the
 * daily retention after 14 days and by account deletion (by the body's
 * `to`).
 */
export const deadLetter = sqliteTable(
  "dead_letter",
  {
    id: text("id").primaryKey(),
    /** The DLQ's name (`smog-<env>-email-dlq`). */
    queue: text("queue").notNull(),
    originQueue: text("origin_queue", { enum: DEAD_LETTER_ORIGINS }).notNull(),
    /** The email template id or the event type; `unknown` for an invalid message. */
    type: text("type").notNull(),
    attempts: integer("attempts").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    body: text("body"),
    replayable: integer("replayable", { mode: "boolean" }).notNull(),
    replayedAt: timestamp("replayed_at"),
    discardedAt: timestamp("discarded_at"),
    /** A short reason code (never a body or an address), for the admin. */
    error: text("error"),
  },
  (t) => [
    check(
      "dead_letter_origin_check",
      inValues(t.originQueue, DEAD_LETTER_ORIGINS)
    ),
    check("dead_letter_replayable_check", sql`${col(t.replayable)} IN (0, 1)`),
    // The list's keyset order and the 14-day purge.
    index("dead_letter_received_at_idx").on(t.receivedAt, t.id),
    // The dashboard card and the digest: the unreplayed rows per queue.
    index("dead_letter_open_idx")
      .on(t.originQueue, t.receivedAt)
      .where(
        sql`${col(t.replayedAt)} IS NULL AND ${col(t.discardedAt)} IS NULL`
      ),
  ]
);
