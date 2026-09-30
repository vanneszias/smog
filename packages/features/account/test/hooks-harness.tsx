import { createRouterClient, implement, ORPCError } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { AuthStateProvider, type SessionHookResult } from "@smog/auth/react";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import {
  createLocalStore,
  createMemoryAdapter,
  type LocalStore,
} from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider } from "@smog/rpc/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useSyncExternalStore } from "react";
import { accountContract } from "../src/contract";
import {
  type AccountExport,
  type ConsentState,
  type DeleteAccountInput,
  EMPTY_IMPORT_RESULT,
  type ImportGuestData,
  type Me,
  type SetConsent,
  UNDECIDED_CONSENT,
  type UpdateProfile,
} from "../src/schema";

/*
 * The client hooks' test harness: the account contract as a real
 * in-process oRPC client over a recorded fake server, a memory local
 * store and an injected session.
 */

export const ME: Me = {
  createdAt: 1000,
  email: "anna@smog.test",
  emailVerified: true,
  id: "user-anna",
  image: null,
  locale: null,
  methods: { apple: false, google: false, passkeys: 0, password: true },
  name: "Anna",
  role: "user",
};

export const EXPORT: AccountExport = {
  consent: [],
  exportedAt: "2026-09-29T12:00:00.000Z",
  exportVersion: 2,
  favorites: [],
  lists: [],
  profile: {
    createdAt: "2026-09-01T12:00:00.000Z",
    email: ME.email,
    emailVerified: true,
    id: ME.id,
    image: null,
    locale: null,
    name: ME.name,
    role: "user",
  },
  signInMethods: { passkeys: [], providers: [] },
  sponsorships: [],
};

export interface Server {
  consent: ConsentState;
  consentCalls: SetConsent[];
  /** `consent.get` calls. */
  consentReads: number;
  deleteCalls: DeleteAccountInput[];
  /** The code `delete` fails with, if any. */
  deleteFails?: "SESSION_NOT_FRESH";
  failConsent: boolean;
  failImport?: boolean;
  /** Every import call, failed ones included. */
  importAttempts: number;
  importCalls: ImportGuestData[];
  me: Me;
  /** `me` calls. */
  meReads: number;
  /** Replaces what an import does to `consent` (e.g. the server skips it). */
  onImport?: (input: ImportGuestData) => void;
  updateCalls: UpdateProfile[];
}

export function newServer(): Server {
  return {
    consent: UNDECIDED_CONSENT,
    consentCalls: [],
    consentReads: 0,
    deleteCalls: [],
    failConsent: false,
    importAttempts: 0,
    importCalls: [],
    me: ME,
    meReads: 0,
    updateCalls: [],
  };
}

/** The account contract as a real in-process oRPC client. */
function fakeApi(server: Server) {
  const os = implement({ account: accountContract });
  const router = {
    account: os.account.router({
      consent: {
        get: os.account.consent.get.handler(() => {
          server.consentReads += 1;
          if (server.failConsent) {
            throw new Error("offline");
          }
          return server.consent;
        }),
        set: os.account.consent.set.handler(({ input }) => {
          if (server.failConsent) {
            throw new Error("offline");
          }
          server.consentCalls.push(input);
          server.consent = {
            analytics: input.analytics,
            decidedAt: 5000 + server.consentCalls.length,
            needsDecision: false,
            policyVersion: CONSENT_POLICY_VERSION,
          };
          return server.consent;
        }),
      },
      delete: os.account.delete.handler(({ errors, input }) => {
        server.deleteCalls.push(input as DeleteAccountInput);
        if (server.deleteFails) {
          throw errors.SESSION_NOT_FRESH();
        }
        return { deleted: true as const };
      }),
      export: os.account.export.handler(() => EXPORT),
      importGuestData: os.account.importGuestData.handler(({ input }) => {
        server.importAttempts += 1;
        if (server.failImport) {
          throw new ORPCError("INTERNAL_SERVER_ERROR");
        }
        server.importCalls.push(input);
        if (server.onImport) {
          server.onImport(input);
        } else if (input.consent) {
          server.consent = {
            analytics: input.consent.analytics,
            decidedAt: input.consent.decidedAt,
            needsDecision: false,
            policyVersion: CONSENT_POLICY_VERSION,
          };
        }
        return EMPTY_IMPORT_RESULT;
      }),
      me: os.account.me.handler(() => {
        server.meReads += 1;
        return server.me;
      }),
      updateProfile: os.account.updateProfile.handler(({ input }) => {
        server.updateCalls.push(input);
        server.me = {
          ...server.me,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.locale === undefined ? {} : { locale: input.locale }),
        };
        return server.me;
      }),
    }),
  };
  const client = createRouterClient(router);
  return { client, queryUtils: createTanstackQueryUtils(client) };
}

export const ANNA: SessionHookResult = {
  data: { user: { email: ME.email, id: ME.id, name: ME.name } },
  isPending: false,
};
/** Another user on the same device (a shared tablet). */
export const BEN: SessionHookResult = {
  data: { user: { email: "ben@smog.test", id: "user-ben", name: "Ben" } },
  isPending: false,
};
export const LOADING: SessionHookResult = { data: undefined, isPending: true };
export const GUEST: SessionHookResult = { data: null, isPending: false };

const I18N = createI18n("en");

export function setup(
  store: LocalStore,
  session: SessionHookResult,
  server = newServer()
) {
  const api = fakeApi(server);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // As Better Auth's session store: `refetch` reads `current` again and
  // re-renders the provider (a test sets `current` to what the server says).
  const listeners = new Set<() => void>();
  const auth = {
    current: session,
    refetches: 0,
    /** Re-reads the session (`current`), as a sign-in or sign-out does. */
    refresh: (): Promise<void> => refetch(),
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const refetch = (): Promise<void> => {
    auth.refetches += 1;
    for (const listener of listeners) {
      listener();
    }
    return Promise.resolve();
  };
  const useSession = (): SessionHookResult => ({
    ...useSyncExternalStore(subscribe, () => auth.current),
    refetch,
  });
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={I18N}>
        <QueryClientProvider client={queryClient}>
          <RpcProvider client={api.client} queryUtils={api.queryUtils}>
            <LocalStoreProvider store={store}>
              {/* biome-ignore lint/performance/noJsxPropsBind: a stable test hook, defined once per setup. */}
              <AuthStateProvider useSession={useSession}>
                {children}
              </AuthStateProvider>
            </LocalStoreProvider>
          </RpcProvider>
        </QueryClientProvider>
      </I18nextProvider>
    );
  }
  return { auth, queryClient, server, wrapper };
}

export async function newStore(): Promise<LocalStore> {
  const store = createLocalStore(createMemoryAdapter());
  await store.ready;
  return store;
}

/** Better Auth's client calls the methods hooks use, recorded. */
export function fakeAuthClient(
  accounts: { id: string; providerId: string }[] = [],
  failures: Record<string, { code?: string; status?: number }> = {}
) {
  const calls: [string, unknown][] = [];
  const answer = (name: string) =>
    Promise.resolve(
      failures[name] ? { data: null, error: failures[name] } : { error: null }
    );
  let passkeys: { createdAt: Date | string; id: string; name?: string }[] = [
    { createdAt: new Date(2000), id: "pk-1", name: "Laptop" },
    { createdAt: "1970-01-01T00:00:03.000Z", id: "pk-2" },
  ];
  const client = {
    changePassword: (body: unknown) => {
      calls.push(["changePassword", body]);
      return answer("changePassword");
    },
    linkSocial: (body: unknown) => {
      calls.push(["linkSocial", body]);
      return answer("linkSocial");
    },
    listAccounts: () => {
      calls.push(["listAccounts", undefined]);
      return Promise.resolve({ data: accounts, error: null });
    },
    passkey: {
      addPasskey: (body?: unknown) => {
        calls.push(["addPasskey", body]);
        return answer("addPasskey");
      },
      deletePasskey: (body: { id: string }) => {
        calls.push(["deletePasskey", body]);
        passkeys = passkeys.filter((entry) => entry.id !== body.id);
        return answer("deletePasskey");
      },
      listUserPasskeys: () => {
        calls.push(["listUserPasskeys", undefined]);
        return Promise.resolve({ data: passkeys, error: null });
      },
    },
    unlinkAccount: (body: unknown) => {
      calls.push(["unlinkAccount", body]);
      return answer("unlinkAccount");
    },
  };
  return { calls, client };
}
