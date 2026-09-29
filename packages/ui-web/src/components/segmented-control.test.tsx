import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { label: "Grid", value: "grid" },
  { label: "List", value: "list" },
];

describe("SegmentedControl", () => {
  test("is a labelled radiogroup; the selected segment is checked", async () => {
    const onValueChange = mock();
    renderKit(
      <SegmentedControl
        aria-label="View"
        onValueChange={onValueChange}
        options={OPTIONS}
        value="grid"
      />
    );
    expect(screen.getByRole("radiogroup", { name: "View" })).toBeDefined();
    const grid = screen.getByRole("radio", { name: "Grid" });
    expect(grid.getAttribute("aria-checked")).toBe("true");
    expect(classesOf(grid)).toContain("min-h-touch");
    expect(classesOf(grid)).toContain("data-[state=on]:bg-surface");
    await userEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onValueChange).toHaveBeenCalledWith("list");
  });

  test("clicking the selected segment keeps a value", async () => {
    const onValueChange = mock();
    renderKit(
      <SegmentedControl
        aria-label="View"
        onValueChange={onValueChange}
        options={OPTIONS}
        size="sm"
        value="grid"
      />
    );
    await userEvent.click(screen.getByRole("radio", { name: "Grid" }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(classesOf(screen.getByRole("radio", { name: "Grid" }))).toContain(
      "after:h-touch"
    );
    // Vertical-only: neighbours 4 px apart must not share a hit area.
    expect(
      classesOf(screen.getByRole("radio", { name: "Grid" }))
    ).not.toContain("after:size-touch");
  });
});
