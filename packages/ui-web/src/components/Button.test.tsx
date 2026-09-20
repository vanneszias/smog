import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

/*
 * Class assertions here are made against the token list, never against the
 * joined string. `"...hover:bg-primary/90".includes("bg-primary")` is true, so
 * a substring check would call an override successful while the variant class
 * is still on the element.
 */
const classesOf = (element: Element): string[] =>
  element.className.split(" ").filter(Boolean);

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Opslaan</Button>);
    expect(screen.getByRole("button", { name: "Opslaan" })).toBeDefined();
  });

  it("defaults to the primary variant", () => {
    render(<Button>Opslaan</Button>);
    expect(classesOf(screen.getByRole("button"))).toContain("bg-primary");
  });

  it("applies the requested variant instead of the default", () => {
    render(<Button variant="danger">Verwijderen</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("bg-danger");
    expect(classes).not.toContain("bg-primary");
  });

  it("defaults to the medium size", () => {
    render(<Button>Opslaan</Button>);
    expect(classesOf(screen.getByRole("button"))).toContain("h-10");
  });

  it("applies the requested size instead of the default", () => {
    render(<Button size="sm">Opslaan</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("h-8");
    expect(classes).not.toContain("h-10");
  });

  it("lets className override a variant class", () => {
    render(<Button className="bg-red-500">Opslaan</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-primary");
  });

  it("lets className override the variant's hover class too", () => {
    render(<Button className="bg-red-500 hover:bg-red-600">Opslaan</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("hover:bg-red-600");
    expect(classes).not.toContain("hover:bg-primary/90");
  });

  it("keeps the variant's non-conflicting classes when className is given", () => {
    render(<Button className="bg-red-500">Opslaan</Button>);
    expect(classesOf(screen.getByRole("button"))).toContain(
      "text-primary-foreground"
    );
  });

  /*
   * Borders carry meaning here: these two variants have nothing but their edge
   * to say where the control is, so they take the functional `border` role
   * (3:1 against both background and surface), never the decorative
   * `borderSubtle`. See the rule in packages/styles/src/tokens.ts.
   */
  it("delimits the secondary variant with a functional border", () => {
    render(<Button variant="secondary">Opslaan</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("delimits the outline variant with the strong border", () => {
    render(<Button variant="outline">Opslaan</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("border-border-strong");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("forwards a ref to the button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Opslaan</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(
      <Button aria-keyshortcuts="Control+S" data-testid="save">
        Opslaan
      </Button>
    );
    const button = screen.getByTestId("save");
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+S");
  });

  /*
   * Props are spread last, so a caller can override anything this component
   * sets for itself. A component that cannot be overridden gets reimplemented
   * by the first person who needs it different.
   */
  it("lets a caller override a prop the component sets itself", () => {
    render(<Button aria-busy="true">Opslaan</Button>);
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Opslaan
      </Button>
    );
    screen.getByRole("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("marks itself busy and disabled while loading", () => {
    render(<Button loading>Opslaan</Button>);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button).toHaveProperty("disabled", true);
  });

  it("does not fire onClick while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Opslaan
      </Button>
    );
    screen.getByRole("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is neither busy nor disabled when it is not loading", () => {
    render(<Button>Opslaan</Button>);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button).toHaveProperty("disabled", false);
  });

  it("hides the loading spinner from assistive technology", () => {
    render(<Button loading>Opslaan</Button>);
    const button = screen.getByRole("button");
    const spinner = button.querySelector("svg");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(button.textContent).toBe("Opslaan");
  });

  it("renders no spinner when it is not loading", () => {
    render(<Button>Opslaan</Button>);
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
  });

  it("renders as a child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/gebaren">Gebaren</a>
      </Button>
    );
    expect(screen.getByRole("link", { name: "Gebaren" })).toBeDefined();
  });

  it("passes its variant classes to the child element", () => {
    render(
      <Button asChild className="bg-red-500">
        <a href="/gebaren">Gebaren</a>
      </Button>
    );
    const classes = classesOf(screen.getByRole("link"));
    expect(classes).toContain("inline-flex");
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-primary");
  });

  it("keeps the child as the single slotted element while loading", () => {
    render(
      <Button asChild loading>
        <a href="/gebaren">Gebaren</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Gebaren" });
    expect(link.querySelector("svg")).not.toBeNull();
  });
});
