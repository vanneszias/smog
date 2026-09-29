import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { Chip } from "./chip";

describe("Chip", () => {
  test("is a toggle button with aria-pressed", async () => {
    const onSelectedChange = mock();
    renderKit(
      <Chip onSelectedChange={onSelectedChange} selected={false}>
        Greetings
      </Chip>
    );
    const chip = screen.getByRole("button", { name: "Greetings" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(classesOf(chip)).toContain("rounded-full");
    await userEvent.click(chip);
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });

  test("selected uses the primary tint", () => {
    renderKit(<Chip selected>Food</Chip>);
    const chip = screen.getByRole("button", { name: "Food" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(classesOf(chip)).toContain("bg-primary-subtle");
  });

  test("a removable chip has a labelled remove button", async () => {
    const onRemove = mock();
    renderKit(<Chip onRemove={onRemove}>Food</Chip>);
    await userEvent.click(screen.getByRole("button", { name: "Remove Food" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
