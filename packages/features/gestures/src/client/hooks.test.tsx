import { afterEach, describe, expect, test } from "bun:test";
import { createRouterClient, implement } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import {
  createLocalStore,
  createMemoryAdapter,
  type LocalStore,
} from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider } from "@smog/rpc/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { gesturesContract } from "../contract";
import type { GestureSummary } from "../schema";
import {
  CATALOG_STALE_TIME,
  CATEGORIES_STALE_TIME,
  SEARCH_DEBOUNCE_MS,
  useCategories,
  useGesture,
  useGestureSearch,
  useGestures,
  useRecentSearches,
  useRelated,
} from "./index";

function summary(name: string): GestureSummary {
  const slug = name.toLowerCase();
  return { categories: [], id: `id-${slug}`, name, playbackId: "p", slug };
}

const CATALOGUE = ["Aap", "Beer", "Hond", "Kat", "Vogel"].map(summary);

interface Calls {
  list: { category?: string[] | undefined; cursor?: string | undefined }[];
  related: string[];
  search: { category?: string[] | undefined; q: string }[];
}

/** The gestures contract implemented in memory, as a real oRPC client. */
function fakeApi(calls: Calls) {
  const os = implement(gesturesContract);
  const router = {
    gestures: os.router({
      byIds: os.byIds.handler(() => []),
      bySlug: os.bySlug.handler(({ errors, input }) => {
        const found = CATALOGUE.find((item) => item.slug === input.slug);
        if (!found) {
          throw errors.NOT_FOUND();
        }
        return {
          ...found,
          canonicalSlug: found.slug,
          description: "",
          keywords: [],
          sponsor: null,
        };
      }),
      categories: os.categories.handler(() => [
        { gestureCount: 5, name: "Dieren", slug: "dieren" },
      ]),
      list: os.list.handler(({ input }) => {
        calls.list.push({ category: input.category, cursor: input.cursor });
        const start = input.cursor ? Number(input.cursor) : 0;
        const end = start + input.limit;
        return {
          items: CATALOGUE.slice(start, end),
          nextCursor: end < CATALOGUE.length ? String(end) : null,
        };
      }),
      related: os.related.handler(({ input }) => {
        calls.related.push(input.slug);
        return CATALOGUE.filter((item) => item.slug !== input.slug).slice(
          0,
          input.limit
        );
      }),
      search: os.search.handler(async ({ input }) => {
        calls.search.push({ category: input.category, q: input.q });
        // Latency well above waitFor's polling, so the placeholder state
        // (the next search in flight) is observable.
        await new Promise((resolve) => setTimeout(resolve, 100));
        const items = CATALOGUE.filter((item) =>
          item.name.toLowerCase().startsWith(input.q.toLowerCase())
        ).map((item) => ({
          ...item,
          matchedField: "name" as const,
          matchType: "startsWith" as const,
          score: 50_000,
        }));
        return { items, total: items.length };
      }),
      sitemap: os.sitemap.handler(() => []),
    }),
  };
  const client = createRouterClient(router);
  return { client, queryUtils: createTanstackQueryUtils(client) };
}

function setup() {
  const calls: Calls = { list: [], related: [], search: [] };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store: LocalStore = createLocalStore(createMemoryAdapter());
  const api = fakeApi(calls);
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RpcProvider client={api.client} queryUtils={api.queryUtils}>
          <LocalStoreProvider store={store}>{children}</LocalStoreProvider>
        </RpcProvider>
      </QueryClientProvider>
    );
  }
  return { calls, queryClient, store, wrapper };
}

function staleTimeOf(queryClient: QueryClient, procedure: string): unknown {
  const query = queryClient
    .getQueryCache()
    .getAll()
    .find((item) => JSON.stringify(item.queryKey).includes(procedure));
  return (query?.options as { staleTime?: unknown } | undefined)?.staleTime;
}

afterEach(() => {
  cleanup();
});

describe("useGesture", () => {
  test("loads the detail by slug, fresh for 5 minutes", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useGesture("hond"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Hond");
    expect(staleTimeOf(queryClient, "bySlug")).toBe(CATALOG_STALE_TIME);
    expect(CATALOG_STALE_TIME).toBe(5 * 60_000);
  });

  test("surfaces NOT_FOUND as a typed error", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useGesture("onbekend"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("useGestures", () => {
  test("pages through the list and flattens the pages", async () => {
    const { calls, wrapper } = setup();
    const { result } = renderHook(
      () => useGestures({ category: ["familie", "dieren"] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const firstPage = result.current.data ?? [];
    expect(firstPage.length).toBeGreaterThan(0);
    while (result.current.hasNextPage) {
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor.
      await act(async () => {
        await result.current.fetchNextPage();
      });
    }

    expect(result.current.data?.map((item) => item.name)).toEqual(
      CATALOGUE.map((item) => item.name)
    );
    // The filter is sent sorted, so equal filters share a cache entry.
    expect(calls.list[0]).toEqual({
      category: ["dieren", "familie"],
      cursor: undefined,
    });
    expect(calls.list.slice(1).every((call) => call.cursor)).toBe(true);
  });
});

describe("useCategories", () => {
  test("loads the categories, fresh for an hour", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { gestureCount: 5, name: "Dieren", slug: "dieren" },
    ]);
    expect(staleTimeOf(queryClient, "categories")).toBe(CATEGORIES_STALE_TIME);
    expect(CATEGORIES_STALE_TIME).toBe(60 * 60_000);
  });
});

describe("useRelated", () => {
  test("loads the related gestures of a slug", async () => {
    const { calls, wrapper } = setup();
    const { result } = renderHook(() => useRelated("hond"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.related).toEqual(["hond"]);
    expect(result.current.data?.map((item) => item.slug)).not.toContain("hond");
  });
});

describe("useGestureSearch", () => {
  test("debounces the query by 250 ms and sends only the settled text", async () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(250);
    const { calls, wrapper } = setup();
    const { rerender, result } = renderHook(
      ({ q }: { q: string }) => useGestureSearch({ q }),
      { initialProps: { q: "" }, wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const before = calls.search.length;

    for (const q of ["h", "ho", "hon", "hond "]) {
      rerender({ q });
    }
    expect(result.current.isDebouncing).toBe(true);
    await waitFor(() =>
      expect(result.current.data?.items.map((item) => item.name)).toEqual([
        "Hond",
      ])
    );

    expect(calls.search.slice(before)).toEqual([
      { category: undefined, q: "hond" },
    ]);
    expect(result.current.isDebouncing).toBe(false);
  });

  test("keeps the previous results while the next ones load", async () => {
    const { wrapper } = setup();
    const { rerender, result } = renderHook(
      ({ q }: { q: string }) => useGestureSearch({ category: ["dieren"], q }),
      { initialProps: { q: "hond" }, wrapper }
    );
    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));

    rerender({ q: "kat" });
    // While debouncing and fetching, the "hond" results stay on screen.
    expect(result.current.data?.items[0]?.name).toBe("Hond");
    await waitFor(
      () => {
        expect(result.current.isPlaceholderData).toBe(true);
        expect(result.current.data?.items[0]?.name).toBe("Hond");
      },
      { interval: 10 }
    );

    await waitFor(() =>
      expect(result.current.data?.items[0]?.name).toBe("Kat")
    );
    expect(result.current.isPlaceholderData).toBe(false);
  });
});

describe("useRecentSearches", () => {
  test("adds (newest first, deduped) and clears on the device", async () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useRecentSearches(), { wrapper });
    expect(result.current.items).toEqual([]);

    await act(async () => {
      await result.current.add("hond");
      await result.current.add("kat");
      await result.current.add("HOND");
    });
    expect(result.current.items).toEqual(["HOND", "kat"]);
    expect(store.getSnapshot().recentSearches).toEqual(["HOND", "kat"]);

    await act(async () => {
      await result.current.clear();
    });
    expect(result.current.items).toEqual([]);
  });
});
