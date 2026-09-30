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

/**
 * What each procedure of a slice does to the audit log (ruling 5).
 *
 * - `mutations`: every procedure that changes stored state, mapped to the
 *   action it writes (one entry per target), or exempt with a reason.
 * - `reads`: every procedure that changes nothing.
 *
 * `test/coverage.test.ts` fails on a procedure in neither list (or both),
 * and on a mapped mutation that no test checks with `expectAudit`.
 */
export interface AdminAuditMap<TSlice> {
  mutations: Partial<
    Record<ProcedurePath<TSlice>, WritableAuditAction | AuditExempt>
  >;
  reads: readonly ProcedurePath<TSlice>[];
}
