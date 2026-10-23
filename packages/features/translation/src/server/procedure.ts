import { implementRpc, requireAdmin, requireRole } from "@smog/rpc";
import { adminGuard } from "@smog/rpc/audit";
import { TRANSLATION_PROCEDURE_KINDS, translationSlice } from "../contract";

const os = implementRpc(translationSlice);
const guard = adminGuard(TRANSLATION_PROCEDURE_KINDS);

/**
 * The strings, the language list and the coverage: the `translator` role
 * (an `admin` passes too; `UNAUTHORIZED` for a guest, `FORBIDDEN` for any
 * other account), then the audit guard of `@smog/rpc/audit`, which holds
 * every read read-only and makes each mutation build and run its audit
 * entry in its own batch.
 */
export const translatorProcedure = os.use(requireRole("translator")).use(guard);

/** Creating and changing a language: the `admin` role, same guard. */
export const adminOnlyProcedure = os.use(requireAdmin).use(guard);

/** The router builder: no guard of its own, each procedure carries its own. */
export const translationRouterBuilder = os;
