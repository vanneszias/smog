import {
  type DeadLetterOrigin,
  deadLetter,
  failWhen,
  type Statement,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import {
  enqueueEmail,
  enqueueEvent,
  InvalidMessageError,
  type JobQueues,
  toReplayMessage,
} from "@smog/jobs";
import type { RpcContext } from "@smog/rpc";
import { decodeCursorAs, encodeCursor, InvalidCursorError } from "@smog/utils";
import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type {
  DeadLetter,
  DeadLetterListQuery,
  DeadLetterPage,
  DeadLetterRefusal,
  DeadLetterStatus,
} from "../schema";
import { auditStatement } from "./audit-writer";
import { adminProcedure } from "./procedure";

/** The keyset position of the last row of a page (newest first). */
interface Position {
  id: string;
  receivedAt: number;
}

function parseCursor(cursor: string): Position {
  return decodeCursorAs(cursor, (key) => {
    const [receivedAt, id] = key;
    return key.length === 2 &&
      typeof receivedAt === "number" &&
      Number.isInteger(receivedAt) &&
      typeof id === "string"
      ? { id, receivedAt }
      : null;
  });
}

/** The rows of a status: `open` has neither timestamp set. */
function statusWhere(status: DeadLetterStatus): SQL | undefined {
  switch (status) {
    case "open":
      return and(isNull(deadLetter.replayedAt), isNull(deadLetter.discardedAt));
    case "replayed":
      return isNotNull(deadLetter.replayedAt);
    default:
      return isNotNull(deadLetter.discardedAt);
  }
}

/** Older than the position in `(received_at DESC, id DESC)` order. */
function before(position: Position): SQL | undefined {
  const at = new Date(position.receivedAt);
  return and(
    lte(deadLetter.receivedAt, at),
    or(lt(deadLetter.receivedAt, at), lt(deadLetter.id, position.id))
  );
}

/**
 * The columns the admin may see: **never `body`** (an address, an email's
 * props; phase 9 ruling 5c). The list selects these and nothing else.
 */
const SAFE_COLUMNS = {
  attempts: deadLetter.attempts,
  discardedAt: deadLetter.discardedAt,
  error: deadLetter.error,
  id: deadLetter.id,
  originQueue: deadLetter.originQueue,
  receivedAt: deadLetter.receivedAt,
  replayable: deadLetter.replayable,
  replayedAt: deadLetter.replayedAt,
  type: deadLetter.type,
} as const;

interface SafeRow {
  attempts: number;
  discardedAt: Date | null;
  error: string | null;
  id: string;
  originQueue: DeadLetterOrigin;
  receivedAt: Date;
  replayable: boolean;
  replayedAt: Date | null;
  type: string;
}

function statusOf(
  row: Pick<SafeRow, "discardedAt" | "replayedAt">
): DeadLetterStatus {
  if (row.replayedAt !== null) {
    return "replayed";
  }
  return row.discardedAt === null ? "open" : "discarded";
}

function toItem(row: SafeRow): DeadLetter {
  return {
    attempts: row.attempts,
    discardedAt: row.discardedAt?.getTime() ?? null,
    error: row.error,
    id: row.id,
    queue: row.originQueue,
    receivedAt: row.receivedAt.getTime(),
    replayable: row.replayable,
    replayedAt: row.replayedAt?.getTime() ?? null,
    status: statusOf(row),
    type: row.type,
  };
}

/** A page of dead letters (`InvalidCursorError` for a foreign cursor). */
async function listDeadLetters(
  db: Db,
  input: DeadLetterListQuery
): Promise<DeadLetterPage> {
  const { cursor, limit, queue, status } = input;
  const position = cursor === undefined ? null : parseCursor(cursor);
  try {
    const rows = await db
      .select(SAFE_COLUMNS)
      .from(deadLetter)
      .where(
        and(
          statusWhere(status),
          queue ? eq(deadLetter.originQueue, queue) : undefined,
          position ? before(position) : undefined
        )
      )
      .orderBy(desc(deadLetter.receivedAt), desc(deadLetter.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toItem),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor([last.receivedAt.getTime(), last.id])
          : null,
    };
  } catch (error) {
    console.error("[admin] Failed to list the dead letters:", error);
    throw error;
  }
}

/** What a replay or a discard reads of a row; the body only for a replay. */
interface Target {
  body: string | null;
  discardedAt: Date | null;
  id: string;
  originQueue: DeadLetterOrigin;
  replayable: boolean;
  replayedAt: Date | null;
  type: string;
}

async function targetOf(db: Db, id: string): Promise<Target | undefined> {
  const [row] = await db
    .select({
      body: deadLetter.body,
      discardedAt: deadLetter.discardedAt,
      id: deadLetter.id,
      originQueue: deadLetter.originQueue,
      replayable: deadLetter.replayable,
      replayedAt: deadLetter.replayedAt,
      type: deadLetter.type,
    })
    .from(deadLetter)
    .where(eq(deadLetter.id, id))
    .limit(1);
  return row;
}

/** The rpc env's queue bindings (the one way in, as the sponsorship actions). */
function queuesOf(context: RpcContext): JobQueues {
  return {
    email: context.env.EMAIL_QUEUE as JobQueues["email"],
    events: context.env.EVENTS_QUEUE as JobQueues["events"],
  };
}

/**
 * Puts the stored message back on its origin queue, or says why it cannot:
 * a refusal reason, or `null` once the queue took it. A failed enqueue
 * throws (nothing was changed yet). An email goes back with its original
 * idempotency key, so the consumer skips one that was in fact sent; one
 * without a key is refused (`toReplayMessage`).
 */
async function enqueueAgain(
  context: RpcContext,
  target: Target
): Promise<DeadLetterRefusal | null> {
  const replay = toReplayMessage(target.originQueue, target.body);
  if (replay.kind === "refused") {
    return "notReplayable";
  }
  const queues = queuesOf(context);
  try {
    if (replay.kind === "email") {
      if (!queues.email) {
        throw new Error("[admin] The EMAIL_QUEUE binding is missing");
      }
      await enqueueEmail(queues.email, replay.email, { onFailure: "throw" });
    } else {
      if (!queues.events) {
        throw new Error("[admin] The EVENTS_QUEUE binding is missing");
      }
      await enqueueEvent(queues.events, replay.event, { onFailure: "throw" });
    }
  } catch (error) {
    if (error instanceof InvalidMessageError) {
      return "notReplayable";
    }
    console.error(
      `[admin] Failed to put dead letter ${target.id} back on its queue:`,
      error
    );
    throw error;
  }
  return null;
}

/**
 * The claim and its audit entry, one D1 batch: the row is updated only
 * while it is still open, and a guard fails the whole batch (and so the
 * entry) when no row changed (a second admin was first). `true` when this
 * call claimed the row, `false` when it lost the race.
 */
async function claim(
  db: Db,
  target: Target,
  column: "discardedAt" | "replayedAt",
  at: Date,
  audit: Statement
): Promise<boolean> {
  const update = db
    .update(deadLetter)
    .set({ [column]: at })
    .where(
      and(
        eq(deadLetter.id, target.id),
        isNull(deadLetter.replayedAt),
        isNull(deadLetter.discardedAt)
      )
    );
  try {
    await db.batch([
      update,
      failWhen(db, "dead-letter-claimed", sql`changes() = 0`),
      audit,
    ]);
    return true;
  } catch (error) {
    if (toGuardFailure(error)?.guard === "dead-letter-claimed") {
      return false;
    }
    console.error(
      `[admin] Failed to record the ${column} of dead letter ${target.id}:`,
      error
    );
    throw error;
  }
}

/** The `deadLetters` slice of the admin router (phase 9 task 4). */
export function deadLettersRoutes() {
  return {
    deadLetters: {
      discard: adminProcedure.deadLetters.discard.handler(
        async ({ context, errors, input }) => {
          const target = await targetOf(context.db, input.id);
          if (!target) {
            throw errors.NOT_FOUND();
          }
          if (target.replayedAt !== null || target.discardedAt !== null) {
            throw errors.INVALID_STATE({ data: { reason: "alreadyHandled" } });
          }
          const now = new Date();
          const claimed = await claim(
            context.db,
            target,
            "discardedAt",
            now,
            auditStatement(context.db, {
              action: "dead_letter.discard",
              actorId: context.user.id,
              data: { queue: target.originQueue, type: target.type },
              targetId: target.id,
              targetType: "dead_letter",
            })
          );
          if (!claimed) {
            throw errors.INVALID_STATE({ data: { reason: "alreadyHandled" } });
          }
          return { discardedAt: now.getTime() };
        }
      ),
      list: adminProcedure.deadLetters.list.handler(
        async ({ context, errors, input }) => {
          try {
            return await listDeadLetters(context.db, input);
          } catch (error) {
            if (error instanceof InvalidCursorError) {
              throw errors.VALIDATION({
                data: { fieldErrors: { cursor: ["invalid"] }, formErrors: [] },
              });
            }
            throw error;
          }
        }
      ),
      replay: adminProcedure.deadLetters.replay.handler(
        async ({ context, errors, input }) => {
          const target = await targetOf(context.db, input.id);
          if (!target) {
            throw errors.NOT_FOUND();
          }
          if (target.replayedAt !== null || target.discardedAt !== null) {
            throw errors.INVALID_STATE({ data: { reason: "alreadyHandled" } });
          }
          if (!target.replayable) {
            throw errors.INVALID_STATE({ data: { reason: "notReplayable" } });
          }
          // The queue first: a failed enqueue changes nothing. Two admins
          // replaying at once may both enqueue, and only one claims the row
          // (and writes its entry): an email goes back with its original
          // idempotency key, and the events are idempotent, so the second
          // message has no effect.
          const refusal = await enqueueAgain(context, target);
          if (refusal) {
            throw errors.INVALID_STATE({ data: { reason: refusal } });
          }
          const now = new Date();
          const claimed = await claim(
            context.db,
            target,
            "replayedAt",
            now,
            auditStatement(context.db, {
              action: "dead_letter.replay",
              actorId: context.user.id,
              data: { queue: target.originQueue, type: target.type },
              targetId: target.id,
              targetType: "dead_letter",
            })
          );
          if (!claimed) {
            throw errors.INVALID_STATE({ data: { reason: "alreadyHandled" } });
          }
          return { replayedAt: now.getTime() };
        }
      ),
    },
  };
}
