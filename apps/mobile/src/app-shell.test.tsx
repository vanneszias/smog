import { describe, expect, it, jest } from "@jest/globals";
import { screen } from "expo-router/testing-library";
import { renderApp } from "./test/harness";

const mockSetColorScheme = jest.fn();

// The real client (Better Auth, SecureStore) is replaced by a guest fake.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../global.css", () => ({}));
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

describe("app shell", () => {
  it("renders the four tabs with the home screen first", async () => {
    await renderApp();

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
