import { type AuditAction, type AuditTargetType, auditLog } from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import type { z } from "zod";
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

/** An entry for any action, checked against a given schema map. */
export interface AnyAuditEntry {
  action: AuditAction;
  actorId: string;
  data: unknown;
  targetId: string | null;
  targetType: AuditTargetType;
}

export type AuditSchemas = Partial<Record<AuditAction, z.ZodType>>;

/** `data` that does not match its action's schema: nothing was written. */
export class AuditDataError extends Error {
  readonly action: AuditAction;

  constructor(action: AuditAction, cause: unknown) {
    super(`[admin] Invalid audit data for ${action}`, { cause });
    this.action = action;
    this.name = "AuditDataError";
  }
}

/*
 * Which audit entries a request built, per request-scoped Drizzle client.
 * `adminProcedure` gives every call its own client and checks the list
 * after the handler (a mutation must build exactly its mapped action).
 */
const built = new WeakMap<Db, AuditAction[]>();

/** Starts recording the audit entries built with `db`; returns the list. */
export function trackAudits(db: Db): readonly AuditAction[] {
  const actions: AuditAction[] = [];
  built.set(db, actions);
  return actions;
}

/** The writer's schemas: every action with a schema except the read-only ones. */
const WRITABLE_SCHEMAS: AuditSchemas = Object.fromEntries(
  Object.entries(AUDIT_DATA_SCHEMAS).filter(([action]) =>
    isWritableAuditAction(action)
  )
);

/**
 * The insert for `entry`, validated with `schemas[entry.action]`. The
 * writer's core, with the schema map as a parameter (the tests pass their
 * own). Throws `AuditDataError` for an action without a schema or invalid
 * data, before anything is written.
 */
export function buildAuditStatement(
  db: Db,
  schemas: AuditSchemas,
  entry: AnyAuditEntry
) {
  const schema = schemas[entry.action];
  if (!schema) {
    throw new AuditDataError(entry.action, "not a writable action");
  }
  const parsed = schema.safeParse(entry.data);
  if (!parsed.success) {
    throw new AuditDataError(entry.action, parsed.error);
  }
  built.get(db)?.push(entry.action);
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

/** `writeAudit`'s core, with the schema map as a parameter. */
export async function writeAuditWith(
  db: Db,
  schemas: AuditSchemas,
  entry: AnyAuditEntry
): Promise<void> {
  try {
    await buildAuditStatement(db, schemas, entry);
  } catch (error) {
    console.error(
      `[admin] Failed to write the audit entry ${entry.action} for ${entry.targetType}:${entry.targetId ?? "-"}:`,
      error
    );
    throw error;
  }
}

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
