import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Label } from "./Label";
import { Textarea } from "./Textarea";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Textarea", () => {
  it("renders a textbox", () => {
    render(<Textarea />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("defaults to the medium size", () => {
    render(<Textarea />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("min-h-20");
  });

  it("applies the requested size instead of the default", () => {
    render(<Textarea size="sm" />);
    const classes = classesOf(screen.getByRole("textbox"));
    expect(classes).toContain("min-h-16");
    expect(classes).not.toContain("min-h-20");
  });

  /*
   * A textarea grows; a fixed height would clip what the user typed. The size
   * variant must set a minimum, never a height.
   */
  it("sets a minimum height rather than a fixed one", () => {
    render(<Textarea />);
    const classes = classesOf(screen.getByRole("textbox"));
    expect(classes.filter((name) => /^h-\d/.test(name))).toEqual([]);
  });

  it("lets className override a base class", () => {
    render(<Textarea className="bg-red-500" />);
    const classes = classesOf(screen.getByRole("textbox"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface");
  });

  it("keeps the base's non-conflicting classes when className is given", () => {
    render(<Textarea className="bg-red-500" />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("w-full");
  });

  it("delimits itself with the functional border, not the decorative one", () => {
    render(<Textarea />);
    const classes = classesOf(screen.getByRole("textbox"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("forwards a ref to the textarea element", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Textarea data-testid="omschrijving" rows={7} />);
    expect(screen.getByTestId("omschrijving").getAttribute("rows")).toBe("7");
  });

  it("reflects disabled", () => {
    render(<Textarea disabled />);
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
  });

  it("is not disabled by default", () => {
    render(<Textarea />);
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", false);
  });

  it("is named by a Label that points at its id", () => {
    render(
      <>
        <Label htmlFor="omschrijving">Omschrijving</Label>
        <Textarea id="omschrijving" />
      </>
    );
    expect(screen.getByLabelText("Omschrijving")).toBe(
      screen.getByRole("textbox") as HTMLElement
    );
  });

  it("marks itself invalid and takes the danger border", () => {
    render(<Textarea invalid />);
    const textarea = screen.getByRole("textbox");
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(classesOf(textarea)).toContain("border-danger");
  });

  it("is neither invalid nor danger-bordered by default", () => {
    render(<Textarea />);
    const textarea = screen.getByRole("textbox");
    expect(textarea.getAttribute("aria-invalid")).toBeNull();
    expect(classesOf(textarea)).not.toContain("border-danger");
  });

  it("takes the danger border from an aria-invalid set by a wrapper", () => {
    render(<Textarea aria-invalid />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("border-danger");
  });
});
