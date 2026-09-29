import { describe, expect, it, jest } from "@jest/globals";
import type { TranslationKey } from "@smog/i18n";
import { fireEvent, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Button } from "../components/button";
import { EAT, HELLO } from "../test/gestures";
import { renderKit, t } from "../test/render";
import {
  type DomainEmptyStateProps,
  FavoritesEmptyState,
  ListItemsEmptyState,
  ListsEmptyState,
  NoResultsEmptyState,
  SearchIdleEmptyState,
} from "./empty-states";
import { SearchResults } from "./search-results";

const noop = (): void => undefined;

describe("SearchResults", () => {
  it("results: a polite count and the grid", async () => {
    await renderKit(
      <SearchResults
        items={[HELLO, EAT]}
        onRetry={noop}
        scrollEnabled={false}
        state="results"
      />
    );
    const count = screen.getByText(t("search.resultCount", { count: 2 }));
    expect(count.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByText("Hello")).toBeOnTheScreen();
    expect(screen.getByText("Eat")).toBeOnTheScreen();
  });

  it("loading: skeletons, busy", async () => {
    await renderKit(
      <SearchResults items={[]} onRetry={noop} state="loading" testID="r" />
    );
    expect(screen.getByTestId("r").props.accessibilityState).toMatchObject({
      busy: true,
    });
    expect(
      screen.getAllByTestId("search-skeleton", { includeHiddenElements: true })
        .length
    ).toBeGreaterThan(0);
  });

  it("empty, error and idle", async () => {
    const onRetry = jest.fn();
    const { rerender } = await renderKit(
      <SearchResults
        emptyAction={<Button>Clear</Button>}
        items={[]}
        onRetry={onRetry}
        state="empty"
      />
    );
    expect(
      screen.getByRole("header", { name: t("search.noResults.title") })
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Clear" })).toBeOnTheScreen();
    await rerender(
      <SearchResults items={[]} onRetry={onRetry} state="error" />
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("states.retry") })
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    await rerender(<SearchResults items={[]} onRetry={onRetry} state="idle" />);
    expect(
      screen.getByRole("header", { name: t("search.idle.title") })
    ).toBeOnTheScreen();
  });
});

describe("empty states", () => {
  it.each<[(props: DomainEmptyStateProps) => ReactElement, TranslationKey]>([
    [FavoritesEmptyState, "favorites.empty.title"],
    [ListsEmptyState, "lists.empty.title"],
    [ListItemsEmptyState, "lists.emptyList.title"],
    [NoResultsEmptyState, "search.noResults.title"],
    [SearchIdleEmptyState, "search.idle.title"],
  ])("%p has its copy and the next action", async (Component, key) => {
    await renderKit(<Component action={<Button>Browse</Button>} />);
    expect(screen.getByRole("header", { name: t(key) })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Browse" })).toBeOnTheScreen();
  });
});
