import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";
import { Label } from "./Label";

/*
 * Class assertions are made against the token list, never the joined string.
 * `"focus-visible:ring-ring".includes("ring-ring")` and
 * `"border-border-subtle".includes("border-border")` are both true, so a
 * substring check reports an override that did not happen.
 */
const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Input", () => {
  it("renders a textbox", () => {
    render(<Input />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("defaults to the medium size", () => {
    render(<Input />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("h-10");
  });

  it("applies the requested size instead of the default", () => {
    render(<Input size="sm" />);
    const classes = classesOf(screen.getByRole("textbox"));
    expect(classes).toContain("h-8");
    expect(classes).not.toContain("h-10");
  });

  it("lets className override a base class", () => {
    render(<Input className="bg-red-500" />);
    const classes = classesOf(screen.getByRole("textbox"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface");
  });

  it("keeps the base's non-conflicting classes when className is given", () => {
    render(<Input className="bg-red-500" />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("w-full");
  });

  /*
   * An input's edge delimits an interactive control, so it takes the
   * functional `border` role (3:1, tested in packages/styles). The decorative
   * `borderSubtle` is deliberately below 3:1 and has no business here.
   */
  it("delimits itself with the functional border, not the decorative one", () => {
    render(<Input />);
    const classes = classesOf(screen.getByRole("textbox"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("forwards a ref to the input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Input data-testid="naam" placeholder="Naam" />);
    expect(screen.getByTestId("naam").getAttribute("placeholder")).toBe("Naam");
  });

  it("reflects disabled", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
  });

  it("is not disabled by default", () => {
    render(<Input />);
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", false);
  });

  it("is named by a Label that points at its id", () => {
    render(
      <>
        <Label htmlFor="naam">Naam</Label>
        <Input id="naam" />
      </>
    );
    expect(screen.getByLabelText("Naam")).toBe(
      screen.getByRole("textbox") as HTMLElement
    );
  });

  it("marks itself invalid and takes the danger border", () => {
    render(<Input invalid />);
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(classesOf(input)).toContain("border-danger");
  });

  it("is neither invalid nor danger-bordered by default", () => {
    render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(classesOf(input)).not.toContain("border-danger");
  });

  /*
   * Field wires `aria-invalid` onto whatever control it wraps; it does not
   * know about this component's `invalid` variant. Without this the error
   * state is announced but invisible.
   */
  it("takes the danger border from an aria-invalid set by a wrapper", () => {
    render(<Input aria-invalid />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("border-danger");
  });

  /*
   * `aria-invalid` is a string attribute, so it arrives as `"true"` from
   * anything that spread it out of serialised props rather than writing the
   * JSX boolean. Both forms mean invalid; `"false"` does not.
   */
  it("reads the string form of aria-invalid the same way", () => {
    render(<Input aria-invalid="true" />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("border-danger");
  });

  it('treats aria-invalid="false" as valid', () => {
    render(<Input aria-invalid="false" />);
    expect(classesOf(screen.getByRole("textbox"))).not.toContain(
      "border-danger"
    );
  });
});
