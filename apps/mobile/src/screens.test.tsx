import { describe, expect, it, jest } from "@jest/globals";
import NetInfo from "@react-native-community/netinfo";
import { createApiClient, createApiQueryUtils } from "@smog/api/client";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClientSave } from "@tanstack/react-query-persist-client";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import { Alert } from "react-native";
import { createPersistOptions } from "./lib/query-persist";
import { appCacheBuster } from "./providers";
import { HOND, KAT, memoryStorage, renderApp, rpcError } from "./test/harness";

// The real auth client (Better Auth, SecureStore) is never built: tests pass fakes.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../global.css", () => ({}));
// Jest has no compiled NativeWind CSS (so no class dark mode to switch).
jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: () => undefined,
      toggleColorScheme: () => undefined,
    }),
  };
});

const { mockScreenshot } = jest.requireMock("expo-screen-capture") as {
  mockScreenshot: () => void;
};

const LES_1 = /Les 1/;
const DIEREN_OP_SCHOOL = /Dieren op school/;

/**
 * Queries inside one screen (its root's `<name>-screen` testID): native
 * tabs keep the other tabs mounted, so a gesture can be on several.
 */
async function inScreen(name: string): Promise<ReturnType<typeof within>> {
  return within(await screen.findByTestId(`${name}-screen`));
}

const LOCAL_LIST = {
  createdAt: 1,
  gestureIds: [HOND.id, KAT.id],
  id: "loc_les-1",
  name: "Les 1",
  updatedAt: 2,
};

const ACCOUNT_LIST = {
  description: null,
  id: "list-1",
  itemCount: 1,
  name: "Dieren op school",
  shares: { edit: false, view: true },
  updatedAt: 3,
};

describe("home", () => {
  it("shows the featured gestures and the categories", async () => {
    await renderApp();
    const home = await inScreen("home");
    expect(
      await home.findByRole("header", { name: "Discover gestures" })
    ).toBeOnTheScreen();
    expect(await home.findByRole("button", { name: "Hond" })).toBeOnTheScreen();
    expect(home.getByRole("button", { name: "Kat" })).toBeOnTheScreen();
    expect(
      home.getByRole("togglebutton", { name: "Dieren" })
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("offline-banner")).not.toBeOnTheScreen();
  });
});

describe("search", () => {
  it("searches the query a link carried", async () => {
    const { result } = await renderApp({ initialUrl: "/search?q=kat" });
    expect(result.getPathname()).toBe("/search");
    const search = await inScreen("search");
    expect(await search.findByText("1 gesture")).toBeOnTheScreen();
    expect(search.getByRole("button", { name: "Kat" })).toBeOnTheScreen();
    expect(search.queryByRole("button", { name: "Hond" })).toBeNull();
  });

  it("shows the empty state when nothing matches", async () => {
    await renderApp({ initialUrl: "/search?q=olifant" });
    expect(
      await (await inScreen("search")).findByText("No gestures found")
    ).toBeOnTheScreen();
  });
});

describe("favorites", () => {
  it("shows a guest's favorites from the device", async () => {
    const { fetch } = await renderApp({
      guest: { favorites: [HOND.id] },
      initialUrl: "/favorites",
    });
    const favorites = await inScreen("favorites");
    expect(
      await favorites.findByRole("button", { name: "Hond" })
    ).toBeOnTheScreen();
    expect(favorites.queryByRole("button", { name: "Kat" })).toBeNull();
    const paths = fetch.mock.calls.map(
      ([request]) => new URL(request.url).pathname
    );
    expect(paths).not.toContain("/api/rpc/favorites/ids");
  });

  it("shows the account's favorites when signed in, not the device's", async () => {
    await renderApp({
      guest: { favorites: [HOND.id] },
      initialUrl: "/favorites",
      routes: {
        "favorites/ids": [KAT.id],
        "favorites/list": { items: [KAT], nextCursor: null },
      },
      signedIn: true,
    });
    const favorites = await inScreen("favorites");
    expect(
      await favorites.findByRole("button", { name: "Kat" })
    ).toBeOnTheScreen();
    expect(favorites.queryByRole("button", { name: "Hond" })).toBeNull();
  });

  it("offers the search when there are none", async () => {
    await renderApp({ initialUrl: "/favorites" });
    const favorites = await inScreen("favorites");
    expect(await favorites.findByText("No favorites yet")).toBeOnTheScreen();
    expect(
      favorites.getByRole("button", { name: "Explore gestures" })
    ).toBeOnTheScreen();
  });
});

describe("lists", () => {
  it("shows a guest's lists and opens one with its gestures", async () => {
    const { result } = await renderApp({
      guest: { lists: [LOCAL_LIST] },
      initialUrl: "/lists",
    });
    const row = await screen.findByRole("button", { name: LES_1 });
    await fireEvent.press(row);
    await waitFor(() => expect(result.getPathname()).toBe("/lists/loc_les-1"));
    expect(await screen.findByTestId("drag-g-hond")).toBeOnTheScreen();
    expect(screen.getByTestId("drag-g-kat")).toBeOnTheScreen();
    // Sharing needs an account: a guest gets the sign-in prompt.
    await fireEvent.press(screen.getByRole("button", { name: "Share list" }));
    expect(await screen.findByText("Sign in to share")).toBeOnTheScreen();
  });

  it("shows the account's lists when signed in", async () => {
    await renderApp({
      guest: { lists: [LOCAL_LIST] },
      initialUrl: "/lists",
      routes: { "lists/mine": [ACCOUNT_LIST] },
      signedIn: true,
    });
    expect(
      await screen.findByRole("button", { name: DIEREN_OP_SCHOOL })
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: LES_1 })).toBeNull();
    expect(screen.getByText("Shared")).toBeOnTheScreen();
  });

  it("reorders an account list from a row's menu", async () => {
    const reorders: unknown[] = [];
    await renderApp({
      initialUrl: "/lists",
      routes: {
        "lists/get": {
          ...ACCOUNT_LIST,
          itemCount: 2,
          items: [
            { ...HOND, position: 0 },
            { ...KAT, position: 1 },
          ],
        },
        "lists/mine": [ACCOUNT_LIST],
        "lists/reorder": (input: unknown) => {
          reorders.push(input);
          return null;
        },
      },
      signedIn: true,
    });
    const row = await screen.findByRole("button", { name: DIEREN_OP_SCHOOL });
    await fireEvent.press(row);
    const list = await inScreen("list");
    expect(await list.findByTestId("drag-g-hond")).toBeOnTheScreen();
    await fireEvent.press(
      list.getByRole("button", { name: "Actions for Hond" })
    );
    await fireEvent.press(
      await screen.findByRole("menuitem", { name: "Move down" })
    );
    await waitFor(() =>
      expect(reorders).toEqual([
        { gestureIds: [KAT.id, HOND.id], id: "list-1" },
      ])
    );
  });

  it("says a missing list is not found", async () => {
    await renderApp({ initialUrl: "/lists/loc_gone" });
    expect(await screen.findByText("List not found")).toBeOnTheScreen();
  });
});

describe("gesture", () => {
  it("shows the video, the details and related gestures", async () => {
    await renderApp({ initialUrl: "/gestures/hond" });
    expect(
      await screen.findByRole("header", { name: "Hond" })
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Hond")).toBeOnTheScreen();
    expect(screen.getByText("Het gebaar voor hond.")).toBeOnTheScreen();
    expect(screen.getByText("huisdier")).toBeOnTheScreen();
    expect(
      screen.getByRole("header", { name: "Related gestures" })
    ).toBeOnTheScreen();
    expect(
      screen.getAllByRole("button", { name: "Kat" }).length
    ).toBeGreaterThan(0);
  });

  it("offers to share the link after a screenshot", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    await renderApp({ initialUrl: "/gestures/hond" });
    await screen.findByRole("header", { name: "Hond" });
    await act(() => {
      mockScreenshot();
    });
    expect(alert).toHaveBeenCalledWith(
      "Share this gesture?",
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: "Share link" })])
    );
    alert.mockRestore();
  });

  it("says an unknown gesture is not found", async () => {
    await renderApp({ initialUrl: "/gestures/olifant" });
    expect(await screen.findByText("Gesture not found")).toBeOnTheScreen();
  });
});

describe("shared list", () => {
  const SHARED = {
    items: [{ ...HOND, position: 0 }],
    list: { description: null, name: "Klas 2B", ownerName: "Els" },
    role: "view",
  };

  it("shows a list behind a view link, without edit controls", async () => {
    await renderApp({
      initialUrl: "/shared/tok-view",
      routes: { "lists/shared/get": SHARED },
    });
    expect(await screen.findByText("Shared by Els")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Hond" })).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Remove from list" })
    ).toBeNull();
  });

  it("asks a guest with an edit link to sign in", async () => {
    await renderApp({
      initialUrl: "/shared/tok-edit",
      routes: { "lists/shared/get": { ...SHARED, role: "edit" } },
    });
    expect(
      await screen.findByText("Sign in to edit this list.")
    ).toBeOnTheScreen();
  });

  it("lets a signed-in editor take gestures out", async () => {
    await renderApp({
      initialUrl: "/shared/tok-edit",
      routes: { "lists/shared/get": { ...SHARED, role: "edit" } },
      signedIn: true,
    });
    expect(
      await screen.findByRole("button", { name: "Remove from list" })
    ).toBeOnTheScreen();
  });

  it("says a revoked link is not found", async () => {
    await renderApp({
      initialUrl: "/shared/tok-revoked",
      routes: { "lists/shared/get": { response: rpcError("NOT_FOUND", 404) } },
    });
    expect(await screen.findByText("List not found")).toBeOnTheScreen();
  });
});

describe("after sign-in", () => {
  it("offers to import the device's favorites and lists", async () => {
    await renderApp({
      guest: {
        favorites: [HOND.id],
        lists: [LOCAL_LIST],
        preferences: { importDismissedFor: [], locale: "en", theme: "light" },
      },
      routes: {
        "favorites/ids": [],
        "favorites/list": { items: [], nextCursor: null },
      },
      signedIn: true,
    });
    expect(await screen.findByText("Bring your data along?")).toBeOnTheScreen();
    expect(screen.getByText("Import 1 favorite and 1 list?")).toBeOnTheScreen();
  });
});

describe("deep links", () => {
  it("opens a gesture link on the gesture card, with the tabs beneath", async () => {
    const { result } = await renderApp({
      initialUrl: "https://smog.test/gestures/hond",
    });
    expect(result.getPathname()).toBe("/gestures/hond");
    expect(
      await screen.findByRole("header", { name: "Hond" })
    ).toBeOnTheScreen();
    const { router } =
      jest.requireActual<typeof import("expo-router")>("expo-router");
    expect(router.canGoBack()).toBe(true);
    await act(() => {
      router.back();
    });
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });

  it("opens a list share link on the shared list screen", async () => {
    const { result } = await renderApp({
      initialUrl: "https://smog.test/lists/tok-view",
      routes: {
        "lists/shared/get": {
          items: [],
          list: { description: null, name: "Klas 2B", ownerName: "Els" },
          role: "view",
        },
      },
    });
    expect(result.getPathname()).toBe("/shared/tok-view");
    expect(await screen.findByText("Shared by Els")).toBeOnTheScreen();
  });

  it("sends an unknown link home", async () => {
    const { result } = await renderApp({
      initialUrl: "https://smog.test/sponsor",
    });
    expect(result.getPathname()).toBe("/");
  });
});

describe("offline", () => {
  it("restores the persisted catalogue and shows the offline banner", async () => {
    // Yesterday's session left the catalogue on disk.
    const cacheStorage = memoryStorage();
    const previous = new QueryClient();
    const rpc = createApiQueryUtils(
      createApiClient({ baseUrl: "https://smog.test" })
    );
    previous.setQueryData(
      rpc.gestures.list.infiniteKey({
        initialPageParam: undefined,
        input: (cursor: string | undefined) => ({
          category: undefined,
          cursor,
        }),
      }),
      { pageParams: [undefined], pages: [{ items: [HOND], nextCursor: null }] }
    );
    await persistQueryClientSave({
      queryClient: previous,
      ...createPersistOptions({
        buster: appCacheBuster(),
        storage: cacheStorage,
        throttleTime: 0,
      }),
    });
    await waitFor(() => expect(cacheStorage.map.size).toBe(1));
    previous.clear();

    // Today the device is offline: every request fails.
    jest.mocked(NetInfo.useNetInfo).mockReturnValue({
      isConnected: false,
    } as ReturnType<typeof NetInfo.useNetInfo>);
    await renderApp({
      cacheStorage,
      fetch: () => Promise.reject(new TypeError("Network request failed")),
    });
    const home = await inScreen("home");
    expect(await home.findByRole("button", { name: "Hond" })).toBeOnTheScreen();
    expect(home.getByTestId("offline-banner")).toBeOnTheScreen();
    expect(home.getByText("You're offline")).toBeOnTheScreen();
  });
});
