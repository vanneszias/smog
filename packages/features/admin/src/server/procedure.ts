import { implementRpc, requireAdmin } from "@smog/rpc";
import { ADMIN_PROCEDURE_KINDS, adminContract } from "../contract";
import { adminGuard } from "./guard";

/**
 * The one builder of every admin procedure: the admin contract, the rpc
 * context with `logErrors`, `requireAdmin` (`UNAUTHORIZED` for guests,
 * `FORBIDDEN` for users) and the audit guard. The role comes from the
 * session, which Better Auth reads from D1 on every request, so a demotion
 * applies at once (ruling 10). `context.user` is the acting admin. The
 * guard enforces each procedure's kind (`ADMIN_PROCEDURES` in its slice):
 * reads cannot write, and a mutation must build its mapped audit entry
 * with `auditStatement(context.db, …)` or `writeAudit(context.db, …)`.
 */
export const adminProcedure = implementRpc(adminContract)
  .use(requireAdmin)
  .use(adminGuard(ADMIN_PROCEDURE_KINDS));

/**
 * What `@smog/api` injects: logic from other features' servers (a feature
 * never imports another feature's `./server`).
 */
export interface AdminDeps {
  /** `@smog/gestures/server`: starts a new catalogue version (Task 2). */
  bumpCatalogVersion: (kv: KVNamespace) => Promise<string>;
}
