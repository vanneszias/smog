import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>Nieuw</Badge>);
    expect(screen.getByText("Nieuw")).toBeDefined();
  });

  it("defaults to the neutral variant", () => {
    render(<Badge>Nieuw</Badge>);
    const classes = classesOf(screen.getByText("Nieuw"));
    expect(classes).toContain("bg-surface");
    expect(classes).not.toContain("bg-primary");
  });

  /* A badge reflects its variant. */
  it("applies the requested variant instead of the default", () => {
    render(<Badge variant="danger">Verlopen</Badge>);
    const classes = classesOf(screen.getByText("Verlopen"));
    expect(classes).toContain("bg-danger");
    expect(classes).toContain("text-danger-foreground");
    expect(classes).not.toContain("bg-surface");
  });

  it("pairs every status variant with its own foreground", () => {
    const pairs = [
      ["primary", "bg-primary", "text-primary-foreground"],
      ["success", "bg-success", "text-success-foreground"],
      ["warning", "bg-warning", "text-warning-foreground"],
      ["danger", "bg-danger", "text-danger-foreground"],
    ] as const;

    for (const [variant, background, foreground] of pairs) {
      const { unmount } = render(<Badge variant={variant}>Label</Badge>);
      const classes = classesOf(screen.getByText("Label"));
      expect(classes).toContain(background);
      expect(classes).toContain(foreground);
      unmount();
    }
  });

  /*
   * Border roles, same call as `Button`: the neutral badge sits on a tinted
   * surface and its edge is decoration, while the outline badge has nothing
   * else to delimit it and takes the strong border.
   */
  it("edges the neutral variant with the decorative border", () => {
    render(<Badge>Nieuw</Badge>);
    const classes = classesOf(screen.getByText("Nieuw"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border-strong");
  });

  it("edges the outline variant with the strong border", () => {
    render(<Badge variant="outline">Nieuw</Badge>);
    const classes = classesOf(screen.getByText("Nieuw"));
    expect(classes).toContain("border-border-strong");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("defaults to the medium size", () => {
    render(<Badge>Nieuw</Badge>);
    expect(classesOf(screen.getByText("Nieuw"))).toContain("text-sm");
  });

  it("applies the requested size instead of the default", () => {
    render(<Badge size="sm">Nieuw</Badge>);
    const classes = classesOf(screen.getByText("Nieuw"));
    expect(classes).toContain("text-xs");
    expect(classes).not.toContain("text-sm");
  });

  it("lets className override a variant class", () => {
    render(<Badge className="bg-red-500">Nieuw</Badge>);
    const classes = classesOf(screen.getByText("Nieuw"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface");
  });

  it("forwards a ref to the element", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Badge ref={ref}>Nieuw</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(
      <Badge data-testid="badge" title="Recent toegevoegd">
        Nieuw
      </Badge>
    );
    expect(screen.getByTestId("badge").getAttribute("title")).toBe(
      "Recent toegevoegd"
    );
  });
});
