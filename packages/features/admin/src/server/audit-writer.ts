import type { AuditTargetType } from "@smog/db";
import type { Db } from "@smog/db/client";
import {
  type AuditSchemas,
  buildAuditStatement,
  writeAuditWith,
} from "@smog/rpc/audit";
import {
  AUDIT_DATA_SCHEMAS,
  type AuditData,
  isWritableAuditAction,
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

/** The writer's schemas: every action with a schema except the read-only ones. */
const WRITABLE_SCHEMAS: AuditSchemas = Object.fromEntries(
  Object.entries(AUDIT_DATA_SCHEMAS).filter(([action]) =>
    isWritableAuditAction(action)
  )
);

/**
 * The `audit_log` insert for a D1 batch: put it in the same
 * `db.batch([...changes, auditStatement(context.db, …)])` as the change, so
 * a change never lands unaudited and nothing is audited that did not
 * happen. `data` is Zod-validated when the statement is built: an invalid
 * entry throws `AuditDataError` before the batch runs. `legacy` is never
 * writable (in the type and here). Use the request's `context.db`, which
 * `adminProcedure` checks.
 */
export function auditStatement<A extends WritableAuditAction>(
  db: Db,
  entry: AuditEntryInput<A>
) {
  return buildAuditStatement(db, WRITABLE_SCHEMAS, entry);
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
  await writeAuditWith(db, WRITABLE_SCHEMAS, entry);
}
