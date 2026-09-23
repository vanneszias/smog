import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { GestureCard, type GestureSummary } from "./GestureCard";

/*
 * Class assertions are made against the split class list, never against a
 * substring of `className`: `"hover:bg-primary/90".includes("bg-primary")` is
 * true, so a substring check reports an override as successful while the
 * variant class is still on the element. `getAttribute("class")` rather than
 * `.className`, because an `<svg>`'s `className` is an `SVGAnimatedString`.
 */
const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

const gesture: GestureSummary = {
  id: "1",
  name: "Hallo",
  categories: [{ id: "c1", name: "Begroetingen" }],
  playbackId: "pb-1",
};

/** The long name from the site's seed fixtures, which exists for this test. */
const LONG_NAME = "Aangenaam kennis met je te maken";

describe("GestureCard", () => {
  it("renders the gesture name", () => {
    render(<GestureCard gesture={gesture} />);
    expect(screen.getByText("Hallo")).toBeDefined();
  });

  it("renders the name as a heading, so a list of cards has an outline", () => {
    render(<GestureCard gesture={gesture} />);
    expect(screen.getByRole("heading", { name: "Hallo" })).toBeDefined();
  });

  it("renders its category names", () => {
    render(<GestureCard gesture={gesture} />);
    expect(screen.getByText("Begroetingen")).toBeDefined();
  });

  it("renders every category, not only the first", () => {
    render(
      <GestureCard
        gesture={{
          ...gesture,
          categories: [
            { id: "c1", name: "Begroetingen" },
            { id: "c2", name: "Familie" },
          ],
        }}
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders no category list when the gesture has none", () => {
    render(<GestureCard gesture={{ ...gesture, categories: [] }} />);
    expect(screen.queryByRole("list")).toBeNull();
  });

  /*
   * An honest note about what these four tests do and do not prove.
   *
   * jsdom computes no layout: `offsetWidth` and `scrollWidth` are always 0, so
   * any assertion comparing them passes whether or not the component clips
   * anything. These tests therefore assert the *mechanism* — that the
   * truncation classes are present, and that they sit on the element that
   * actually holds the text — rather than a measured width. Real overflow
   * behaviour is checked on the kitchen-sink route, with this same long
   * fixture in a narrow column.
   */
  it("clips a long name on the element that holds the text", () => {
    render(<GestureCard gesture={{ ...gesture, name: LONG_NAME }} />);
    const heading = screen.getByRole("heading", { name: LONG_NAME });
    expect(heading.textContent).toBe(LONG_NAME);
    expect(classesOf(heading)).toContain("truncate");
  });

  it("gives the text column a zero min-width so the flex row can clip it", () => {
    render(<GestureCard gesture={{ ...gesture, name: LONG_NAME }} />);
    const column = screen.getByRole("heading", { name: LONG_NAME })
      .parentElement as HTMLElement;
    const classes = classesOf(column);
    expect(classes).toContain("min-w-0");
    expect(classes).toContain("flex-1");
  });

  it("keeps the clipped name inside the card's rounded edge", () => {
    const { container } = render(
      <GestureCard gesture={{ ...gesture, name: LONG_NAME }} />
    );
    expect(classesOf(container.firstElementChild as Element)).toContain(
      "overflow-hidden"
    );
  });

  it("wraps and clips a long category name instead of widening the card", () => {
    render(
      <GestureCard
        gesture={{
          ...gesture,
          categories: [{ id: "c1", name: "Een hele lange categorienaam" }],
        }}
      />
    );
    expect(classesOf(screen.getByRole("list"))).toContain("flex-wrap");
    const badge = screen.getByText("Een hele lange categorienaam");
    const classes = classesOf(badge);
    expect(classes).toContain("truncate");
    expect(classes).toContain("max-w-full");
  });

  it("calls onFavorite with the gesture id", async () => {
    const user = userEvent.setup();
    const onFavorite = vi.fn();
    render(<GestureCard gesture={gesture} onFavorite={onFavorite} />);
    await user.click(screen.getByRole("button", { name: /favoriet/i }));
    expect(onFavorite).toHaveBeenCalledWith("1");
  });

  it("reflects the favorited state for screen readers", () => {
    render(
      <GestureCard
        gesture={gesture}
        isFavorite
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    expect(
      screen
        .getByRole("button", { name: /favoriet/i })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("reports the unfavorited state rather than omitting it", () => {
    render(
      <GestureCard
        gesture={gesture}
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    expect(
      screen
        .getByRole("button", { name: /favoriet/i })
        .getAttribute("aria-pressed")
    ).toBe("false");
  });

  /*
   * A card can sit inside a form — a filter panel, a bulk-edit list — and
   * `Button` sets no default `type`. An HTML button without one submits its
   * form, so favouriting a gesture would submit whatever it is nested in.
   */
  it("makes the favorite control a plain button", () => {
    render(
      <GestureCard
        gesture={gesture}
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  /*
   * This test exists because a mutation survived without it: stripping
   * `fill-current` from the heart left every GestureCard test green, and a
   * favourited gesture then looked exactly like an unfavourited one. Sighted
   * readers get the state from the icon, not from `aria-pressed`.
   */
  it("fills the heart for a favourited gesture, not only aria-pressed", () => {
    const { rerender } = render(
      <GestureCard
        gesture={gesture}
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    const heartOf = () =>
      classesOf(screen.getByRole("button").querySelector("svg") as Element);
    expect(heartOf()).not.toContain("fill-current");
    rerender(
      <GestureCard
        gesture={gesture}
        isFavorite
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    expect(heartOf()).toContain("fill-current");
  });

  it("omits the favorite button when no handler is given", () => {
    render(<GestureCard gesture={gesture} />);
    expect(screen.queryByRole("button", { name: /favoriet/i })).toBeNull();
  });

  it("keeps one accessible name across both favorite states", () => {
    const { rerender } = render(
      <GestureCard
        gesture={gesture}
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    const before = screen.getByRole("button").getAttribute("aria-label");
    rerender(
      <GestureCard
        gesture={gesture}
        isFavorite
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(before);
  });

  it("lets a caller relabel the favorite control", () => {
    render(
      <GestureCard
        favoriteLabel="Bewaren"
        gesture={gesture}
        onFavorite={() => {
          // presence of a handler is what renders the button
        }}
      />
    );
    expect(screen.getByRole("button", { name: "Bewaren" })).toBeDefined();
  });

  /*
   * Navigation by composition. This package must not import a router's Link,
   * so a card that navigates takes a render prop and the consumer supplies the
   * element.
   */
  it("wraps the name in whatever link the caller renders", () => {
    render(
      <GestureCard
        gesture={gesture}
        renderLink={(children) => <a href="/gebaren/1">{children}</a>}
      />
    );
    const link = screen.getByRole("link", { name: "Hallo" });
    expect(link.getAttribute("href")).toBe("/gebaren/1");
    expect(screen.getByRole("heading", { name: "Hallo" }).contains(link)).toBe(
      true
    );
  });

  /*
   * Border roles. A card that navigates is a control and its edge is the only
   * thing saying so, which is the functional `border` role. A card that only
   * displays is decoration, which is `border-subtle`. See the three roles in
   * packages/styles/src/tokens.ts, and `Card`'s `interactive` variant.
   */
  it("delimits a navigable card with the functional border", () => {
    const { container } = render(
      <GestureCard
        gesture={gesture}
        renderLink={(children) => <a href="/gebaren/1">{children}</a>}
      />
    );
    const classes = classesOf(container.firstElementChild as Element);
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("leaves a card with nothing to click on the decorative border", () => {
    const { container } = render(<GestureCard gesture={gesture} />);
    const classes = classesOf(container.firstElementChild as Element);
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  it("shows focus on the card when the name link is focused", () => {
    const { container } = render(
      <GestureCard
        gesture={gesture}
        renderLink={(children) => <a href="/gebaren/1">{children}</a>}
      />
    );
    expect(classesOf(container.firstElementChild as Element)).toContain(
      "focus-within:ring-2"
    );
  });

  it("forwards its ref to the card element", () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<GestureCard gesture={gesture} ref={ref} />);
    expect(ref.current).toBe(container.firstElementChild);
  });

  it("lets className override a base class", () => {
    const { container } = render(
      <GestureCard className="bg-red-500" gesture={gesture} />
    );
    const classes = classesOf(container.firstElementChild as Element);
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface-raised");
  });

  it("spreads unknown props onto the card element", () => {
    const { container } = render(
      <GestureCard data-testid="kaart" gesture={gesture} />
    );
    expect(
      (container.firstElementChild as Element).getAttribute("data-testid")
    ).toBe("kaart");
  });
});
