import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("EmptyState", () => {
  it("renders its title as a heading", () => {
    render(<EmptyState title="Geen gebaren gevonden" />);
    expect(
      screen.getByRole("heading", { name: "Geen gebaren gevonden" })
    ).toBeDefined();
  });

  it("renders its description", () => {
    render(
      <EmptyState
        description="Pas je filters aan of zoek op een andere term."
        title="Geen gebaren gevonden"
      />
    );
    expect(
      screen.getByText("Pas je filters aan of zoek op een andere term.")
    ).toBeDefined();
  });

  it("renders no description when there is none", () => {
    render(<EmptyState data-testid="leeg" title="Geen gebaren gevonden" />);
    expect(screen.getByTestId("leeg").querySelector("p")).toBeNull();
  });

  it("renders its action", () => {
    render(
      <EmptyState
        action={<Button>Filters wissen</Button>}
        title="Geen gebaren gevonden"
      />
    );
    expect(
      screen.getByRole("button", { name: "Filters wissen" })
    ).toBeDefined();
  });

  it("renders no action slot when there is no action", () => {
    render(<EmptyState data-testid="leeg" title="Geen gebaren gevonden" />);
    expect(screen.getByTestId("leeg").querySelector("div")).toBeNull();
  });

  /*
   * The usual way into an empty state is a filter that has just emptied the
   * list, which is a change a keyboard user never sees. `role="status"` is
   * what makes it audible.
   */
  it("announces itself as a status", () => {
    render(<EmptyState title="Geen gebaren gevonden" />);
    // `status` takes its name from the author, never from its contents, so
    // the assertion reads the text back rather than querying by name.
    expect(screen.getByRole("status").textContent).toBe(
      "Geen gebaren gevonden"
    );
  });

  it("hides a decorative icon from assistive technology", () => {
    render(
      <EmptyState
        data-testid="leeg"
        icon={<svg aria-label="niet lezen" role="img" />}
        title="Geen gebaren gevonden"
      />
    );
    const wrapper = screen.getByTestId("leeg").querySelector("span");
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("lets className override a base class", () => {
    render(
      <EmptyState className="p-4" data-testid="leeg" title="Niets hier" />
    );
    const classes = classesOf(screen.getByTestId("leeg"));
    expect(classes).toContain("p-4");
    expect(classes).not.toContain("p-12");
  });

  it("outlines itself with the decorative border", () => {
    render(<EmptyState data-testid="leeg" title="Niets hier" />);
    const classes = classesOf(screen.getByTestId("leeg"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  it("forwards a ref to the element", () => {
    const ref = createRef<HTMLDivElement>();
    render(<EmptyState ref={ref} title="Niets hier" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<EmptyState data-testid="leeg" lang="nl" title="Niets hier" />);
    expect(screen.getByTestId("leeg").getAttribute("lang")).toBe("nl");
  });
});
