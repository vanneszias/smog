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
    // Analytics: guest_data_imported is sent by the client (useGuestImport).
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
