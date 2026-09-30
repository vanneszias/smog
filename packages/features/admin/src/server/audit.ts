import { auditLog, user } from "@smog/db";
import type { Db } from "@smog/db/client";
import { decodeCursorAs, encodeCursor, InvalidCursorError } from "@smog/utils";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  AUDIT_ACTORS_MAX,
  type AuditActor,
  type AuditEntry,
  type AuditListQuery,
  type AuditPage,
  auditDataSchema,
} from "../schema";
import { adminProcedure } from "./procedure";

/** The keyset position of the last row of a page (newest first). */
interface AuditPosition {
  createdAt: number;
  id: string;
}

function parseAuditCursor(cursor: string): AuditPosition {
  return decodeCursorAs(cursor, (key) => {
    const [createdAt, id] = key;
    return key.length === 2 &&
      typeof createdAt === "number" &&
      Number.isInteger(createdAt) &&
      typeof id === "string"
      ? { createdAt, id }
      : null;
  });
}

/**
 * Older than the position in `(created_at DESC, id DESC)` order. A range on
 * the first key, so SQLite seeks the index rather than scanning it.
 */
function before(position: AuditPosition): SQL | undefined {
  const at = new Date(position.createdAt);
  return and(
    lte(auditLog.createdAt, at),
    or(lt(auditLog.createdAt, at), lt(auditLog.id, position.id))
  );
}

/**
 * The entries query, newest first. Each filter has an index: `action`
 * (`action, created_at`), `targetType`/`targetId` (`target_type,
 * target_id`), `actorId` (`actor_id`), and the order `created_at`.
 */
export function auditEntriesQuery(
  db: Db,
  filters: Omit<AuditListQuery, "cursor" | "limit">,
  position: AuditPosition | null,
  limit: number
) {
  return db
    .select({
      action: auditLog.action,
      actorId: auditLog.actorId,
      actorName: user.name,
      createdAt: auditLog.createdAt,
      data: auditLog.data,
      id: auditLog.id,
      targetId: auditLog.targetId,
      targetType: auditLog.targetType,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(
      and(
        filters.action ? eq(auditLog.action, filters.action) : undefined,
        filters.targetType
          ? eq(auditLog.targetType, filters.targetType)
          : undefined,
        filters.targetId ? eq(auditLog.targetId, filters.targetId) : undefined,
        filters.actorId ? eq(auditLog.actorId, filters.actorId) : undefined,
        filters.from === undefined
          ? undefined
          : gte(auditLog.createdAt, new Date(filters.from)),
        filters.to === undefined
          ? undefined
          : lte(auditLog.createdAt, new Date(filters.to)),
        position ? before(position) : undefined
      )
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
}

type AuditRow = Awaited<ReturnType<typeof auditEntriesQuery>>[number];

/** `data` parsed with its action's schema when it has one, else as stored. */
function parseData(row: AuditRow): unknown {
  const schema = auditDataSchema(row.action);
  if (!schema) {
    return row.data;
  }
  const parsed = schema.safeParse(row.data);
  if (!parsed.success) {
    console.warn(
      `[admin] Audit entry ${row.id} (${row.action}) does not match its schema; returned as stored`
    );
    return row.data;
  }
  return parsed.data;
}

export function toAuditEntry(row: AuditRow): AuditEntry {
  return {
    action: row.action,
    actor:
      row.actorId !== null && row.actorName !== null
        ? { id: row.actorId, name: row.actorName }
        : null,
    createdAt: row.createdAt.getTime(),
    data: parseData(row),
    id: row.id,
    targetId: row.targetId,
    targetType: row.targetType,
  };
}

/** A page of the audit log (`InvalidCursorError` for a foreign cursor). */
async function listAudit(db: Db, input: AuditListQuery): Promise<AuditPage> {
  const { cursor, limit, ...filters } = input;
  const position = cursor === undefined ? null : parseAuditCursor(cursor);
  try {
    const rows = await auditEntriesQuery(db, filters, position, limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toAuditEntry),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor([last.createdAt.getTime(), last.id])
          : null,
    };
  } catch (error) {
    console.error("[admin] Failed to list the audit log:", error);
    throw error;
  }
}

/**
 * Every admin and every account with audit entries (a demoted or former
 * admin), by name, bounded. The `EXISTS` seeks `audit_log_actor_created_idx`.
 */
async function listAuditActors(
  db: Db
): Promise<{ actors: AuditActor[]; truncated: boolean }> {
  try {
    const rows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(
        or(
          eq(user.role, "admin"),
          exists(
            db
              .select({ one: sql`1` })
              .from(auditLog)
              .where(eq(auditLog.actorId, user.id))
          )
        )
      )
      .orderBy(asc(user.name), asc(user.id))
      .limit(AUDIT_ACTORS_MAX + 1);
    return {
      actors: rows.slice(0, AUDIT_ACTORS_MAX),
      truncated: rows.length > AUDIT_ACTORS_MAX,
    };
  } catch (error) {
    console.error("[admin] Failed to list the audit actors:", error);
    throw error;
  }
}

/** The `audit` slice of the admin router. */
export function auditRoutes() {
  return {
    audit: {
      actors: adminProcedure.audit.actors.handler(
        async ({ context }) => await listAuditActors(context.db)
      ),
      list: adminProcedure.audit.list.handler(
        async ({ context, errors, input }) => {
          try {
            return await listAudit(context.db, input);
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
    },
  };
}
