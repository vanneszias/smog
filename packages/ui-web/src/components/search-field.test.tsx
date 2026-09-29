import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { SearchField } from "./search-field";

const noop = (): void => undefined;

describe("SearchField", () => {
  test("is a searchbox named Search with the kit placeholder", () => {
    renderKit(<SearchField />);
    const input = screen.getByRole("searchbox", { name: "Search" });
    expect(input.getAttribute("placeholder")).toBe("Search…");
    expect(classesOf(input)).toContain("min-h-touch");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  test("typing reports the value and shows a clear button that empties it", async () => {
    const onValueChange = mock();
    const onClear = mock();
    renderKit(<SearchField onClear={onClear} onValueChange={onValueChange} />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    await userEvent.type(input, "hi");
    expect(onValueChange).toHaveBeenLastCalledWith("hi");
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input.value).toBe("");
    expect(onValueChange).toHaveBeenLastCalledWith("");
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

  test("controlled value", () => {
    renderKit(<SearchField onValueChange={noop} value="hand" />);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "hand"
    );
    expect(screen.getByRole("button", { name: "Clear search" })).toBeDefined();
  });
});
