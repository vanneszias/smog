import type { AnyContractRouter } from "@orpc/contract";
import {
  type ImplementerInternalWithMiddlewares,
  implement,
  os,
} from "@orpc/server";
import type { RpcContext } from "./context";
import { ERRORS } from "./errors";
import { requireAdmin, requireRole, requireUser } from "./middleware/auth";
import { logErrors } from "./middleware/log";

/** The oRPC builder for the rpc context with the shared error map. */
export const base = os.$context<RpcContext>().errors(ERRORS);

/** Anyone may call it; unexpected errors are logged and hidden. */
export const publicProcedure = base.use(logErrors);

/** Needs a session (`UNAUTHORIZED`); `context.user` is the signed-in user. */
export const userProcedure = publicProcedure.use(requireUser);

/** Needs the admin role (`FORBIDDEN`); `context.user` is the admin. */
export const adminProcedure = publicProcedure.use(requireAdmin);

/**
 * Needs the translator role (`admin` passes too, `FORBIDDEN` otherwise);
 * `context.user` is the translator or admin.
 */
export const translatorProcedure = publicProcedure.use(
  requireRole("translator")
);

/** Needs the teacher role (`admin` passes too, `FORBIDDEN` otherwise). */
export const teacherProcedure = publicProcedure.use(requireRole("teacher"));

/**
 * The contract-first implementer for a (slice of the) contract, with the
 * rpc context and `logErrors` on every procedure. Guards go per procedure:
 * `os.favorites.list.use(requireUser).handler(...)`.
 */
export function implementRpc<TContract extends AnyContractRouter>(
  contract: TContract
): ImplementerInternalWithMiddlewares<TContract, RpcContext, RpcContext> {
  // `.use` does not resolve on a generic contract; a router-shaped one has it.
  const implementer = implement(
    contract as Record<string, AnyContractRouter>
  ).$context<RpcContext>();
  return implementer.use(
    logErrors
  ) as unknown as ImplementerInternalWithMiddlewares<
    TContract,
    RpcContext,
    RpcContext
  >;
}
