import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { selectionAsync } from "expo-haptics";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
// biome-ignore lint/performance/noNamespaceImport: the test spies on a Reanimated export
import * as Reanimated from "react-native-reanimated";
import { Button } from "../components/button";
import { EAT, HELLO } from "../test/gestures";
import { renderKit, t } from "../test/render";
import { CategoryChips } from "./category-chips";
import { FavoriteButton } from "./favorite-button";
import { GestureCard } from "./gesture-card";
import { GestureGrid } from "./gesture-grid";
import { GestureRow } from "./gesture-row";
import type { GestureCardData } from "./types";

const noop = (): void => undefined;

describe("GestureCard", () => {
  it("is a button named by the gesture, with its categories as the hint", async () => {
    const onPress = jest.fn();
    await renderKit(<GestureCard gesture={HELLO} onPress={onPress} />);
    const card = screen.getByRole("button", { name: "Hello" });
    expect(card.props.accessibilityHint).toBe("Greetings, Everyday");
    expect(screen.getByText("Greetings, Everyday")).toBeOnTheScreen();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows the Mux still, decorative", async () => {
    await renderKit(<GestureCard gesture={HELLO} testID="card" />);
    const image = screen.getByTestId("card-thumbnail", {
      includeHiddenElements: true,
    });
    expect(image.props.source).toEqual({
      uri: "https://image.mux.com/mux-hello/thumbnail.webp?width=480",
    });
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({
      aspectRatio: 0.75,
    });
  });

  it("the heart is its own toggle beside the card", async () => {
    const onFavoriteToggle = jest.fn();
    await renderKit(
      <GestureCard
        favorite={false}
        gesture={HELLO}
        onFavoriteToggle={onFavoriteToggle}
        onPress={noop}
      />
    );
    const card = screen.getByRole("button", { name: "Hello" });
    const heart = screen.getByRole("togglebutton", {
      name: t("a11y.favorite"),
    });
    expect(within(card).queryByRole("togglebutton")).toBeNull();
    await fireEvent.press(heart);
    expect(onFavoriteToggle).toHaveBeenCalledWith(true);
  });

  it("the sponsored badge; no button without onPress", async () => {
    await renderKit(<GestureCard gesture={HELLO} sponsored />);
    expect(screen.getByText(t("gesture.sponsored"))).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("togglebutton")).toBeNull();
  });
});

describe("GestureRow", () => {
  it("drag handle first, then the row button, the trailing slot and the heart", async () => {
    const onPress = jest.fn();
    await renderKit(
      <GestureRow
        dragHandle={<Button>Drag</Button>}
        favorite
        gesture={EAT}
        onFavoriteToggle={noop}
        onPress={onPress}
        trailing={<Button>More</Button>}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.props.accessibilityLabel ?? "")).toEqual([
      "",
      "Eat",
      "",
    ]);
    expect(screen.getByRole("button", { name: "Drag" })).toBeOnTheScreen();
    const heart = screen.getByRole("togglebutton", {
      name: t("a11y.favorite"),
    });
    expect(heart.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole("button", { name: "Eat" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

function nameCard(gesture: GestureCardData): ReactElement {
  return <Button>{gesture.name}</Button>;
}

describe("GestureGrid", () => {
  it("renders every item in two columns, padding the last row", async () => {
    await renderKit(
      <GestureGrid
        items={[HELLO, EAT, { ...EAT, id: "g3", name: "Drink" }]}
        renderItem={nameCard}
        scrollEnabled={false}
        testID="grid"
      />
    );
    expect(screen.getByRole("button", { name: "Hello" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Drink" })).toBeOnTheScreen();
    expect(screen.getAllByTestId("grid-filler")).toHaveLength(1);
  });

  it("defaults to GestureCards", async () => {
    await renderKit(<GestureGrid items={[HELLO]} scrollEnabled={false} />);
    expect(screen.getByText("Hello")).toBeOnTheScreen();
  });
});

describe("FavoriteButton", () => {
  it("a toggle named Favorite that ticks and reports the next state", async () => {
    const onToggle = jest.fn();
    await renderKit(<FavoriteButton active={false} onToggle={onToggle} />);
    const heart = screen.getByRole("togglebutton", {
      name: t("a11y.favorite"),
    });
    expect(heart.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(heart);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("pops when switched on, not off and not under reduced motion", async () => {
    const sequence = jest.spyOn(Reanimated, "withSequence");
    const { rerender } = await renderKit(
      <FavoriteButton active={false} onToggle={noop} />
    );
    await fireEvent.press(screen.getByRole("togglebutton"));
    expect(sequence).toHaveBeenCalledTimes(1);
    await rerender(<FavoriteButton active onToggle={noop} />);
    await fireEvent.press(screen.getByRole("togglebutton"));
    expect(sequence).toHaveBeenCalledTimes(1);
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true);
    try {
      await rerender(<FavoriteButton active={false} onToggle={noop} />);
      await fireEvent.press(screen.getByRole("togglebutton"));
      expect(sequence).toHaveBeenCalledTimes(1);
    } finally {
      jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false);
    }
  });

  it("keeps a 44 pt target at sm and takes a custom label", async () => {
    await renderKit(
      <FavoriteButton active label="Favorite Hello" onToggle={noop} size="sm" />
    );
    const heart = screen.getByRole("togglebutton", { name: "Favorite Hello" });
    expect(heart.props.hitSlop).toBe(6);
  });
});

const CATEGORIES = [
  { name: "Greetings", slug: "greetings" },
  { name: "Food", slug: "food" },
  { name: "Feelings", slug: "feelings" },
];

describe("CategoryChips", () => {
  it("All is on when nothing is selected; toggling keeps category order", async () => {
    const onChange = jest.fn();
    await renderKit(
      <CategoryChips
        categories={CATEGORIES}
        onChange={onChange}
        selected={["feelings"]}
      />
    );
    expect(screen.getByLabelText(t("search.categories"))).toBeOnTheScreen();
    const all = screen.getByRole("togglebutton", {
      name: t("search.allCategories"),
    });
    expect(all.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(
      screen.getByRole("togglebutton", { name: "Greetings" })
    );
    expect(onChange).toHaveBeenLastCalledWith(["greetings", "feelings"]);
    await fireEvent.press(
      screen.getByRole("togglebutton", { name: "Feelings" })
    );
    expect(onChange).toHaveBeenLastCalledWith([]);
    await fireEvent.press(all);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("showAll={false} hides All", async () => {
    await renderKit(
      <CategoryChips
        categories={CATEGORIES}
        onChange={noop}
        selected={[]}
        showAll={false}
      />
    );
    expect(
      screen.queryByRole("togglebutton", { name: t("search.allCategories") })
    ).toBeNull();
    expect(screen.getAllByRole("togglebutton")).toHaveLength(3);
  });
});
