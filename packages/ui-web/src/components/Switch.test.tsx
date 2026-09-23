import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Label } from "./Label";
import { Switch } from "./Switch";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Switch", () => {
  it("renders a switch", () => {
    render(<Switch />);
    expect(screen.getByRole("switch")).toBeDefined();
  });

  it("defaults to the medium size", () => {
    render(<Switch />);
    expect(classesOf(screen.getByRole("switch"))).toContain("w-12");
  });

  it("applies the requested size instead of the default", () => {
    render(<Switch size="sm" />);
    const classes = classesOf(screen.getByRole("switch"));
    expect(classes).toContain("w-10");
    expect(classes).not.toContain("w-12");
  });

  /*
   * The thumb travels the width of the track minus its own width. If the
   * track resizes and the thumb does not, the "on" position lands short of
   * the end or past it, which is the bug you only see in one size.
   */
  it("sizes its thumb from the same size prop as its track", () => {
    render(<Switch size="lg" />);
    const thumb = screen.getByRole("switch").firstElementChild;
    const classes = classesOf(thumb as Element);
    expect(classes).toContain("size-6");
    expect(classes).toContain("data-[state=checked]:translate-x-8");
  });

  it("lets className override a base class", () => {
    render(<Switch className="rounded-none" />);
    const classes = classesOf(screen.getByRole("switch"));
    expect(classes).toContain("rounded-none");
    expect(classes).not.toContain("rounded-full");
  });

  it("keeps the base's non-conflicting classes when className is given", () => {
    render(<Switch className="rounded-none" />);
    expect(classesOf(screen.getByRole("switch"))).toContain("shrink-0");
  });

  it("delimits itself with the functional border, not the decorative one", () => {
    render(<Switch />);
    const classes = classesOf(screen.getByRole("switch"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("forwards a ref to the underlying button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Switch ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Switch data-testid="meldingen" />);
    expect(screen.getByTestId("meldingen").getAttribute("role")).toBe("switch");
  });

  it("reflects disabled", () => {
    render(<Switch disabled />);
    expect(screen.getByRole("switch")).toHaveProperty("disabled", true);
  });

  it("is not disabled by default", () => {
    render(<Switch />);
    expect(screen.getByRole("switch")).toHaveProperty("disabled", false);
  });

  it("is named by a Label that points at its id", () => {
    render(
      <>
        <Label htmlFor="meldingen">Meldingen</Label>
        <Switch id="meldingen" />
      </>
    );
    expect(screen.getByLabelText("Meldingen")).toBe(
      screen.getByRole("switch") as HTMLElement
    );
  });

  it("toggles when clicked", () => {
    render(<Switch />);
    const control = screen.getByRole("switch");
    expect(control.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(control);
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("does not toggle when disabled", () => {
    const onCheckedChange = vi.fn();
    render(<Switch disabled onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("reports its new state to onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
