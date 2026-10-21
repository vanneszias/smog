import { describe, expect, test } from "bun:test";
import { addRecentSearch } from "@smog/local-store";
import { useLocalStoreInstance } from "@smog/local-store/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useEffect } from "react";
import { renderSite } from "@/test/render";
import {
  isSearchShortcut,
  SearchPaletteProvider,
  useSearchPalette,
} from "./search-palette-provider";

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
    const field = document.createElement("input");
    document.body.append(field);
    const typed = new KeyboardEvent("keydown", { bubbles: true, key: "/" });
    field.dispatchEvent(typed);
    // The event's target is the field once dispatched.
    expect(isSearchShortcut(typed)).toBe(false);
    field.remove();
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
