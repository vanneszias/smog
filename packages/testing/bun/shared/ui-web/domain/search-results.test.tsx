import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Button } from "../../../../../ui-web/src/components/button";
import {
  FavoritesEmptyState,
  ListItemsEmptyState,
  ListsEmptyState,
  NoResultsEmptyState,
  SearchIdleEmptyState,
} from "../../../../../ui-web/src/domain/empty-states";
import { SearchResults } from "../../../../../ui-web/src/domain/search-results";
import type { GestureCardData } from "../../../../../ui-web/src/domain/types";
import { EAT, HELLO } from "../../../../support/ui-web/gestures";
import { renderKit } from "../../../../support/ui-web/render";

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
    // Announced too: the empty state does not take the focus.
    expect(screen.getByRole("status").textContent).toBe("No gestures found");
  });

  test("empty: without an action, onClearSearch gives the way out", async () => {
    const onClearSearch = mock();
    renderKit(
      <SearchResults
        items={[]}
        onClearSearch={onClearSearch}
        onRetry={noop}
        state="empty"
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Clear the search" })
    );
    expect(onClearSearch).toHaveBeenCalledTimes(1);
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

  test("each hand keeps its meaning: the open palm for nothing yet, pointing across for search", () => {
    const cases = [
      [FavoritesEmptyState, "2"],
      [ListsEmptyState, "2"],
      [ListItemsEmptyState, "2"],
      [NoResultsEmptyState, "1"],
      [SearchIdleEmptyState, "1"],
    ] as const;
    for (const [Component, hand] of cases) {
      const { container, unmount } = renderKit(<Component />);
      expect(
        container
          .querySelector('[data-slot="empty-illustration"]')
          ?.getAttribute("data-hand")
      ).toBe(hand);
      unmount();
    }
  });

  test("no results is never a dead end: clear the search, and near matches when there are some", async () => {
    const onClear = mock();
    renderKit(
      <NoResultsEmptyState
        onClear={onClear}
        suggestions={[
          { href: "/gestures/hond", name: "Hond" },
          { href: "/gestures/hondje", name: "Hondje" },
        ]}
      />
    );
    const near = screen.getByRole("navigation", {
      name: "Did you mean one of these gestures?",
    });
    expect(
      within(near).getByRole("link", { name: "Hond" }).getAttribute("href")
    ).toBe("/gestures/hond");
    await userEvent.click(
      screen.getByRole("button", { name: "Clear the search" })
    );
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
