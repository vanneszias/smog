import { describe, expect, it, jest } from "@jest/globals";
import { createApiClient } from "@smog/api/client";
import type { ExpoAuthClient } from "@smog/auth/expo";
import { createLocalStore, createMemoryAdapter } from "@smog/local-store";
import { KitProvider, ToastProvider } from "@smog/ui-native";
import { QueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import type { ReactElement } from "react";
import { type AppClients, AppProviders, sessionHook } from "./providers";
import { ThemeRoot } from "./theme-root";

const mockSetColorScheme = jest.fn();

// The real client (Better Auth, SecureStore) is replaced by a guest fake.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
// Jest has no compiled NativeWind CSS (so no class dark mode to switch).
jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: mockSetColorScheme,
      toggleColorScheme: jest.fn(),
    }),
  };
});

const FavoritesScreen = require("../app/(tabs)/favorites").default;
const HomeScreen = require("../app/(tabs)/index").default;
const ListsScreen = require("../app/(tabs)/lists").default;
const SearchScreen = require("../app/(tabs)/search").default;
const TabsLayout = require("../app/(tabs)/_layout").default;

/** A guest: no session, no network. */
function fakeClients(): AppClients {
  const auth = {
    getCookie: () => "",
    useSession: () => ({ data: null, error: null, isPending: false }),
  } as unknown as ExpoAuthClient;
  return {
    api: createApiClient({ baseUrl: "https://smog.test" }),
    auth,
    queryClient: new QueryClient(),
    store: createLocalStore(
      createMemoryAdapter({
        "smog:guest:v1": JSON.stringify({
          consent: { analytics: null },
          favorites: [],
          lists: [],
          preferences: { locale: "en", theme: "light" },
          recentSearches: [],
          version: 1,
        }),
      })
    ),
    useSession: sessionHook(auth),
  };
}

interface JsonNode {
  children?: (JsonNode | string)[] | null;
  props?: Record<string, unknown>;
  type?: string;
}

function tabTitles(tree: unknown): string[] {
  const titles: string[] = [];
  const visit = (node: JsonNode | string): void => {
    if (typeof node === "string") {
      return;
    }
    if (node.type?.startsWith("RNSTabsScreen") && node.props?.title) {
      titles.push(String(node.props.title));
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const node of [tree].flat() as JsonNode[]) {
    visit(node);
  }
  return titles;
}

function TestRoot(): ReactElement {
  return (
    <AppProviders clients={fakeClients()}>
      <ThemeRoot>
        <KitProvider>
          <ToastProvider>
            <Slot />
          </ToastProvider>
        </KitProvider>
      </ThemeRoot>
    </AppProviders>
  );
}

describe("app shell", () => {
  it("renders the four tabs with the home screen first", async () => {
    // RNTL 14 renders asynchronously; renderRouter returns its promise.
    await renderRouter(
      {
        _layout: TestRoot,
        "(tabs)/_layout": TabsLayout,
        "(tabs)/favorites": FavoritesScreen,
        "(tabs)/index": HomeScreen,
        "(tabs)/lists": ListsScreen,
        "(tabs)/search": SearchScreen,
      },
      { initialUrl: "/" }
    );

    // The stored language preference (en) applies once the store is read.
    expect(
      await screen.findByRole("header", { name: "SMOG & Co" })
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", { name: "Settings" })
    ).toBeOnTheScreen();
    // Native tabs: one native tab screen per trigger, titled by its label.
    expect(tabTitles(screen.toJSON())).toEqual([
      "Home",
      "Search",
      "Favorites",
      "Lists",
    ]);
    // The stored theme preference goes to NativeWind.
    expect(mockSetColorScheme).toHaveBeenCalledWith("light");
  });
});
