import { describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
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
  it("keeps Home navigation outside the scroller", async () => {
    await renderApp();
    const band = within(await screen.findByTestId("home-header"));
    expect(
      await band.findByRole("button", { name: "Settings" })
    ).toBeOnTheScreen();
    const content = within(screen.getByTestId("home-scroll"));
    expect(content.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(
      content.getByPlaceholderText("Search for a gesture")
    ).toBeOnTheScreen();
    expect(screen.getByTestId("home-scroll").props.bounces).toBe(false);
    expect(
      screen.getByTestId("home-scroll").props.contentInsetAdjustmentBehavior
    ).toBe("automatic");
  });

  it("returns from Settings to Home with its visible back action", async () => {
    const { result } = await renderApp({ realSettings: true });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Settings" })
    );
    await waitFor(() => expect(result.getPathname()).toBe("/settings"));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });

  it("returns a directly opened Settings screen to Home", async () => {
    const { result } = await renderApp({
      initialUrl: "/settings",
      realSettings: true,
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });
  it("returns Settings to its actual previous screen", async () => {
    const { result } = await renderApp({
      initialUrl: "/gestures/hond",
      realSettings: true,
    });
    await screen.findByRole("header", { name: "Hond" });
    await act(() => router.push("/settings"));
    await waitFor(() => expect(result.getPathname()).toBe("/settings"));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(result.getPathname()).toBe("/gestures/hond"));
  });

  it("keeps account navigation inside Settings", async () => {
    const { result } = await renderApp({ realSettings: true, signedIn: true });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Settings" })
    );
    await waitFor(() => expect(result.getPathname()).toBe("/settings"));
    await act(() => router.push("/settings/account"));
    await waitFor(() => expect(result.getPathname()).toBe("/settings/account"));
    await act(() => router.back());
    await waitFor(() => expect(result.getPathname()).toBe("/settings"));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });
});
