import {
  AUDIT_DATA_SCHEMAS,
  type AuditData,
  isWritableAuditAction,
  type WritableAuditAction,
} from "@smog/admin/schema";
import type { AuditTargetType } from "@smog/db";
import type { Db } from "@smog/db/client";
import { type AuditSchemas, buildAuditStatement } from "@smog/rpc/audit";

/** The audit schemas the writer accepts (the audit log is the admin's; the data shapes are its schema). */
const WRITABLE_SCHEMAS: AuditSchemas = Object.fromEntries(
  Object.entries(AUDIT_DATA_SCHEMAS).filter(([action]) =>
    isWritableAuditAction(action)
  )
);

interface AuditEntry<A extends WritableAuditAction> {
  action: A;
  actorId: string;
  data: AuditData<A>;
  targetId: string | null;
  targetType: AuditTargetType;
}

/**
 * The `audit_log` insert of a teaching change, for the same D1 batch as the
 * change (`@smog/rpc/audit`'s guard counts it and fails a mutation without
 * one). `data` is validated against the action's schema first and carries
 * ids, languages, field names and counts, never a text.
 */
export function auditStatement<A extends WritableAuditAction>(
  db: Db,
  entry: AuditEntry<A>
) {
  return buildAuditStatement(db, WRITABLE_SCHEMAS, entry);
}
