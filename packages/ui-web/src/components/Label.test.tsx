import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Label } from "./Label";

/*
 * Class assertions are made against the token list, never the joined string:
 * `"text-foreground-muted".includes("text-foreground")` is true, so a
 * substring check would call an override successful while the base class is
 * still on the element.
 */
const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Label", () => {
  it("renders its children", () => {
    render(<Label>Naam</Label>);
    expect(screen.getByText("Naam")).toBeDefined();
  });

  /*
   * The whole point of a label. Queried through the accessible name rather
   * than by comparing a `for` string to an `id` string, because the second
   * passes on markup that no screen reader would ever connect.
   */
  it("names the control it points at", () => {
    render(
      <>
        <Label htmlFor="naam">Naam</Label>
        <input id="naam" />
      </>
    );
    expect(screen.getByLabelText("Naam")).toBe(
      screen.getByRole("textbox") as HTMLElement
    );
  });

  it("lets className override a base class", () => {
    render(<Label className="text-lg">Naam</Label>);
    const classes = classesOf(screen.getByText("Naam"));
    expect(classes).toContain("text-lg");
    expect(classes).not.toContain("text-sm");
  });

  it("keeps the base's non-conflicting classes when className is given", () => {
    render(<Label className="text-lg">Naam</Label>);
    expect(classesOf(screen.getByText("Naam"))).toContain("font-medium");
  });

  it("forwards a ref to the label element", () => {
    const ref = createRef<HTMLLabelElement>();
    render(<Label ref={ref}>Naam</Label>);
    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Label data-testid="naam-label">Naam</Label>);
    expect(screen.getByTestId("naam-label").tagName).toBe("LABEL");
  });
});
