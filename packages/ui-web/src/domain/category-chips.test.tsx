import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import { CategoryChips } from "./category-chips";

const noop = (): void => undefined;

const CATEGORIES = [
  { name: "Greetings", slug: "greetings" },
  { name: "Food", slug: "food" },
  { name: "Feelings", slug: "feelings" },
];

describe("CategoryChips", () => {
  test("a labelled group of toggles; All is pressed when nothing is selected", () => {
    renderKit(
      <CategoryChips categories={CATEGORIES} onChange={noop} selected={[]} />
    );
    const group = screen.getByRole("group", { name: "Categories" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "All",
      "Greetings",
      "Food",
      "Feelings",
    ]);
    expect(chips[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(chips[1]?.getAttribute("aria-pressed")).toBe("false");
  });

  test("toggling adds and removes slugs in category order", async () => {
    const onChange = mock();
    renderKit(
      <CategoryChips
        categories={CATEGORIES}
        onChange={onChange}
        selected={["feelings"]}
      />
    );
    expect(
      screen
        .getByRole("button", { name: "Feelings" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Greetings" }));
    expect(onChange).toHaveBeenLastCalledWith(["greetings", "feelings"]);
    await userEvent.click(screen.getByRole("button", { name: "Feelings" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test("showAll={false} hides the All chip; a custom label", () => {
    renderKit(
      <CategoryChips
        aria-label="Filter"
        categories={CATEGORIES}
        onChange={noop}
        selected={[]}
        showAll={false}
      />
    );
    const group = screen.getByRole("group", { name: "Filter" });
    expect(within(group).queryByRole("button", { name: "All" })).toBeNull();
  });
});
