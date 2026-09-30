import { implementRpc, requireAdmin } from "@smog/rpc";
import { adminContract } from "../contract";

/**
 * The one builder of every admin procedure: the admin contract, the rpc
 * context with `logErrors`, and `requireAdmin` (`UNAUTHORIZED` for guests,
 * `FORBIDDEN` for users). The role comes from the session, which Better
 * Auth reads from D1 on every request, so a demotion applies at once
 * (ruling 10). `context.user` is the acting admin.
 */
export const adminProcedure = implementRpc(adminContract).use(requireAdmin);

/**
 * What `@smog/api` injects: logic from other features' servers (a feature
 * never imports another feature's `./server`).
 */
export interface AdminDeps {
  /** `@smog/gestures/server`: starts a new catalogue version (Task 2). */
  bumpCatalogVersion: (kv: KVNamespace) => Promise<string>;
}
