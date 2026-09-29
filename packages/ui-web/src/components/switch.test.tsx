import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { Switch } from "./switch";

describe("Switch", () => {
  test("is a switch named by its label and toggles", async () => {
    const onCheckedChange = mock();
    renderKit(<Switch label="Analytics" onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole("switch", { name: "Analytics" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(classesOf(control)).toContain("focus-visible:ring-focus-ring");
    expect(classesOf(control)).toContain("after:size-touch");
    await userEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  test("the thumb does not animate under reduced motion", () => {
    const { container } = renderKit(<Switch aria-label="x" checked />);
    const thumb = container.querySelector("[data-slot=switch-thumb]");
    expect(classesOf(thumb)).toContain("motion-reduce:transition-none");
    expect(
      screen.getByRole("switch", { name: "x" }).getAttribute("aria-checked")
    ).toBe("true");
  });
});
