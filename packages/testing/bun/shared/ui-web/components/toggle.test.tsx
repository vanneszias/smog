import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "../../../../../ui-web/src/components/toggle";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../../../../ui-web/src/components/toggle-group";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("Toggle", () => {
  test("is a pressed/unpressed button, 44 px at md", async () => {
    const onPressedChange = mock();
    renderKit(<Toggle onPressedChange={onPressedChange}>Bold</Toggle>);
    const toggle = screen.getByRole("button", { name: "Bold" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(classesOf(toggle)).toContain("min-h-touch");
    expect(classesOf(toggle)).toContain("focus-visible:ring-ring");
    await userEvent.click(toggle);
    expect(onPressedChange).toHaveBeenCalledWith(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  test("sm keeps a 44 px hit area", () => {
    renderKit(<Toggle size="sm">Italic</Toggle>);
    expect(classesOf(screen.getByRole("button"))).toContain("after:size-touch");
  });
});

describe("ToggleGroup", () => {
  test("single selection moves between items", async () => {
    const onValueChange = mock();
    renderKit(
      <ToggleGroup onValueChange={onValueChange} type="single">
        <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
      </ToggleGroup>
    );
    await userEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onValueChange).toHaveBeenCalledWith("list");
    expect(
      screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")
    ).toBe("true");
  });
});
