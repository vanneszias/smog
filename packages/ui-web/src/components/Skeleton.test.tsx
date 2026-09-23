import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Skeleton", () => {
  it("renders an element", () => {
    render(<Skeleton data-testid="skelet" />);
    expect(screen.getByTestId("skelet")).toBeDefined();
  });

  /*
   * The behavioural contract. A pulsing rectangle has nothing
   * to announce, and a list of twelve of them turns into twelve blank groups
   * in a screen reader.
   */
  it("hides itself from assistive technology", () => {
    render(<Skeleton data-testid="skelet" />);
    expect(screen.getByTestId("skelet").getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  /*
   * Props are spread last, so a caller who has a reason to expose one can.
   * A component that cannot be overridden gets reimplemented by the first
   * person who needs it different.
   */
  it("lets a caller expose it again", () => {
    render(<Skeleton aria-hidden={false} data-testid="skelet" />);
    expect(screen.getByTestId("skelet").getAttribute("aria-hidden")).toBe(
      "false"
    );
  });

  it("animates by default", () => {
    render(<Skeleton data-testid="skelet" />);
    expect(classesOf(screen.getByTestId("skelet"))).toContain("animate-pulse");
  });

  /*
   * `surfaceRaised` *is* white in the light theme, so a skeleton painted with
   * it is invisible on the page it is standing in for. Pinned by name, because
   * swapping the token is a one-word change that nothing else in this file
   * notices. (It survived as a mutation until this test existed.)
   */
  it("paints itself in a colour that shows up in both themes", () => {
    render(<Skeleton data-testid="skelet" />);
    const classes = classesOf(screen.getByTestId("skelet"));
    expect(classes).toContain("bg-border-subtle");
    expect(classes).not.toContain("bg-surface-raised");
  });

  it("lets className override a base class", () => {
    render(<Skeleton className="bg-red-500" data-testid="skelet" />);
    const classes = classesOf(screen.getByTestId("skelet"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-border-subtle");
  });

  it("keeps the non-conflicting base classes when className is given", () => {
    render(<Skeleton className="bg-red-500" data-testid="skelet" />);
    expect(classesOf(screen.getByTestId("skelet"))).toContain("animate-pulse");
  });

  it("forwards a ref to the element", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Skeleton ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Skeleton data-testid="skelet" style={{ height: 24 }} />);
    expect(screen.getByTestId("skelet").getAttribute("style")).toContain(
      "height"
    );
  });
});
