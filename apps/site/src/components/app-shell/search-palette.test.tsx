import { describe, expect, spyOn, test } from "bun:test";
import { addRecentSearch } from "@smog/local-store";
import { useLocalStoreInstance } from "@smog/local-store/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useEffect } from "react";
import { renderSite } from "@/test/render";
import {
  isSearchShortcut,
  loadPaletteChunk,
  SearchPaletteProvider,
  useSearchPalette,
} from "./search-palette-provider";

const HOND_NAME = /Hond/;
const HOND = {
  categories: [{ name: "Dieren", slug: "dieren" }],
  id: "g-hond",
  matchedField: "name",
  matchType: "startsWith",
  name: "Hond",
  playbackId: "pb-hond",
  score: 1,
  slug: "hond",
};
const API = {
  "gestures/categories": [
    { gestureCount: 3, name: "Dieren", slug: "dieren" },
    { gestureCount: 2, name: "Eten", slug: "eten" },
  ],
  "gestures/list": { items: [], nextCursor: null },
  "gestures/search": (input: unknown) => {
    const { q } = input as { q: string };
    const items = q !== "" && "hond".startsWith(q.toLowerCase()) ? [HOND] : [];
    return { items, total: items.length };
  },
};

function OpenButton(): ReactNode {
  const palette = useSearchPalette();
  return (
    <button onClick={palette.open} type="button">
      Open search
    </button>
  );
}

function Page(): ReactNode {
  const store = useLocalStoreInstance();
  useEffect(() => {
    store.update(addRecentSearch("kat")).catch(() => undefined);
  }, [store]);
  return (
    <SearchPaletteProvider>
      <div data-testid="page">
        <OpenButton />
        <input aria-label="Notes" />
      </div>
    </SearchPaletteProvider>
  );
}

describe("isSearchShortcut", () => {
  test("a plain slash only, and never inside a field", () => {
    const slash = (init: KeyboardEventInit): KeyboardEvent =>
      new KeyboardEvent("keydown", { key: "/", ...init });
    expect(isSearchShortcut(slash({}))).toBe(true);
    expect(isSearchShortcut(slash({ ctrlKey: true }))).toBe(false);
    expect(isSearchShortcut(slash({ metaKey: true }))).toBe(false);
    expect(isSearchShortcut(slash({ repeat: true }))).toBe(false);
    expect(isSearchShortcut(new KeyboardEvent("keydown", { key: "a" }))).toBe(
      false
    );
    const typed = slash({});
    Object.defineProperty(typed, "target", {
      value: document.createElement("input"),
    });
    expect(isSearchShortcut(typed)).toBe(false);
  });
});

describe("the search palette", () => {
  test("/ opens it, results are grouped and a gesture opens its page", async () => {
    const { router } = await renderSite(Page, { api: API });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { key: "/" });
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    const input = within(dialog).getByRole("combobox");
    await userEvent.type(input, "hond");
    const gestures = await within(dialog).findByRole("group", {
      name: "Gestures",
    });
    await userEvent.click(within(gestures).getByText("Hond"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/gestures/hond")
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("Enter opens the first gesture even when the answer arrives after typing", async () => {
    const { router } = await renderSite(Page, { api: API });
    fireEvent.keyDown(document.body, { key: "/" });
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    await userEvent.type(within(dialog).getByRole("combobox"), "hond");
    await within(dialog).findByRole("option", { name: HOND_NAME });
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/gestures/hond")
    );
  });

  test("a slash typed in a field does not open it", async () => {
    await renderSite(Page, { api: API });
    const notes = screen.getByRole("textbox", { name: "Notes" });
    notes.focus();
    fireEvent.keyDown(notes, { key: "/" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("before typing: recent searches and categories; a category filters the list", async () => {
    const { router } = await renderSite(Page, { api: API });
    await userEvent.click(screen.getByRole("button", { name: "Open search" }));
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    const recent = await within(dialog).findByRole("group", {
      name: "Recent searches",
    });
    expect(within(recent).getByText("kat")).toBeDefined();
    const categories = await within(dialog).findByRole("group", {
      name: "Categories",
    });
    await userEvent.click(within(categories).getByText("Eten"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/gestures")
    );
    expect(router.state.location.search).toEqual({ category: "eten" });
  });

  test("Enter on the last item shows all results for the typed words", async () => {
    const { router } = await renderSite(Page, { api: API });
    await userEvent.click(screen.getByRole("button", { name: "Open search" }));
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    await userEvent.type(within(dialog).getByRole("combobox"), "xyz");
    const all = await within(dialog).findByRole("option", {
      name: "Show all results for “xyz”",
    });
    await userEvent.click(all);
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ q: "xyz" })
    );
  });
});

describe("a palette chunk that fails to load", () => {
  test("the import is retried once", async () => {
    let calls = 0;
    const module = await loadPaletteChunk(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ default: () => null });
    });
    expect(calls).toBe(2);
    expect(typeof module.default).toBe("function");
    calls = 0;
    await expect(
      loadPaletteChunk(() => {
        calls += 1;
        return Promise.reject(new Error("offline"));
      })
    ).rejects.toThrow("offline");
    expect(calls).toBe(2);
  });

  test("closes the palette with a toast, keeps the page and loads again next time", async () => {
    const real = () =>
      import("./search-palette").then((m) => ({ default: m.SearchPalette }));
    let broken = true;
    const load = () =>
      broken ? Promise.reject(new Error("chunk gone")) : real();
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    function FailingPage(): ReactNode {
      return (
        <SearchPaletteProvider loadPalette={load}>
          <div data-testid="page">
            <OpenButton />
          </div>
        </SearchPaletteProvider>
      );
    }
    await renderSite(FailingPage, { api: API });
    await userEvent.click(screen.getByRole("button", { name: "Open search" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The search could not be opened");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("page")).toBeDefined();
    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Open search" }));
    await screen.findByRole("dialog", { name: "Search" });
    errors.mockRestore();
  });
});
