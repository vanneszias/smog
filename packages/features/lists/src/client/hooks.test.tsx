import { afterEach, describe, expect, test } from "bun:test";
import { createRouterClient, implement } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { AuthStateProvider, type SessionHookResult } from "@smog/auth/react";
import type { GestureSummary } from "@smog/gestures/schema";
import {
  createList,
  createLocalStore,
  createMemoryAdapter,
  type LocalStore,
} from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider } from "@smog/rpc/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { gesturesByIdsContract, listsContract } from "../contract";
import type { ListDetail, ShareRole } from "../schema";
import { useList, useLists, useSharedList, useShareLinks } from "./index";

function summary(name: string): GestureSummary {
  const slug = name.toLowerCase();
  return { categories: [], id: `g-${slug}`, name, playbackId: "p", slug };
}

const CATALOGUE = ["Aap", "Beer", "Hond", "Kat"].map(summary);
const [AAP, BEER, HOND, KAT] = CATALOGUE as [
  GestureSummary,
  GestureSummary,
  GestureSummary,
  GestureSummary,
];

interface Server {
  byIdsCalls: string[][];
  calls: string[];
  /** Makes the next reorder wait, then fail with INVALID_STATE. */
  failNextReorder: boolean;
  lists: Map<string, ListDetail>;
  shares: Map<string, { role: ShareRole; token: string }[]>;
  tokens: number;
  /** Who calls (`mine` answers that user's lists); lists default to user-1. */
  user: string;
  userOf: Map<string, string>;
}

function detail(id: string, name: string, items: GestureSummary[]): ListDetail {
  return {
    description: null,
    id,
    itemCount: items.length,
    items: items.map((item, position) => ({ ...item, position })),
    name,
    shares: { edit: false, view: false },
    updatedAt: 1,
  };
}

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The lists contract (and `gestures.byIds`) in memory, as a real oRPC client. */
function fakeApi(server: Server) {
  const os = implement({
    gestures: { byIds: gesturesByIdsContract },
    lists: listsContract,
  });
  const find = (id: string, errors: { NOT_FOUND: () => Error }) => {
    const found = server.lists.get(id);
    if (!found) {
      throw errors.NOT_FOUND();
    }
    return found;
  };
  const link = (token: string) => ({
    createdAt: 1,
    token,
    url: `https://smog.test/lists/${token}`,
  });
  const router = {
    gestures: {
      byIds: os.gestures.byIds.handler(({ input }) => {
        server.byIdsCalls.push(input.ids);
        return CATALOGUE.filter((item) => input.ids.includes(item.id));
      }),
    },
    lists: os.lists.router({
      addItem: os.lists.addItem.handler(({ errors, input }) => {
        server.calls.push("addItem");
        const list = find(input.id, errors);
        const gesture = CATALOGUE.find((item) => item.id === input.gestureId);
        if (!gesture) {
          throw errors.NOT_FOUND();
        }
        server.lists.set(
          input.id,
          detail(list.id, list.name, [...list.items, gesture])
        );
        return { added: true };
      }),
      create: os.lists.create.handler(({ input }) => {
        server.calls.push("create");
        const id = `srv-${server.lists.size + 1}`;
        const created = detail(id, input.name, []);
        server.lists.set(id, created);
        const { items: _items, ...rest } = created;
        return rest;
      }),
      delete: os.lists.delete.handler(({ input }) => {
        server.lists.delete(input.id);
      }),
      get: os.lists.get.handler(({ errors, input }) => {
        server.calls.push("get");
        return find(input.id, errors);
      }),
      mine: os.lists.mine.handler(() => {
        server.calls.push("mine");
        const own = [...server.lists.values()].filter(
          (list) => (server.userOf.get(list.id) ?? "user-1") === server.user
        );
        return own.map(({ items: _items, ...rest }) => ({
          ...rest,
          shares: {
            edit: (server.shares.get(rest.id) ?? []).some(
              (share) => share.role === "edit"
            ),
            view: (server.shares.get(rest.id) ?? []).some(
              (share) => share.role === "view"
            ),
          },
        }));
      }),
      removeItem: os.lists.removeItem.handler(({ errors, input }) => {
        const list = find(input.id, errors);
        server.lists.set(
          input.id,
          detail(
            list.id,
            list.name,
            list.items.filter((item) => item.id !== input.gestureId)
          )
        );
        return { removed: true };
      }),
      reorder: os.lists.reorder.handler(async ({ errors, input }) => {
        server.calls.push("reorder");
        const list = find(input.id, errors);
        if (server.failNextReorder) {
          server.failNextReorder = false;
          await delay(100);
          throw errors.INVALID_STATE();
        }
        const byId = new Map(list.items.map((item) => [item.id, item]));
        server.lists.set(
          input.id,
          detail(
            list.id,
            list.name,
            input.gestureIds.flatMap((id) => {
              const item = byId.get(id);
              return item ? [item] : [];
            })
          )
        );
      }),
      share: {
        create: os.lists.share.create.handler(({ input }) => {
          const shares = server.shares.get(input.id) ?? [];
          const existing = shares.find((share) => share.role === input.role);
          if (existing) {
            return link(existing.token);
          }
          server.tokens += 1;
          const token = `token-${server.tokens}`;
          server.shares.set(input.id, [...shares, { role: input.role, token }]);
          return link(token);
        }),
        get: os.lists.share.get.handler(({ input }) => {
          const shares = server.shares.get(input.id) ?? [];
          const of = (role: ShareRole) => {
            const found = shares.find((share) => share.role === role);
            return found ? link(found.token) : null;
          };
          return { edit: of("edit"), view: of("view") };
        }),
        revoke: os.lists.share.revoke.handler(({ input }) => {
          server.shares.set(
            input.id,
            (server.shares.get(input.id) ?? []).filter(
              (share) => share.role !== input.role
            )
          );
        }),
      },
      shared: {
        addItem: os.lists.shared.addItem.handler(({ input }) => {
          server.calls.push(`shared.addItem:${input.gestureId}`);
          return { added: true };
        }),
        get: os.lists.shared.get.handler(({ errors, input }) => {
          for (const [listId, shares] of server.shares) {
            const share = shares.find((item) => item.token === input.token);
            const list = server.lists.get(listId);
            if (share && list) {
              return {
                items: list.items,
                list: {
                  description: list.description,
                  name: list.name,
                  ownerName: "Anna",
                },
                role: share.role,
              };
            }
          }
          throw errors.NOT_FOUND();
        }),
        removeItem: os.lists.shared.removeItem.handler(() => ({
          removed: true,
        })),
      },
      update: os.lists.update.handler(({ errors, input }) => {
        const list = find(input.id, errors);
        const next = {
          ...list,
          description:
            input.description === undefined
              ? list.description
              : input.description,
          name: input.name ?? list.name,
        };
        server.lists.set(input.id, next);
        const { items: _items, ...rest } = next;
        return rest;
      }),
    }),
  };
  const client = createRouterClient(router);
  return { client, queryUtils: createTanstackQueryUtils(client) };
}

const SIGNED_IN: SessionHookResult = {
  data: {
    user: { email: "anna@smog.test", id: "user-1", name: "Anna" },
  },
  isPending: false,
};
const SIGNED_OUT: SessionHookResult = { data: null, isPending: false };

function setup(session: SessionHookResult = SIGNED_OUT) {
  const server: Server = {
    byIdsCalls: [],
    calls: [],
    failNextReorder: false,
    lists: new Map(),
    shares: new Map(),
    tokens: 0,
    user: "user-1",
    userOf: new Map(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store: LocalStore = createLocalStore(createMemoryAdapter());
  const api = fakeApi(server);
  const auth = { current: session };
  const useSession = () => auth.current;
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
  return { auth, queryClient, server, store, wrapper };
}

async function addLocalList(
  store: LocalStore,
  id: string,
  name: string,
  gestureIds: string[]
): Promise<void> {
  await store.update(createList(name, undefined, id, 1));
  await store.update((data) => ({
    ...data,
    lists: data.lists.map((list) =>
      list.id === id ? { ...list, gestureIds } : list
    ),
  }));
}

afterEach(() => {
  cleanup();
});

describe("guests: the device", () => {
  test("useLists shows and creates local lists, never calling the API", async () => {
    const { server, store, wrapper } = setup();
    await addLocalList(store, "loc_1", "Dieren", [HOND.id]);
    const { result } = renderHook(() => useLists(), { wrapper });

    expect(result.current.status).toBe("ready");
    expect(result.current.lists).toEqual([
      {
        description: null,
        id: "loc_1",
        itemCount: 1,
        name: "Dieren",
        shares: { edit: false, view: false },
        updatedAt: 1,
      },
    ]);

    let created: { id: string; name: string } | undefined;
    await act(async () => {
      created = await result.current.create({
        description: "  ",
        name: "  Familie ",
      });
    });
    expect(created?.id.startsWith("loc_")).toBe(true);
    expect(created?.name).toBe("Familie");
    expect(result.current.lists.map((list) => list.name)).toEqual([
      "Familie",
      "Dieren",
    ]);
    expect(store.getSnapshot().lists[1]?.description).toBeUndefined();

    // The same rules as the API.
    await expect(result.current.create({ name: " " })).rejects.toThrow();
    expect(server.calls).toEqual([]);
  });

  test("useList(loc_…) hydrates from gestures.byIds and edits the device", async () => {
    const { server, store, wrapper } = setup();
    await addLocalList(store, "loc_1", "Dieren", [KAT.id, AAP.id, "gone"]);
    const { result } = renderHook(() => useList("loc_1"), { wrapper });

    await waitFor(() => expect(result.current.list?.items).toHaveLength(2));
    expect(
      result.current.list?.items.map((item) => [item.name, item.position])
    ).toEqual([
      ["Kat", 0],
      ["Aap", 1],
    ]);
    const fetches = server.byIdsCalls.length;

    await act(async () => {
      await result.current.reorder([AAP.id, "gone", KAT.id]);
      await result.current.addItem(BEER.id);
      await result.current.update({
        description: "Voor thuis",
        name: "Beesten",
      });
    });
    await waitFor(() => expect(result.current.list?.items).toHaveLength(3));
    expect(result.current.list?.items.map((item) => item.name)).toEqual([
      "Aap",
      "Kat",
      "Beer",
    ]);
    expect(result.current.list).toMatchObject({
      description: "Voor thuis",
      name: "Beesten",
    });
    // A reorder alone does not refetch; the add does (a new id).
    expect(server.byIdsCalls.length).toBe(fetches + 1);

    await act(async () => {
      await result.current.removeItem(KAT.id);
      await result.current.update({ description: null });
    });
    expect(store.getSnapshot().lists[0]?.gestureIds).toEqual([
      AAP.id,
      "gone",
      BEER.id,
    ]);
    expect(result.current.list?.description).toBeNull();
    // Reorder must be an exact permutation, as on the server.
    await expect(result.current.reorder([AAP.id])).rejects.toThrow();

    await act(async () => {
      await result.current.remove();
    });
    expect(result.current.notFound).toBe(true);
    expect(store.getSnapshot().lists).toEqual([]);
    expect(server.calls).toEqual([]);
  });

  test("a server list id is not found for a guest, without an API call", () => {
    const { server, wrapper } = setup();
    const { result } = renderHook(() => useList("srv-1"), { wrapper });

    expect(result.current).toMatchObject({ notFound: true, status: "ready" });
    expect(server.calls).toEqual([]);
  });

  test("sharing needs an account: guests and local lists", () => {
    const guest = setup();
    expect(
      renderHook(() => useShareLinks("srv-1"), { wrapper: guest.wrapper })
        .result.current
    ).toEqual({ requiresAccount: true });

    const account = setup(SIGNED_IN);
    expect(
      renderHook(() => useShareLinks("loc_1"), { wrapper: account.wrapper })
        .result.current
    ).toEqual({ requiresAccount: true });
  });
});

describe("accounts: the API", () => {
  test("useLists loads from the API and creates there; sign-out shows the device", async () => {
    const { auth, server, store, wrapper } = setup(SIGNED_IN);
    server.lists.set("srv-1", detail("srv-1", "Op de server", [HOND]));
    await addLocalList(store, "loc_1", "Op het toestel", []);
    const { rerender, result } = renderHook(() => useLists(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.lists.map((list) => list.name)).toEqual([
      "Op de server",
    ]);

    await act(async () => {
      await result.current.create({ name: "Nieuw" });
    });
    await waitFor(() => expect(result.current.lists).toHaveLength(2));
    expect(store.getSnapshot().lists).toHaveLength(1);

    auth.current = SIGNED_OUT;
    rerender();
    expect(result.current.lists.map((list) => list.name)).toEqual([
      "Op het toestel",
    ]);
  });

  test("another account signing in never sees the previous one's cached lists", async () => {
    const { auth, server, wrapper } = setup(SIGNED_IN);
    server.lists.set("srv-1", detail("srv-1", "Van Anna", []));
    server.lists.set("srv-2", detail("srv-2", "Van Bert", []));
    server.userOf.set("srv-2", "user-2");
    const { rerender, result } = renderHook(() => useLists(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.lists.map((list) => list.name)).toEqual(["Van Anna"]);

    server.user = "user-2";
    auth.current = {
      data: { user: { email: "bert@smog.test", id: "user-2", name: "Bert" } },
      isPending: false,
    };
    rerender();
    expect(result.current.lists.map((list) => list.name)).not.toContain(
      "Van Anna"
    );
    await waitFor(() =>
      expect(result.current.lists.map((list) => list.name)).toEqual([
        "Van Bert",
      ])
    );
  });

  test("useList reorders optimistically and rolls back on INVALID_STATE", async () => {
    const { server, wrapper } = setup(SIGNED_IN);
    server.lists.set("srv-1", detail("srv-1", "Dieren", [AAP, BEER, HOND]));
    const { result } = renderHook(() => useList("srv-1"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const names = () => result.current.list?.items.map((item) => item.name);

    await act(async () => {
      await result.current.reorder([HOND.id, AAP.id, BEER.id]);
    });
    await waitFor(() => expect(names()).toEqual(["Hond", "Aap", "Beer"]));

    server.failNextReorder = true;
    let failure: Promise<void> | undefined;
    act(() => {
      failure = result.current.reorder([BEER.id, HOND.id, AAP.id]);
    });
    // Optimistic: the new order shows while the call is in flight.
    await waitFor(() => expect(names()).toEqual(["Beer", "Hond", "Aap"]));
    await act(async () => {
      await expect(failure).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
    await waitFor(() => expect(names()).toEqual(["Hond", "Aap", "Beer"]));
  });

  test("useList removes optimistically, adds, and reports NOT_FOUND", async () => {
    const { server, wrapper } = setup(SIGNED_IN);
    server.lists.set("srv-1", detail("srv-1", "Dieren", [AAP, BEER]));
    const { result } = renderHook(() => useList("srv-1"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.removeItem(AAP.id);
      await result.current.addItem(KAT.id);
    });
    await waitFor(() =>
      expect(result.current.list?.items.map((item) => item.name)).toEqual([
        "Beer",
        "Kat",
      ])
    );

    const missing = renderHook(() => useList("srv-404"), { wrapper });
    await waitFor(() => expect(missing.result.current.notFound).toBe(true));
    expect(missing.result.current.status).toBe("ready");
  });

  test("useShareLinks creates, regenerates and revokes", async () => {
    const { server, wrapper } = setup(SIGNED_IN);
    server.lists.set("srv-1", detail("srv-1", "Dieren", []));
    const { result } = renderHook(() => useShareLinks("srv-1"), { wrapper });
    await waitFor(() =>
      expect(!result.current.requiresAccount && result.current.status).toBe(
        "ready"
      )
    );
    const state = () => {
      if (result.current.requiresAccount) {
        throw new Error("expected an account");
      }
      return result.current;
    };
    expect(state().links).toEqual({ edit: null, view: null });

    let first = "";
    let second = "";
    await act(async () => {
      first = (await state().create("view")).token;
      second = (await state().regenerate("view")).token;
    });
    expect(second).not.toBe(first);
    await waitFor(() => expect(state().links?.view?.token).toBe(second));

    await act(async () => {
      await state().revoke("view");
    });
    await waitFor(() => expect(state().links?.view).toBeNull());
  });
});

describe("useSharedList", () => {
  test("anyone can view; an edit link needs sign-in to edit", async () => {
    const guest = setup();
    guest.server.lists.set("srv-1", detail("srv-1", "Dieren", [HOND]));
    guest.server.shares.set("srv-1", [
      { role: "edit", token: "edit-token" },
      { role: "view", token: "view-token" },
    ]);
    const { result, unmount } = renderHook(() => useSharedList("edit-token"), {
      wrapper: guest.wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({
      canEdit: false,
      notFound: false,
      requiresSignIn: true,
    });
    expect(result.current.data?.list.ownerName).toBe("Anna");
    unmount();

    guest.auth.current = SIGNED_IN;
    const view = renderHook(() => useSharedList("view-token"), {
      wrapper: guest.wrapper,
    });
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(view.result.current).toMatchObject({
      canEdit: false,
      requiresSignIn: false,
    });
    view.unmount();

    const edit = renderHook(() => useSharedList("edit-token"), {
      wrapper: guest.wrapper,
    });
    await waitFor(() => expect(edit.result.current.canEdit).toBe(true));
    await act(async () => {
      await edit.result.current.addItem(KAT.id);
    });
    expect(guest.server.calls).toContain(`shared.addItem:${KAT.id}`);
    // The invalidation refetches the shared list; let it settle.
    await waitFor(() => expect(edit.result.current.status).toBe("ready"));
    edit.unmount();
  });

  test("an unknown or revoked link is notFound", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSharedList("nope"), { wrapper });

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
