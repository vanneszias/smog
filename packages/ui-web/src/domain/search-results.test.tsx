import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Button } from "../components/button";
import { EAT, HELLO } from "../test/gestures";
import { renderKit } from "../test/render";
import {
  FavoritesEmptyState,
  ListItemsEmptyState,
  ListsEmptyState,
  NoResultsEmptyState,
  SearchIdleEmptyState,
} from "./empty-states";
import { SearchResults } from "./search-results";
import type { GestureCardData } from "./types";

const noop = (): void => undefined;

function exclaim(gesture: GestureCardData): ReactNode {
  return <span>{gesture.name}!</span>;
}

describe("SearchResults", () => {
  test("results: the count is a live status and the items a grid", () => {
    renderKit(
      <SearchResults
        items={[HELLO, EAT]}
        onRetry={noop}
        renderItem={exclaim}
        state="results"
      />
    );
    expect(screen.getByRole("status").textContent).toBe("2 gestures");
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Hello!")).toBeDefined();
  });

  test("loading: skeletons in a busy region", () => {
    const { container } = renderKit(
      <SearchResults items={[]} onRetry={noop} state="loading" />
    );
    expect(screen.getByRole("status").textContent).toBe("Searching…");
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(
      container.querySelectorAll("[aria-hidden=true].animate-pulse").length
    ).toBeGreaterThan(0);
  });

  test("empty: the no-results state with an optional action", () => {
    renderKit(
      <SearchResults
        emptyAction={<Button>Clear filters</Button>}
        items={[]}
        onRetry={noop}
        state="empty"
      />
    );
    expect(
      screen.getByRole("heading", { name: "No gestures found" })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDefined();
  });

  test("error: an alert with retry", async () => {
    const onRetry = mock();
    renderKit(<SearchResults items={[]} onRetry={onRetry} state="error" />);
    expect(screen.getByRole("alert")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("idle: the search prompt", () => {
    renderKit(<SearchResults items={[]} onRetry={noop} state="idle" />);
    expect(
      screen.getByRole("heading", { name: "Look up a gesture" })
    ).toBeDefined();
  });
});

describe("empty states", () => {
  test("each has its own copy and takes the next action", () => {
    const cases = [
      [FavoritesEmptyState, "No favorites yet"],
      [ListsEmptyState, "No lists yet"],
      [ListItemsEmptyState, "This list is empty"],
      [NoResultsEmptyState, "No gestures found"],
      [SearchIdleEmptyState, "Look up a gesture"],
    ] as const;
    for (const [Component, title] of cases) {
      const { unmount } = renderKit(
        <Component action={<Button>Browse</Button>} />
      );
      expect(screen.getByRole("heading", { name: title })).toBeDefined();
      expect(screen.getByRole("button", { name: "Browse" })).toBeDefined();
      unmount();
    }
  });
});
