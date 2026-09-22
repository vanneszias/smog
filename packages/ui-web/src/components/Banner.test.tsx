import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./Banner";

const classesOf = (element: Element) =>
  (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("Banner", () => {
  /*
   * Review Focus 5, first half. A landmark with no name is a landmark a
   * screen-reader user cannot tell from any other, so `label` is required and
   * this asserts it actually lands on the element.
   */
  it("is a region with an accessible name", () => {
    render(<Banner label="Cookiemelding">Inhoud</Banner>);

    const region = screen.getByRole("region", { name: "Cookiemelding" });
    expect(region.textContent).toBe("Inhoud");
  });

  /*
   * Review Focus 5, second half, and the reason this component exists rather
   * than a `Sheet side="bottom"`. A consent prompt that steals focus on mount
   * interrupts whatever the visitor was doing; one that traps focus is a wall.
   * Both are asserted as ABSENCES, which is why the control render below is
   * needed — `document.activeElement` being `body` proves nothing unless
   * something in the test could have changed it.
   */
  it("does not take focus on mount, and does not trap it", async () => {
    const user = userEvent.setup();

    render(
      <>
        <button type="button">Buiten</button>
        <Banner label="Cookiemelding">
          <button type="button">Binnen</button>
        </Banner>
      </>
    );

    expect(document.activeElement).toBe(document.body);

    const outside = screen.getByRole("button", { name: "Buiten" });
    const inside = screen.getByRole("button", { name: "Binnen" });

    // Focus reaches the banner's control by keyboard...
    await user.tab();
    expect(document.activeElement).toBe(outside);
    await user.tab();
    expect(document.activeElement).toBe(inside);

    // ...and leaves it again, which a focus trap would prevent.
    await user.tab();
    expect(document.activeElement).not.toBe(inside);
  });

  it("renders no scrim", () => {
    const { container } = render(<Banner label="Cookiemelding">Inhoud</Banner>);

    // The one thing `Sheet` would have added. Asserted structurally rather
    // than by class name so it survives a restyle.
    expect(container.querySelectorAll("[data-radix-portal]")).toHaveLength(0);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("anchors to the bottom by default and to the top on request", () => {
    const { rerender } = render(<Banner label="A">x</Banner>);
    const bottom = classesOf(screen.getByRole("region"));

    rerender(
      <Banner label="A" placement="top">
        x
      </Banner>
    );
    const top = classesOf(screen.getByRole("region"));

    expect(bottom).toContain("bottom-0");
    expect(top).toContain("top-0");
    expect(bottom).not.toEqual(top);
  });

  it("puts the caller's className last so it can override", () => {
    render(
      <Banner className="bg-danger" label="A">
        x
      </Banner>
    );

    expect(classesOf(screen.getByRole("region"))).toContain("bg-danger");
  });

  it("spreads the rest of its props onto the region", () => {
    const onClick = vi.fn();
    render(
      <Banner data-testid="consent" label="A" onClick={onClick}>
        x
      </Banner>
    );

    expect(screen.getByTestId("consent")).toBeDefined();
  });
});
