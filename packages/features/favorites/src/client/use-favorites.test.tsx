import { afterEach, describe, expect, test } from "bun:test";
import { createRouterClient, implement } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { AnalyticsProvider } from "@smog/analytics/react";
import { createRecordingAnalytics } from "@smog/analytics/testing";
import { AuthStateProvider, type SessionHookResult } from "@smog/auth/react";
import { gesturesContract } from "@smog/gestures/contract";
import type { GestureSummary } from "@smog/gestures/schema";
import {
  createLocalStore,
  createMemoryAdapter,
  type LocalStore,
  toggleFavorite,
} from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider } from "@smog/rpc/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { favoritesContract } from "../contract";
import { type UseFavoritesOptions, useFavorites } from "./index";

function summary(name: string): GestureSummary {
  const slug = name.toLowerCase();
  return { categories: [], id: `id-${slug}`, name, playbackId: "p", slug };
}

const CATALOGUE = ["Aap", "Beer", "Hond", "Kat", "Vogel"].map(summary);
const [AAP, BEER, HOND] = CATALOGUE as [
  GestureSummary,
  GestureSummary,
  GestureSummary,
];

/** Lets pending promises and timers run. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

/** A promise the test resolves, to hold a server call in flight. */
function gate() {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, promise };
}

interface Server {
  byIds: string[][];
  calls: string[];
  /** When set, `add` / `remove` fail. */
  fail?: boolean;
  /** When set, `ids` fails (a refetch then cannot mask a missing rollback). */
  failIds?: boolean;
  /** Server-side favorites of the signed-in user, newest first. */
  favorites: string[];
  /** When set, `add` / `remove` wait for it. */
  hold?: Promise<void>;
}

/** The favorites contract and gestures.byIds in memory, as a real oRPC client. */
function fakeApi(server: Server) {
  const fav = implement(favoritesContract);
  const gestures = implement({ byIds: gesturesContract.byIds });
  async function write(gestureId: string, favorite: boolean) {
    await server.hold;
    if (server.fail) {
      throw new Error("boom");
    }
    server.favorites = server.favorites.filter((id) => id !== gestureId);
    if (favorite) {
      server.favorites.unshift(gestureId);
    }
    return { favorite };
  }
  const router = {
    favorites: fav.router({
      add: fav.add.handler(({ input }) => {
        server.calls.push(`add:${input.gestureId}`);
        return write(input.gestureId, true);
      }),
      ids: fav.ids.handler(() => {
        server.calls.push("ids");
        if (server.failIds) {
          throw new Error("ids down");
        }
        return [...server.favorites];
      }),
      list: fav.list.handler(({ input }) => {
        server.calls.push(`list:${input.cursor ?? ""}`);
        const start = input.cursor ? Number(input.cursor) : 0;
        const end = start + input.limit;
        return {
          items: server.favorites
            .slice(start, end)
            .flatMap((id) => CATALOGUE.filter((item) => item.id === id)),
          nextCursor: end < server.favorites.length ? String(end) : null,
        };
      }),
      remove: fav.remove.handler(({ input }) => {
        server.calls.push(`remove:${input.gestureId}`);
        return write(input.gestureId, false);
      }),
      toggle: fav.toggle.handler(({ input }) => {
        server.calls.push(`toggle:${input.gestureId}`);
        return write(
          input.gestureId,
          !server.favorites.includes(input.gestureId)
        );
      }),
    }),
    gestures: gestures.router({
      byIds: gestures.byIds.handler(({ input }) => {
        server.byIds.push(input.ids);
        return input.ids.flatMap((id) =>
          CATALOGUE.filter((item) => item.id === id)
        );
      }),
    }),
  };
  const client = createRouterClient(router);
  return { client, queryUtils: createTanstackQueryUtils(client) };
}

type AuthMode = "loading" | "signedIn" | "signedOut";

function session(mode: AuthMode): SessionHookResult {
  if (mode === "loading") {
    return { data: undefined, isPending: true };
  }
  return {
    data:
      mode === "signedIn"
        ? { user: { email: "a@smog.test", id: "user-1", name: "A" } }
        : null,
    isPending: false,
  };
}

/** The session the fake hook returns; `setup` and `signOut` set it. */
let authMode: AuthMode = "signedOut";

/** One stable session hook (a hook must not change between renders). */
function useFakeSession(): SessionHookResult {
  return session(authMode);
}

function setup(mode: AuthMode, favorites: string[] = []) {
  const server: Server = { byIds: [], calls: [], favorites };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store: LocalStore = createLocalStore(createMemoryAdapter());
  const api = fakeApi(server);
  authMode = mode;
  const recorder = createRecordingAnalytics();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RpcProvider client={api.client} queryUtils={api.queryUtils}>
          <AnalyticsProvider analytics={recorder.analytics}>
            <LocalStoreProvider store={store}>
              <AuthStateProvider useSession={useFakeSession}>
                {children}
              </AuthStateProvider>
            </LocalStoreProvider>
          </AnalyticsProvider>
        </RpcProvider>
      </QueryClientProvider>
    );
  }
  /** Renders the hook and lets the store report `ready` inside `act`. */
  async function render(options?: UseFavoritesOptions) {
    const hook = renderHook(() => useFavorites(options), { wrapper });
    await act(() => store.ready);
    return hook;
  }
  return { events: recorder.events, queryClient, render, server, store };
}

function collectionChanged(
  action: "added" | "removed",
  gestureId: string,
  source: "gesture_detail" | "gesture_list" = "gesture_list"
) {
  return {
    name: "gesture_collection_changed",
    properties: {
      action,
      collection: "favorites",
      gesture_id: gestureId,
      source,
    },
  } as const;
}

afterEach(() => {
  cleanup();
});

describe("useFavorites while the session loads", () => {
  test("is loading and reads neither source", async () => {
    const { server, store, render } = setup("loading");
    await store.update(toggleFavorite(HOND.id));
    const { result } = await render();

    // Give any query a chance to start.
    await act(tick);
    expect(result.current.status).toBe("loading");
    expect(result.current.itemsStatus).toBe("loading");
    expect([...result.current.ids]).toEqual([]);
    expect(result.current.isFavorite(HOND.id)).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(server.calls).toEqual([]);
    expect(server.byIds).toEqual([]);
  });
});

describe("useFavorites for a guest", () => {
  test("reads and toggles the local store, never the favorites API", async () => {
    const { server, store, render } = setup("signedOut");
    await store.update(toggleFavorite(AAP.id));
    await store.update(toggleFavorite(HOND.id));
    const { result } = await render();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.isFavorite(HOND.id)).toBe(true);
    // Newest first, resolved through gestures.byIds.
    await waitFor(() =>
      expect(result.current.items.map((item) => item.name)).toEqual([
        "Hond",
        "Aap",
      ])
    );
    expect(server.byIds[0]).toEqual([HOND.id, AAP.id]);

    await act(async () => {
      await result.current.toggle(BEER.id);
      await tick();
    });
    expect(result.current.isFavorite(BEER.id)).toBe(true);
    expect(store.getSnapshot().favorites).toEqual([AAP.id, HOND.id, BEER.id]);
    await waitFor(() =>
      expect(result.current.items.map((item) => item.name)).toEqual([
        "Beer",
        "Hond",
        "Aap",
      ])
    );

    await act(async () => {
      await result.current.toggle(HOND.id);
      await tick();
    });
    expect(result.current.isFavorite(HOND.id)).toBe(false);
    expect(result.current.items.map((item) => item.name)).toEqual([
      "Beer",
      "Aap",
    ]);
    expect(server.calls).toEqual([]);
  });

  test("keeps one catalogue query for the guest's favorites, scoped to the guest", async () => {
    const { queryClient, render, store } = setup("signedOut");
    await store.update(toggleFavorite(AAP.id));
    const { result } = await render();
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    for (const gesture of [BEER, HOND]) {
      // biome-ignore lint/performance/noAwaitInLoops: one tap after another
      await act(async () => {
        await result.current.toggle(gesture.id);
        await tick();
      });
    }
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    const byIds = queryClient
      .getQueryCache()
      .findAll({ queryKey: [["gestures", "byIds"]] });
    // Every tap made a new variant; only the one shown is kept.
    expect(byIds).toHaveLength(1);
    // Scoped to the guest, so a sign-in drops it (`purgeOtherUsers`).
    expect(byIds[0]?.queryKey.at(-1)).toEqual({ user: null });
  });

  test("with no favorites, has no items and calls nothing", async () => {
    const { server, render } = setup("signedOut");
    const { result } = await render();

    await waitFor(() => expect(result.current.itemsStatus).toBe("ready"));
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMoreItems).toBe(false);
    expect(server.byIds).toEqual([]);
  });
});

describe("useFavorites analytics", () => {
  test("a guest toggle sends gesture_collection_changed with the hook's source", async () => {
    const { events, render, store } = setup("signedOut");
    await store.update(toggleFavorite(HOND.id));
    const { result } = await render({ items: false, source: "gesture_detail" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.toggle(BEER.id);
      await result.current.toggle(HOND.id);
    });
    expect(events).toEqual([
      collectionChanged("added", BEER.id, "gesture_detail"),
      collectionChanged("removed", HOND.id, "gesture_detail"),
    ]);
  });

  test("signed in, only a flip the server confirmed is sent", async () => {
    const { events, render, server } = setup("signedIn", [AAP.id]);
    const { result } = await render({ items: false });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.toggle(HOND.id);
    });
    expect(events).toEqual([collectionChanged("added", HOND.id)]);

    server.fail = true;
    await act(async () => {
      await result.current.toggle(AAP.id).catch(() => undefined);
    });
    expect(events).toHaveLength(1);
  });
});

describe("useFavorites when signed in", () => {
  test("reads the API, not the local store", async () => {
    const { server, store, render } = setup("signedIn", [BEER.id, AAP.id]);
    await store.update(toggleFavorite(HOND.id));
    const { result } = await render();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect([...result.current.ids]).toEqual([BEER.id, AAP.id]);
    expect(result.current.isFavorite(HOND.id)).toBe(false);
    await waitFor(() =>
      expect(result.current.items.map((item) => item.name)).toEqual([
        "Beer",
        "Aap",
      ])
    );
    expect(server.byIds).toEqual([]);
  });

  test("flips optimistically, then refetches ids and list", async () => {
    const { server, render } = setup("signedIn", [AAP.id]);
    const { result } = await render();
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const held = gate();
    server.hold = held.promise;
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = result.current.toggle(HOND.id);
      // The optimistic flip lands; the server call stays held.
      await tick();
    });
    // Before the server answers.
    await waitFor(() => expect(result.current.isFavorite(HOND.id)).toBe(true));
    expect(server.calls.at(-1)).toBe(`add:${HOND.id}`);

    const before = server.calls.length;
    held.open();
    await act(async () => {
      await done;
      await tick();
    });
    await waitFor(() =>
      expect(result.current.items.map((item) => item.name)).toEqual([
        "Hond",
        "Aap",
      ])
    );
    expect(server.calls.slice(before)).toEqual(
      expect.arrayContaining(["ids", "list:"])
    );

    // Removing hides the item at once, before the server answers.
    const again = gate();
    server.hold = again.promise;
    await act(async () => {
      done = result.current.toggle(AAP.id);
      // The optimistic flip lands; the server call stays held.
      await tick();
    });
    await waitFor(() => expect(result.current.isFavorite(AAP.id)).toBe(false));
    expect(result.current.items.map((item) => item.name)).toEqual(["Hond"]);
    expect(server.calls.at(-1)).toBe(`remove:${AAP.id}`);
    again.open();
    await act(async () => {
      await done;
      await tick();
    });
    expect(server.favorites).toEqual([HOND.id]);
  });

  test("rolls the flip back when the server fails", async () => {
    const { server, render } = setup("signedIn", [AAP.id]);
    const { result } = await render();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const held = gate();
    server.hold = held.promise;
    server.fail = true;
    server.failIds = true;
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = result.current.toggle(HOND.id);
      // The optimistic flip lands; the server call stays held.
      await tick();
    });
    await waitFor(() => expect(result.current.isFavorite(HOND.id)).toBe(true));

    held.open();
    let failure: unknown;
    await act(async () => {
      await done.catch((error: unknown) => {
        failure = error;
      });
      await tick();
    });
    expect(failure).toBeDefined();
    await waitFor(() => expect(result.current.isFavorite(HOND.id)).toBe(false));
    expect(result.current.isFavorite(AAP.id)).toBe(true);
  });

  test("pages through the list", async () => {
    const ids = Array.from({ length: 60 }, (_, index) => `id-${index}`);
    const { server, render } = setup("signedIn", ids);
    const { result } = await render();

    await waitFor(() => expect(result.current.itemsStatus).toBe("ready"));
    // Unknown gestures in this fake: the list is empty, the pages are not.
    expect(result.current.hasMoreItems).toBe(true);
    await act(async () => {
      await result.current.loadMoreItems();
    });
    await waitFor(() => expect(result.current.hasMoreItems).toBe(false));
    expect(server.calls).toEqual(["ids", "list:", "list:50"]);
  });

  test("two taps in one tick: add then remove, sent in order", async () => {
    const { server, render } = setup("signedIn", [AAP.id]);
    const { result } = await render();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const held = gate();
    server.hold = held.promise;
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.toggle(HOND.id);
      second = result.current.toggle(HOND.id);
      await tick();
    });
    // The second tap saw the first: net state is "not a favorite".
    expect(result.current.isFavorite(HOND.id)).toBe(false);
    // Flips are queued: the remove waits for the add.
    expect(server.calls.filter((call) => call.includes(HOND.id))).toEqual([
      `add:${HOND.id}`,
    ]);

    await act(async () => {
      held.open();
      await Promise.all([first, second]);
      await tick();
    });
    expect(server.calls.filter((call) => call.includes(HOND.id))).toEqual([
      `add:${HOND.id}`,
      `remove:${HOND.id}`,
    ]);
    expect(server.favorites).toEqual([AAP.id]);
    expect(result.current.isFavorite(HOND.id)).toBe(false);
    expect(result.current.isFavorite(AAP.id)).toBe(true);
  });

  test("drops the user's favorites cache on sign-out", async () => {
    const { queryClient, render, server, store } = setup("signedIn", [AAP.id]);
    const { rerender, result } = await render();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const userQueries = () =>
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => JSON.stringify(query.queryKey).includes("user-1"));
    expect(userQueries().length).toBeGreaterThan(0);

    authMode = "signedOut";
    await act(async () => {
      rerender();
      await tick();
    });
    expect(userQueries()).toEqual([]);
    // Now a guest: the (empty) local store, not the old account data.
    expect(result.current.isFavorite(AAP.id)).toBe(false);
    expect(store.getSnapshot().favorites).toEqual([]);
    expect(server.calls.filter((call) => call === "ids")).toHaveLength(1);
  });

  test("skips the list when items are not asked for", async () => {
    const { server, render } = setup("signedIn", [AAP.id]);
    const { result } = await render({ items: false });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(server.calls).toEqual(["ids"]);
    expect(result.current.items).toEqual([]);
  });
});
