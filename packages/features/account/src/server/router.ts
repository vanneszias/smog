import { implementRpc, requireUser } from "@smog/rpc";
import { accountContract } from "../contract";
import { importGuestData } from "./import";

const os = implementRpc(accountContract).use(requireUser);

/** The `account` slice of the app router: every procedure needs a session. */
export const accountRouter = os.router({
  // analytics: guest_data_imported {favorites_added, lists_created, lists_merged}
  importGuestData: os.importGuestData.handler(
    async ({ context, input }) =>
      await importGuestData(context.db, context.user.id, input)
  ),
});

export type AccountRouter = typeof accountRouter;
