import { checkRateLimit, implementRpc, requireUser } from "@smog/rpc";
import { accountContract } from "../contract";
import { getConsent, setConsent } from "./consent";
import { DeleteAccountError, deleteAccount } from "./delete";
import { exportAccount, type ShareUrl } from "./export";
import { type ImportDeps, importGuestData } from "./import";
import { AccountNotFoundError, getMe, updateProfile } from "./profile";

/**
 * What `@smog/api` wires in: the favorites and lists statement builders
 * (the import) and the lists' share URL (the export).
 */
export interface AccountRouterDeps extends ImportDeps {
  shareUrl: ShareUrl;
}

/** A session whose user row is gone (deleted a moment ago) is `UNAUTHORIZED`. */
async function forUser<T>(
  run: () => Promise<T>,
  unauthorized: (options: { cause: unknown }) => Error
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      throw unauthorized({ cause: error });
    }
    throw error;
  }
}

/**
 * The `account` slice of the app router: every procedure needs a session.
 * The import writes through the injected favorites and lists builders (a
 * feature never imports another feature's server).
 */
export function createAccountRouter(deps: AccountRouterDeps) {
  const os = implementRpc(accountContract).use(requireUser);
  return os.router({
    consent: {
      get: os.consent.get.handler(
        async ({ context }) => await getConsent(context.db, context.user.id)
      ),
      set: os.consent.set.handler(
        async ({ context, input }) =>
          await setConsent(context.db, context.user.id, input)
      ),
    },
    // Limited like the auth endpoints (`RL_AUTH`, per IP): it checks a
    // password, and Better Auth's own limiter does not see `auth.api` calls.
    delete: os.delete.handler(async ({ context, errors, input }) => {
      if (
        !(await checkRateLimit(
          context.env.RL_AUTH,
          `${context.ip}:account.delete`
        ))
      ) {
        throw errors.RATE_LIMITED();
      }
      try {
        return await deleteAccount(
          { auth: context.auth, headers: context.request.headers },
          input
        );
      } catch (error) {
        if (!(error instanceof DeleteAccountError)) {
          throw error;
        }
        switch (error.code) {
          case "INVALID_PASSWORD":
            throw errors.INVALID_PASSWORD({ cause: error });
          case "SESSION_NOT_FRESH":
            throw errors.SESSION_NOT_FRESH({ cause: error });
          default:
            throw errors.UNAUTHORIZED({ cause: error });
        }
      }
    }),
    export: os.export.handler(
      async ({ context, errors }) =>
        await forUser(
          () =>
            exportAccount(
              { ...deps, db: context.db, siteUrl: context.env.SITE_URL },
              context.user.id
            ),
          errors.UNAUTHORIZED
        )
    ),
    // analytics: guest_data_imported {favorites_added, lists_created, lists_merged}
    importGuestData: os.importGuestData.handler(
      async ({ context, input }) =>
        await importGuestData(
          { ...deps, db: context.db },
          context.user.id,
          input
        )
    ),
    me: os.me.handler(
      async ({ context, errors }) =>
        await forUser(
          () => getMe(context.db, context.user.id),
          errors.UNAUTHORIZED
        )
    ),
    updateProfile: os.updateProfile.handler(
      async ({ context, errors, input }) =>
        await forUser(
          () => updateProfile(context.db, context.user.id, input),
          errors.UNAUTHORIZED
        )
    ),
  });
}

export type AccountRouter = ReturnType<typeof createAccountRouter>;
