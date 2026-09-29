import { describe, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { FavoriteButton } from "./favorite-button";

const noop = (): void => undefined;

describe("FavoriteButton", () => {
  test("a toggle named Favorite with aria-pressed", async () => {
    const onToggle = mock();
    renderKit(<FavoriteButton active={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Favorite" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(classesOf(button)).toContain("size-touch");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  test("active fills the heart and toggles off", async () => {
    const onToggle = mock();
    const { container } = renderKit(
      <FavoriteButton active onToggle={onToggle} size="lg" />
    );
    const button = screen.getByRole("button", { name: "Favorite" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(classesOf(button)).toContain("size-12");
    expect(classesOf(container.querySelector("svg"))).toContain("fill-current");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  test("pops when switched on, not under reduced motion, and settles", async () => {
    const { container, rerender } = renderKit(
      <FavoriteButton active={false} onToggle={noop} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Favorite" }));
    const icon = container.querySelector("[data-slot=favorite-icon]");
    expect(classesOf(icon)).toContain("animate-favorite-pop");
    expect(classesOf(icon)).toContain("motion-reduce:animate-none");
    if (icon) {
      fireEvent.animationEnd(icon);
    }
    expect(classesOf(icon)).not.toContain("animate-favorite-pop");
    rerender(<FavoriteButton active onToggle={noop} />);
    // Switching off does not pop.
    await userEvent.click(screen.getByRole("button", { name: "Favorite" }));
    expect(classesOf(icon)).not.toContain("animate-favorite-pop");
  });

  test("a custom label and the overlay variant", () => {
    renderKit(
      <FavoriteButton
        active={false}
        label="Favorite Hello"
        onToggle={noop}
        variant="overlay"
      />
    );
    const button = screen.getByRole("button", { name: "Favorite Hello" });
    expect(classesOf(button)).toContain("bg-surface");
  });
});
