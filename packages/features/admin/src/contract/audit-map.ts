import type { AnyContractProcedure } from "@orpc/contract";
import type { WritableAuditAction } from "../schema";

/** Every procedure path of a contract slice (`"audit.list"`, `"dashboard"`). */
export type ProcedurePath<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends AnyContractProcedure
    ? `${Prefix}${K}`
    : ProcedurePath<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** A mutation that writes no audit row, with the reason (ruling 4). */
export interface AuditExempt {
  exempt: string;
}

/** A mutation and the audit action it writes (ruling 5). */
export interface AuditWrite {
  audit: WritableAuditAction;
}

/**
 * What a procedure does to stored state:
 * - `"read"`: nothing. `adminProcedure` gives it a D1 and a KV that throw
 *   on any write.
 * - `{ audit }`: a mutation. `adminProcedure` fails the call when the
 *   handler did not build an entry with exactly this action.
 * - `{ exempt }`: a mutation with no audit row (the reason says why); it
 *   may build none.
 */
export type AdminProcedureKind = "read" | AuditWrite | AuditExempt;

/**
 * Every procedure of a slice with its kind. Not `Partial`: `check-types`
 * fails on a procedure without a kind, and on a stale entry.
 */
export type AdminProcedures<TSlice> = Record<
  ProcedurePath<TSlice>,
  AdminProcedureKind
>;
