import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip } from "../../../../../ui-web/src/components/chip";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

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

  test("the action tone makes the selected chip the orange do-it", () => {
    renderKit(
      <>
        <Chip selected tone="action">
          Animals
        </Chip>
        <Chip selected={false} tone="action">
          Food
        </Chip>
      </>
    );
    const on = classesOf(screen.getByRole("button", { name: "Animals" }));
    expect(on).toContain("bg-highlight");
    expect(on).toContain("text-highlight-foreground");
    expect(on).toContain("border-highlight-strong");
    expect(on).not.toContain("bg-primary-subtle");
    const off = classesOf(screen.getByRole("button", { name: "Food" }));
    expect(off).not.toContain("bg-highlight");
  });

  test("a removable chip has a labelled remove button", async () => {
    const onRemove = mock();
    renderKit(<Chip onRemove={onRemove}>Food</Chip>);
    const remove = screen.getByRole("button", { name: "Remove Food" });
    const chip = screen.getByRole("button", { name: "Food" });
    // The remove button comes after the chip, so where their 44 px hit
    // areas overlap the remove button is on top.
    expect(chip.nextElementSibling).toBe(remove);
    expect(classesOf(remove)).toContain("after:size-touch");
    expect(classesOf(remove)).toContain("absolute");
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
