import { implementRpc, requireUser } from "@smog/rpc";
import { accountContract } from "../contract";
import { type ImportDeps, importGuestData } from "./import";

/** The favorites and lists statement builders, wired by `@smog/api`. */
export type AccountRouterDeps = ImportDeps;

/**
 * The `account` slice of the app router: every procedure needs a session.
 * The import writes through the injected favorites and lists builders (a
 * feature never imports another feature's server).
 */
export function createAccountRouter(deps: AccountRouterDeps) {
  const os = implementRpc(accountContract).use(requireUser);
  return os.router({
    // analytics: guest_data_imported {favorites_added, lists_created, lists_merged}
    importGuestData: os.importGuestData.handler(
      async ({ context, input }) =>
        await importGuestData(
          { ...deps, db: context.db },
          context.user.id,
          input
        )
    ),
  });
}

export type AccountRouter = ReturnType<typeof createAccountRouter>;
