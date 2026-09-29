import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  test("is a checkbox named by its label and toggles", async () => {
    const onCheckedChange = mock();
    renderKit(
      <Checkbox label="Remember me" onCheckedChange={onCheckedChange} />
    );
    const box = screen.getByRole("checkbox", { name: "Remember me" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(classesOf(box)).toContain("after:size-touch");
    expect(classesOf(box)).toContain("focus-visible:ring-2");
    await userEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  test("clicking the label toggles it too", async () => {
    const onCheckedChange = mock();
    renderKit(<Checkbox label="Terms" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByText("Terms"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  test("checked uses the primary fill", () => {
    renderKit(<Checkbox checked label="On" />);
    const box = screen.getByRole("checkbox", { name: "On" });
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(classesOf(box)).toContain("data-[state=checked]:bg-primary");
  });
});
