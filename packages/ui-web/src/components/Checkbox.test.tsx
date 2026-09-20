import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";
import { Label } from "./Label";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Checkbox", () => {
  it("renders a checkbox", () => {
    render(<Checkbox />);
    expect(screen.getByRole("checkbox")).toBeDefined();
  });

  it("defaults to the medium size", () => {
    render(<Checkbox />);
    expect(classesOf(screen.getByRole("checkbox"))).toContain("size-5");
  });

  it("applies the requested size instead of the default", () => {
    render(<Checkbox size="sm" />);
    const classes = classesOf(screen.getByRole("checkbox"));
    expect(classes).toContain("size-4");
    expect(classes).not.toContain("size-5");
  });

  it("lets className override a base class", () => {
    render(<Checkbox className="bg-red-500" />);
    const classes = classesOf(screen.getByRole("checkbox"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface");
  });

  it("keeps the base's non-conflicting classes when className is given", () => {
    render(<Checkbox className="bg-red-500" />);
    expect(classesOf(screen.getByRole("checkbox"))).toContain("shrink-0");
  });

  it("delimits itself with the functional border, not the decorative one", () => {
    render(<Checkbox />);
    const classes = classesOf(screen.getByRole("checkbox"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("forwards a ref to the underlying button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Checkbox ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Checkbox data-testid="akkoord" />);
    expect(screen.getByTestId("akkoord").getAttribute("role")).toBe("checkbox");
  });

  it("reflects disabled", () => {
    render(<Checkbox disabled />);
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", true);
  });

  it("is not disabled by default", () => {
    render(<Checkbox />);
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", false);
  });

  it("is named by a Label that points at its id", () => {
    render(
      <>
        <Label htmlFor="akkoord">Akkoord</Label>
        <Checkbox id="akkoord" />
      </>
    );
    expect(screen.getByLabelText("Akkoord")).toBe(
      screen.getByRole("checkbox") as HTMLElement
    );
  });

  it("toggles when clicked", () => {
    render(<Checkbox />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
  });

  it("does not toggle when disabled", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox disabled onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("reports its new state to onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("shows the check mark only once it is checked", () => {
    render(<Checkbox defaultChecked />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.querySelector("svg")).not.toBeNull();
  });

  it("renders no indicator while it is unchecked", () => {
    render(<Checkbox />);
    expect(screen.getByRole("checkbox").querySelector("svg")).toBeNull();
  });

  /*
   * A "select all" checkbox over a partly selected list is `mixed`, and
   * `mixed` must not render a tick — a tick says "all of them".
   */
  it("announces an indeterminate checkbox as mixed", () => {
    render(<Checkbox checked="indeterminate" />);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe(
      "mixed"
    );
  });

  it("hides the tick and shows the dash while indeterminate", () => {
    render(<Checkbox checked="indeterminate" />);
    const indicator = screen.getByRole("checkbox").firstElementChild;
    const hidden = indicator?.querySelector('[data-icon="check"]');
    const shown = indicator?.querySelector('[data-icon="indeterminate"]');
    expect(classesOf(hidden as Element)).toContain(
      "group-data-[state=indeterminate]/indicator:hidden"
    );
    expect(classesOf(shown as Element)).toContain(
      "group-data-[state=checked]/indicator:hidden"
    );
  });

  it("hides its icons from assistive technology", () => {
    render(<Checkbox defaultChecked />);
    for (const icon of screen.getByRole("checkbox").querySelectorAll("svg")) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
