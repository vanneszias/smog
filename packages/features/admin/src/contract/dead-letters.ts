import { baseContract } from "@smog/rpc/contract";
import {
  deadLetterDiscardResultSchema,
  deadLetterIdInputSchema,
  deadLetterInvalidStateDataSchema,
  deadLetterListInputSchema,
  deadLetterPageSchema,
  deadLetterReplayResultSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

/**
 * A refused replay or discard: `INVALID_STATE` with a `reason`
 * (`alreadyHandled`, `notReplayable`; copy `admin.deadLetters.errors.*`).
 */
const DEAD_LETTERS_ERRORS = {
  INVALID_STATE: { data: deadLetterInvalidStateDataSchema, status: 409 },
} as const;

const deadLettersContract = baseContract.errors(DEAD_LETTERS_ERRORS);

/**
 * `admin.deadLetters.*` (phase 9 task 4, ruling 5): the messages the DLQ
 * consumers stored in D1. **No procedure returns a stored body** (an
 * address, an email's props): only the queue, the type, the counts, the
 * times and a reason code. Every write is audited in the same D1 batch
 * (`dead_letter.replay`, `dead_letter.discard`).
 */
export const deadLettersSlice = {
  deadLetters: {
    /**
     * Discards a message that is still open: it is never processed. Also
     * for one that cannot be replayed. `NOT_FOUND` for an unknown id;
     * `INVALID_STATE alreadyHandled` when it was replayed or discarded.
     */
    discard: deadLettersContract
      .input(deadLetterIdInputSchema)
      .output(deadLetterDiscardResultSchema),
    /**
     * Newest first (`received_at, id` keyset), by status (default `open`)
     * and queue.
     */
    list: baseContract
      .input(deadLetterListInputSchema)
      .output(deadLetterPageSchema),
    /**
     * Puts the stored message back on its origin queue and sets
     * `replayed_at`. Refused with `INVALID_STATE`: `alreadyHandled` (a
     * second replay, or after a discard) and `notReplayable` (no body was
     * stored: an email with a code or a secret link, an invalid message, or
     * one without an idempotency key, which could send twice). An email is
     * re-enqueued with its original idempotency key, so one that was in
     * fact sent is skipped by the consumer. `NOT_FOUND` for an unknown id;
     * a failed enqueue changes nothing and is an error.
     */
    replay: deadLettersContract
      .input(deadLetterIdInputSchema)
      .output(deadLetterReplayResultSchema),
  },
};

export const ADMIN_PROCEDURES = {
  "deadLetters.discard": { audit: "dead_letter.discard" },
  "deadLetters.list": "read",
  "deadLetters.replay": { audit: "dead_letter.replay" },
} as const satisfies AdminProcedures<typeof deadLettersSlice>;
