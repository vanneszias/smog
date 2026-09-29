import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createRouterClient, implement } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { AnalyticsProvider } from "@smog/analytics/react";
import { createRecordingAnalytics } from "@smog/analytics/testing";
import { AuthStateProvider, type SessionHookResult } from "@smog/auth/react";
import { favoritesContract } from "@smog/favorites/contract";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { listsContract } from "@smog/lists/contract";
import {
  addRecentSearch,
  addToList,
  createList,
  createLocalStore,
  createMemoryAdapter,
  dismissImportFor,
  type LocalStore,
  setConsent,
  setPreferences,
  toggleFavorite,
} from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider, useRpcQuery } from "@smog/rpc/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { accountContract } from "../contract";
import {
  EMPTY_IMPORT_RESULT,
  type ImportGuestDataInput,
  type ImportResult,
} from "../schema";
import { importGuestData, useGuestImport } from "./index";

const RESULT: ImportResult = {
  ...EMPTY_IMPORT_RESULT,
  favoritesAdded: 2,
  lists: [{ status: "created", unplaced: [] }],
  listsCreated: 1,
};

interface Server {
  calls: ImportGuestDataInput[];
  fail: boolean;
  /** Resolves when the call may answer (lets a test act in between). */
  gate?: Promise<void>;
  idsCalls: number;
  /** The answer (default `RESULT`). */
  result?: ImportResult;
}

function newServer(): Server {
  return { calls: [], fail: false, idsCalls: 0 };
}

/** The account contract (plus the reads the hook refreshes) as a real oRPC client. */
function fakeApi(server: Server) {
  const os = implement({
    account: accountContract,
    favorites: { ids: favoritesContract.ids },
    lists: { mine: listsContract.mine },
  });
  const router = {
    account: os.account.router({
      importGuestData: os.account.importGuestData.handler(async ({ input }) => {
        server.calls.push(input);
        await server.gate;
        if (server.fail) {
          throw new Error("offline");
        }
        return server.result ?? RESULT;
      }),
    }),
    favorites: {
      ids: os.favorites.ids.handler(() => {
        server.idsCalls += 1;
        return [];
      }),
    },
    lists: { mine: os.lists.mine.handler(() => []) },
  };
  const client = createRouterClient(router);
  return { client, queryUtils: createTanstackQueryUtils(client) };
}

async function guestStore(): Promise<LocalStore> {
  const store = createLocalStore(createMemoryAdapter());
  await store.update(toggleFavorite("g-aap"));
  await store.update(toggleFavorite("g-beer"));
  await store.update(createList("  Dieren ", " Boerderij ", "loc_1", 1));
  await store.update(addToList("loc_1", "g-kat", 2));
  await store.update(setConsent(true, 42));
  await store.update(addRecentSearch("hond"));
  await store.update(setPreferences({ theme: "dark" }));
  return store;
}

afterEach(() => {
  cleanup();
});

describe("importGuestData", () => {
  test("sends the device data and then clears only the imported parts", async () => {
    const server = newServer();
    const store = await guestStore();
    const { client } = fakeApi(server);

    const result = await importGuestData({ client, store });

    expect(result).toEqual(RESULT);
    expect(server.calls).toEqual([
      {
        consent: { analytics: true, decidedAt: 42 },
        favorites: ["g-aap", "g-beer"],
        lists: [
          { description: "Boerderij", gestureIds: ["g-kat"], name: "Dieren" },
        ],
      },
    ]);
    const data = store.getSnapshot();
    expect(data.favorites).toEqual([]);
    expect(data.lists).toEqual([]);
    expect(data.consent).toEqual({ analytics: null });
    expect(data.recentSearches).toEqual(["hond"]);
    expect(data.preferences.theme).toBe("dark");
  });

  test("a failure keeps the local data and rethrows", async () => {
    const server = { ...newServer(), fail: true };
    const store = await guestStore();
    const before = store.getSnapshot();
    const { client } = fakeApi(server);
    const error = spyOn(console, "error").mockImplementation(() => undefined);

    await expect(importGuestData({ client, store })).rejects.toThrow();

    expect(store.getSnapshot()).toEqual(before);
    expect(error.mock.calls[0]?.[0]).toBe(
      "[account] Failed to import guest data:"
    );
    error.mockRestore();
  });

  test("keeps what was added on the device while the call ran", async () => {
    const { promise: gate, resolve: open } = Promise.withResolvers<void>();
    const server: Server = { ...newServer(), gate };
    const store = await guestStore();
    const { client } = fakeApi(server);

    const running = importGuestData({ client, store });
    await waitFor(() => expect(server.calls).toHaveLength(1));
    await store.update(toggleFavorite("g-later"));
    await store.update(createList("Later", undefined, "loc_2", 3));
    open();
    await running;

    const data = store.getSnapshot();
    expect(data.favorites).toEqual(["g-later"]);
    expect(data.lists.map((list) => list.id)).toEqual(["loc_2"]);
  });

  test("keeps on the device what the server did not store", async () => {
    const server = newServer();
    const store = await guestStore();
    await store.update(createList("Vol", undefined, "loc_2", 3));
    await store.update(addToList("loc_2", "g-aap", 4));
    await store.update(addToList("loc_2", "g-uil", 5));
    await store.update(createList("Te veel", undefined, "loc_3", 6));
    server.result = {
      ...RESULT,
      lists: [
        { status: "created", unplaced: [] },
        { status: "merged", unplaced: ["g-uil"] },
        { status: "notCreated", unplaced: [] },
      ],
    };

    await importGuestData({ client: fakeApi(server).client, store });

    const kept = store.getSnapshot().lists;
    expect(kept.map((list) => [list.id, list.gestureIds])).toEqual([
      ["loc_2", ["g-uil"]],
      ["loc_3", []],
    ]);
    expect(store.getSnapshot().favorites).toEqual([]);
  });

  test("bad local data is skipped and counted, never failing the call", async () => {
    const server = newServer();
    const store = createLocalStore(createMemoryAdapter());
    const tooLong = "x".repeat(65);
    await store.update((data) => ({
      ...data,
      favorites: ["", "g-aap", tooLong],
      lists: [
        {
          createdAt: 1,
          gestureIds: ["", "g-kat"],
          id: "loc_1",
          name: "   ",
          updatedAt: 1,
        },
      ],
    }));

    const result = await importGuestData({
      client: fakeApi(server).client,
      store,
      untitledListName: "Naamloze lijst",
    });

    expect(server.calls).toEqual([
      {
        favorites: ["g-aap"],
        lists: [{ gestureIds: ["g-kat"], name: "Naamloze lijst" }],
      },
    ]);
    // "" and the 65-character id, counted once each.
    expect(result.skippedUnknownGestures).toBe(2);
    expect(store.getSnapshot().favorites).toEqual([]);
    expect(store.getSnapshot().lists).toEqual([]);
  });

  test("cuts names by code point, never splitting an emoji", async () => {
    const server = newServer();
    const store = createLocalStore(createMemoryAdapter());
    await store.update(
      createList(`${"a".repeat(79)}🙂`, undefined, "loc_1", 1)
    );

    await importGuestData({ client: fakeApi(server).client, store });

    expect(server.calls[0]?.lists[0]?.name).toBe("a".repeat(79));
  });

  test("with nothing on the device it makes no call", async () => {
    const server = newServer();
    const store = createLocalStore(createMemoryAdapter());

    const result = await importGuestData({
      client: fakeApi(server).client,
      store,
    });

    expect(result).toEqual(EMPTY_IMPORT_RESULT);
    expect(server.calls).toEqual([]);
  });

  test("drops duplicate ids and cuts over-long names to the list limits", async () => {
    const server = newServer();
    const store = createLocalStore(createMemoryAdapter());
    await store.update((data) => ({
      ...data,
      favorites: ["a", "a", "b"],
      lists: [
        {
          createdAt: 1,
          gestureIds: ["x", "x", "y"],
          id: "loc_1",
          name: "n".repeat(100),
          updatedAt: 1,
        },
      ],
    }));

    await importGuestData({ client: fakeApi(server).client, store });

    expect(server.calls[0]?.favorites).toEqual(["a", "b"]);
    expect(server.calls[0]?.lists[0]?.gestureIds).toEqual(["x", "y"]);
    expect(server.calls[0]?.lists[0]?.name).toHaveLength(80);
    expect(server.calls[0]?.consent).toBeUndefined();
  });
});

const ANNA: SessionHookResult = {
  data: {
    user: { email: "anna@smog.test", id: "user-anna", name: "Anna" },
  },
  isPending: false,
};
const LOADING: SessionHookResult = { data: undefined, isPending: true };
const GUEST: SessionHookResult = { data: null, isPending: false };

const i18n = createI18n("nl");

function setup(store: LocalStore, session: SessionHookResult) {
  const server = newServer();
  const api = fakeApi(server);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const auth = { current: session };
  const useSession = () => auth.current;
  const recorder = createRecordingAnalytics();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RpcProvider client={api.client} queryUtils={api.queryUtils}>
            <AnalyticsProvider analytics={recorder.analytics}>
              <LocalStoreProvider store={store}>
                {/* biome-ignore lint/performance/noJsxPropsBind: a stable test hook, defined once per setup. */}
                <AuthStateProvider useSession={useSession}>
                  {children}
                </AuthStateProvider>
              </LocalStoreProvider>
            </AnalyticsProvider>
          </RpcProvider>
        </QueryClientProvider>
      </I18nextProvider>
    );
  }
  return { auth, events: recorder.events, server, wrapper };
}

/** Lets the hook see the loaded store (its `ready` state update). */
async function settle(store: LocalStore): Promise<void> {
  await act(async () => {
    await store.ready;
  });
}

describe("useGuestImport", () => {
  test("is not pending while the session loads or for a guest", async () => {
    const store = await guestStore();
    const { auth, wrapper } = setup(store, LOADING);
    const { result, rerender } = renderHook(() => useGuestImport(), {
      wrapper,
    });
    await settle(store);
    expect(result.current.pending).toBeNull();

    auth.current = GUEST;
    rerender();
    expect(result.current.pending).toBeNull();
  });

  test("offers the import once signed in with data on the device", async () => {
    const store = await guestStore();
    const { auth, wrapper } = setup(store, LOADING);
    const { result, rerender } = renderHook(() => useGuestImport(), {
      wrapper,
    });

    auth.current = ANNA;
    rerender();

    await waitFor(() =>
      expect(result.current.pending).toEqual({ favorites: 2, lists: 1 })
    );
    expect(result.current.status).toBe("idle");
  });

  test("is not pending without favorites or lists", async () => {
    const store = createLocalStore(createMemoryAdapter());
    await store.update(setConsent(true, 1));
    const { wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useGuestImport(), { wrapper });
    await settle(store);
    expect(result.current.pending).toBeNull();
  });

  test("accept imports, clears the device data and refetches the account data", async () => {
    const store = await guestStore();
    const { server, wrapper } = setup(store, ANNA);
    const { result } = renderHook(
      () => {
        const rpc = useRpcQuery<{
          favorites: { ids: typeof favoritesContract.ids };
        }>();
        const ids = useQuery(rpc.favorites.ids.queryOptions());
        return { guestImport: useGuestImport(), ids };
      },
      { wrapper }
    );
    await waitFor(() =>
      expect(result.current.guestImport.pending).not.toBeNull()
    );
    await waitFor(() => expect(server.idsCalls).toBe(1));

    let answer = null as ImportResult | null;
    await act(async () => {
      answer = await result.current.guestImport.accept();
    });

    expect(answer).toEqual(RESULT);
    expect(result.current.guestImport.status).toBe("done");
    expect(result.current.guestImport.result).toEqual(RESULT);
    expect(result.current.guestImport.pending).toBeNull();
    expect(store.getSnapshot().favorites).toEqual([]);
    await waitFor(() => expect(server.idsCalls).toBe(2));
  });

  test("a successful accept sends guest_data_imported with the counts only", async () => {
    const store = await guestStore();
    const { events, server, wrapper } = setup(store, ANNA);
    server.result = { ...RESULT, listsMerged: 2 };
    const { result } = renderHook(() => useGuestImport(), { wrapper });
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    await act(async () => {
      await result.current.accept();
    });
    expect(events).toEqual([
      { name: "guest_data_imported", properties: { favorites: 2, lists: 3 } },
    ]);
  });

  test("a failed accept sends nothing", async () => {
    const store = await guestStore();
    const { events, server, wrapper } = setup(store, ANNA);
    server.fail = true;
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useGuestImport(), { wrapper });
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    await act(async () => {
      await result.current.accept();
    });
    expect(events).toEqual([]);
    error.mockRestore();
  });

  test("a failed accept keeps the data and the prompt", async () => {
    const store = await guestStore();
    const { server, wrapper } = setup(store, ANNA);
    server.fail = true;
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useGuestImport(), { wrapper });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    let answer = RESULT as ImportResult | null;
    await act(async () => {
      answer = await result.current.accept();
    });

    expect(answer).toBeNull();
    expect(result.current.status).toBe("error");
    expect(result.current.pending).toEqual({ favorites: 2, lists: 1 });
    expect(store.getSnapshot().favorites).toEqual(["g-aap", "g-beer"]);
    error.mockRestore();
  });

  test("dismiss hides the prompt for this user only and keeps the data", async () => {
    const store = await guestStore();
    const { auth, wrapper } = setup(store, ANNA);
    const { result, rerender } = renderHook(() => useGuestImport(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    await act(async () => {
      await result.current.dismiss();
    });

    expect(result.current.pending).toBeNull();
    expect(store.getSnapshot().preferences.importDismissedFor).toEqual([
      "user-anna",
    ]);
    expect(store.getSnapshot().favorites).toEqual(["g-aap", "g-beer"]);

    auth.current = {
      data: { user: { email: "bo@smog.test", id: "user-bo", name: "Bo" } },
      isPending: false,
    };
    rerender();
    await waitFor(() => expect(result.current.pending).not.toBeNull());
  });

  test("another user starts over: status and result reset", async () => {
    const store = await guestStore();
    const { auth, server, wrapper } = setup(store, ANNA);
    server.fail = true;
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result, rerender } = renderHook(() => useGuestImport(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    await act(async () => {
      await result.current.accept();
    });
    expect(result.current.status).toBe("error");

    auth.current = {
      data: { user: { email: "bo@smog.test", id: "user-bo", name: "Bo" } },
      isPending: false,
    };
    rerender();

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.pending).toEqual({ favorites: 2, lists: 1 });
    error.mockRestore();
  });

  test("names an untitled list with the localised fallback", async () => {
    const store = createLocalStore(createMemoryAdapter());
    await store.update(createList("  ", undefined, "loc_1", 1));
    const { server, wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useGuestImport(), { wrapper });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    await act(async () => {
      await result.current.accept();
    });

    expect(server.calls[0]?.lists[0]?.name).toBe("Naamloze lijst");
  });

  test("a remembered dismissal does not prompt again", async () => {
    const store = await guestStore();
    await store.update(dismissImportFor("user-anna"));
    const { wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useGuestImport(), { wrapper });
    await settle(store);
    expect(result.current.pending).toBeNull();
  });
});
