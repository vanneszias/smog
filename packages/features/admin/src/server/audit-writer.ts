import { type AuditTargetType, auditLog } from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import {
  AUDIT_DATA_SCHEMAS,
  type AuditData,
  type WritableAuditAction,
} from "../schema";

/** One audit entry to write (ruling 5). */
export interface AuditEntryInput<A extends WritableAuditAction> {
  action: A;
  /** The acting admin (`context.user.id`). */
  actorId: string;
  /** Validated with `AUDIT_DATA_SCHEMAS[action]` before anything is written. */
  data: AuditData<A>;
  /** `null` only for `system` actions with no single target. */
  targetId: string | null;
  targetType: AuditTargetType;
}

/** `data` that does not match its action's schema: nothing was written. */
export class AuditDataError extends Error {
  readonly action: WritableAuditAction;

  constructor(action: WritableAuditAction, cause: unknown) {
    super(`[admin] Invalid audit data for ${action}`, { cause });
    this.action = action;
    this.name = "AuditDataError";
  }
}

/**
 * The `audit_log` insert for a D1 batch: put it in the same
 * `db.batch([...changes, auditStatement(...)])` as the change, so a change
 * never lands unaudited and nothing is audited that did not happen. `data`
 * is Zod-validated here, when the statement is built: an invalid entry
 * throws `AuditDataError` before the batch runs, so nothing is written.
 */
export function auditStatement<A extends WritableAuditAction>(
  db: Db,
  entry: AuditEntryInput<A>
) {
  const schema = AUDIT_DATA_SCHEMAS[entry.action];
  if (!schema) {
    throw new AuditDataError(entry.action, "no schema");
  }
  const parsed = schema.safeParse(entry.data);
  if (!parsed.success) {
    throw new AuditDataError(entry.action, parsed.error);
  }
  return db.insert(auditLog).values({
    action: entry.action,
    actorId: entry.actorId,
    createdAt: new Date(),
    data: parsed.data,
    id: newId(),
    targetId: entry.targetId,
    targetType: entry.targetType,
  });
}

/**
 * The standalone write, for changes outside D1 (Better Auth `auth.api`
 * user operations, the KV maintenance flag): those happen first, then this
 * runs. A failure is logged and rethrown, so the admin sees an error.
 */
export async function writeAudit<A extends WritableAuditAction>(
  db: Db,
  entry: AuditEntryInput<A>
): Promise<void> {
  try {
    await auditStatement(db, entry);
  } catch (error) {
    console.error(
      `[admin] Failed to write the audit entry ${entry.action} for ${entry.targetType}:${entry.targetId ?? "-"}:`,
      error
    );
    throw error;
  }
}
