import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createRouterClient, implement, ORPCError } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { AuthStateProvider, type SessionHookResult } from "@smog/auth/react";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import {
  createLocalStore,
  createMemoryAdapter,
  type LocalStore,
  setConsent,
  setPreferences,
  toggleFavorite,
} from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider } from "@smog/rpc/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { accountContract } from "../contract";
import {
  type AccountExport,
  type ConsentState,
  type DeleteAccountInput,
  type Me,
  type SetConsent,
  UNDECIDED_CONSENT,
  type UpdateProfile,
} from "../schema";
import {
  exportFileName,
  serializeExport,
  useAccount,
  useConsent,
  useDeleteAccount,
  useExport,
} from "./index";

const ME: Me = {
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

const EXPORT: AccountExport = {
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

interface Server {
  consent: ConsentState;
  consentCalls: SetConsent[];
  deleteCalls: DeleteAccountInput[];
  /** The code `delete` fails with, if any. */
  deleteFails?: "SESSION_NOT_FRESH";
  failConsent: boolean;
  me: Me;
  updateCalls: UpdateProfile[];
}

function newServer(): Server {
  return {
    consent: UNDECIDED_CONSENT,
    consentCalls: [],
    deleteCalls: [],
    failConsent: false,
    me: ME,
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
      importGuestData: os.account.importGuestData.handler(() => {
        throw new ORPCError("NOT_FOUND");
      }),
      me: os.account.me.handler(() => server.me),
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

const ANNA: SessionHookResult = {
  data: { user: { email: ME.email, id: ME.id, name: ME.name } },
  isPending: false,
};
const LOADING: SessionHookResult = { data: undefined, isPending: true };
const GUEST: SessionHookResult = { data: null, isPending: false };

function setup(
  store: LocalStore,
  session: SessionHookResult,
  server = newServer()
) {
  const api = fakeApi(server);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const auth = { current: session, refetches: 0 };
  const useSession = () => ({
    ...auth.current,
    refetch: () => {
      auth.refetches += 1;
    },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return (
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
    );
  }
  return { auth, queryClient, server, wrapper };
}

async function newStore(): Promise<LocalStore> {
  const store = createLocalStore(createMemoryAdapter());
  await store.ready;
  return store;
}

afterEach(() => {
  cleanup();
});

describe("useConsent: guest", () => {
  test("reads and writes the local store only", async () => {
    const store = await newStore();
    const { server, wrapper } = setup(store, GUEST);
    const { result } = renderHook(() => useConsent(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.analytics).toBeNull();

    await act(async () => {
      await result.current.set(true);
    });

    expect(result.current.analytics).toBe(true);
    expect(store.getSnapshot().consent.analytics).toBe(true);
    expect(server.consentCalls).toEqual([]);
  });

  test("is loading while the session loads", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 1));
    const { wrapper } = setup(store, LOADING);
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current).toMatchObject({
      analytics: null,
      status: "loading",
    });
  });
});

describe("useConsent: signed in", () => {
  test("reads the server log and mirrors it to the local store", async () => {
    const store = await newStore();
    await store.update(setConsent(false, 1));
    const server = newServer();
    server.consent = {
      analytics: true,
      decidedAt: 4000,
      policyVersion: CONSENT_POLICY_VERSION,
    };
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });

    expect(result.current).toMatchObject({
      analytics: null,
      status: "loading",
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.analytics).toBe(true);
    await waitFor(() =>
      expect(store.getSnapshot().consent).toEqual({
        analytics: true,
        decidedAt: 4000,
      })
    );
  });

  test("leaves the device choice alone while the account has none", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 1));
    const { wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useConsent(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.analytics).toBeNull();
    expect(store.getSnapshot().consent).toEqual({
      analytics: true,
      decidedAt: 1,
    });
  });

  test("set appends to the server log, then mirrors it", async () => {
    const store = await newStore();
    const { server, wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useConsent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.set(false);
    });

    expect(server.consentCalls).toEqual([{ analytics: false, source: "web" }]);
    expect(result.current.analytics).toBe(false);
    expect(store.getSnapshot().consent).toEqual({
      analytics: false,
      decidedAt: 5001,
    });
  });

  test("a failed server read is an error and never counts as consent", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 1));
    const server = { ...newServer(), failConsent: true };
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.analytics).toBeNull();
  });

  test("a failed set rejects and changes nothing on the device", async () => {
    const store = await newStore();
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    server.failConsent = true;
    const error = spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      await expect(result.current.set(true)).rejects.toThrow();
    });

    expect(store.getSnapshot().consent.analytics).toBeNull();
    expect(error.mock.calls[0]?.[0]).toBe(
      "[account] Failed to save the consent decision:"
    );
    error.mockRestore();
  });
});

describe("useAccount", () => {
  test("loads the profile and updates it", async () => {
    const store = await newStore();
    const { auth, server, wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useAccount(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.me).toEqual(ME);

    await act(async () => {
      await result.current.updateProfile({ locale: "fr", name: "Anna P" });
    });

    expect(server.updateCalls).toEqual([{ locale: "fr", name: "Anna P" }]);
    // The cache update reaches the hook on the next notify tick.
    await waitFor(() =>
      expect(result.current.me).toMatchObject({ locale: "fr", name: "Anna P" })
    );
    // The session carries the name: it is read again.
    expect(auth.refetches).toBeGreaterThan(0);
  });

  test("is signedOut for a guest", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, GUEST);
    const { result } = renderHook(() => useAccount(), { wrapper });
    expect(result.current).toMatchObject({
      me: undefined,
      status: "signedOut",
    });
  });
});

describe("useExport", () => {
  test("fetches the export", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useExport(), { wrapper });

    let data: AccountExport | undefined;
    await act(async () => {
      data = await result.current.exportAccount();
    });

    expect(data).toEqual(EXPORT);
    expect(result.current.status).toBe("idle");
  });

  test("names and formats the file", () => {
    expect(exportFileName(new Date("2026-09-29T23:30:00Z"))).toBe(
      "smog-export-2026-09-29.json"
    );
    expect(JSON.parse(serializeExport(EXPORT))).toEqual(EXPORT);
    expect(serializeExport(EXPORT)).toContain("\n");
  });
});

describe("useDeleteAccount", () => {
  test("deletes, signs out and clears the device", async () => {
    const store = await newStore();
    await store.update(toggleFavorite("g-aap"));
    await store.update(setPreferences({ theme: "dark" }));
    const { auth, queryClient, server, wrapper } = setup(store, ANNA);
    let signOuts = 0;
    const signOut = () => {
      signOuts += 1;
      return Promise.resolve();
    };
    queryClient.setQueryData(["something"], 1);
    const { result } = renderHook(() => useDeleteAccount({ signOut }), {
      wrapper,
    });

    await act(async () => {
      await result.current.deleteAccount({ confirm: "DELETE" });
    });

    expect(server.deleteCalls).toEqual([{ confirm: "DELETE" }]);
    expect(signOuts).toBe(1);
    expect(store.getSnapshot().favorites).toEqual([]);
    expect(store.getSnapshot().preferences.theme).toBe("system");
    expect(queryClient.getQueryData(["something"])).toBeUndefined();
    expect(auth.refetches).toBeGreaterThan(0);
    expect(result.current).toMatchObject({ error: null, status: "deleted" });
  });

  test("a failed sign-out still clears the device", async () => {
    const store = await newStore();
    await store.update(toggleFavorite("g-aap"));
    const { wrapper } = setup(store, ANNA);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(
      () => useDeleteAccount({ signOut: () => Promise.reject(new Error("x")) }),
      { wrapper }
    );

    await act(async () => {
      await result.current.deleteAccount({ confirm: "DELETE" });
    });

    expect(store.getSnapshot().favorites).toEqual([]);
    expect(result.current.status).toBe("deleted");
    error.mockRestore();
  });

  test("a refusal keeps everything and reports its code", async () => {
    const store = await newStore();
    await store.update(toggleFavorite("g-aap"));
    const server = {
      ...newServer(),
      deleteFails: "SESSION_NOT_FRESH" as const,
    };
    const { wrapper } = setup(store, ANNA, server);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    let signOuts = 0;
    const { result } = renderHook(
      () =>
        useDeleteAccount({
          signOut: () => {
            signOuts += 1;
            return Promise.resolve();
          },
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(
        result.current.deleteAccount({ confirm: "DELETE" })
      ).rejects.toMatchObject({ code: "SESSION_NOT_FRESH" });
    });

    expect(signOuts).toBe(0);
    expect(store.getSnapshot().favorites).toEqual(["g-aap"]);
    expect(result.current).toMatchObject({
      error: "SESSION_NOT_FRESH",
      status: "error",
    });
    expect(error.mock.calls[0]?.[0]).toBe(
      "[account] Failed to delete the account:"
    );
    error.mockRestore();
  });
});
