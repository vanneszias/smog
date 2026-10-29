import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import { renderApp } from "../../../support/mobile/harness";

const mockSetColorScheme = jest.fn();

// The real client (Better Auth, SecureStore) is replaced by a guest fake.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../../../../../apps/mobile/global.css", () => ({}));
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
      await screen.findByRole("header", {
        name: "Gestures that support your speech",
      })
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

  it("keeps the green behind Home's status bar and past its top", async () => {
    await renderApp();
    const home = await screen.findByTestId("home-screen");
    // The tab's automatic insets: the last row clears the tab bar.
    expect(home.props.contentInsetAdjustmentBehavior).toBe("automatic");
    // A pull past the top opens onto green, not onto the page.
    const overscroll = StyleSheet.flatten(
      screen.getByTestId("home-overscroll").props.style
    );
    expect(overscroll.bottom).toBe("100%");
    expect(Number(overscroll.top)).toBeLessThan(0);
    expect(screen.getByTestId("home-status-bar")).toBeOnTheScreen();
  });

  it("leaves settings with a visible back button, back to home", async () => {
    const { result } = await renderApp();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Settings" })
    );
    await waitFor(() => expect(result.getPathname()).toBe("/settings"));
    await fireEvent.press(await screen.findByTestId("settings-back"));
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });

  it("names the settings back button for screen readers", async () => {
    await renderApp({ initialUrl: "/settings" });
    expect(
      await screen.findByRole("button", { name: "Back" })
    ).toBeOnTheScreen();
  });

  it("goes home from settings opened by a link, with the tabs beneath", async () => {
    const { result } = await renderApp({ initialUrl: "/settings" });
    await fireEvent.press(await screen.findByTestId("settings-back"));
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });
});
