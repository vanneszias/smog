import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GestureSummary } from "./GestureCard";
import { GestureGrid } from "./GestureGrid";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

const gestures: GestureSummary[] = [
  { id: "1", name: "Hallo", categories: [{ id: "c1", name: "Begroetingen" }] },
  { id: "2", name: "Dag", categories: [{ id: "c1", name: "Begroetingen" }] },
  { id: "3", name: "Dank je wel", categories: [] },
];

describe("GestureGrid", () => {
  it("renders one card per gesture", () => {
    render(<GestureGrid gestures={gestures} />);
    expect(screen.getAllByRole("heading")).toHaveLength(3);
  });

  it("renders the gestures in the order it was given them", () => {
    render(<GestureGrid gestures={gestures} />);
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Hallo",
      "Dag",
      "Dank je wel",
    ]);
  });

  it("renders an empty state for an empty array", () => {
    render(<GestureGrid emptyTitle="Geen gebaren" gestures={[]} />);
    expect(screen.getByRole("status").textContent).toContain("Geen gebaren");
  });

  it("renders no empty state when there are gestures", () => {
    render(<GestureGrid gestures={gestures} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders skeletons while loading", () => {
    render(<GestureGrid gestures={[]} loading skeletonCount={4} />);
    const placeholder = screen.getByRole("status");
    expect(placeholder.getAttribute("aria-busy")).toBe("true");
    expect(placeholder.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  /*
   * Added after a mutation survived: dropping the default placeholder count
   * to one left every test green, and a three-column grid that loads with a
   * single block reads as a finished list with one result in it.
   */
  it("fills the grid with placeholders when no count is given", () => {
    render(<GestureGrid gestures={[]} loading />);
    expect(
      screen.getByRole("status").querySelectorAll(".animate-pulse")
    ).toHaveLength(6);
  });

  /*
   * The bug this pins: an empty array during the first load is both "loading"
   * and "empty", and the branch order decides which the reader sees. Telling
   * someone there are no gestures before the request has come back is wrong,
   * so loading wins.
   */
  it("shows skeletons rather than an empty state while loading", () => {
    render(<GestureGrid emptyTitle="Geen gebaren" gestures={[]} loading />);
    expect(screen.queryByText("Geen gebaren")).toBeNull();
    expect(
      screen.getByRole("status").querySelectorAll(".animate-pulse").length
    ).toBeGreaterThan(0);
  });

  it("shows skeletons rather than stale cards while loading", () => {
    render(<GestureGrid gestures={gestures} loading />);
    expect(screen.queryByText("Hallo")).toBeNull();
  });

  it("renders no card list for an empty array", () => {
    render(<GestureGrid gestures={[]} />);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("marks each gesture that is in the favourites list", () => {
    render(
      <GestureGrid
        favoriteIds={["2"]}
        gestures={gestures}
        onFavorite={() => {
          // presence of a handler is what renders the buttons
        }}
      />
    );
    expect(
      screen
        .getAllByRole("button", { name: /favoriet/i })
        .map((button) => button.getAttribute("aria-pressed"))
    ).toEqual(["false", "true", "false"]);
  });

  it("reports which gesture's favourite control was pressed", async () => {
    const user = userEvent.setup();
    const onFavorite = vi.fn();
    render(<GestureGrid gestures={gestures} onFavorite={onFavorite} />);
    await user.click(
      screen.getAllByRole("button", { name: /favoriet/i })[1] as HTMLElement
    );
    expect(onFavorite).toHaveBeenCalledWith("2");
  });

  it("renders no favourite controls without a handler", () => {
    render(<GestureGrid gestures={gestures} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives each card the link the caller renders for that gesture", () => {
    render(
      <GestureGrid
        gestures={gestures}
        renderGestureLink={(gesture, children) => (
          <a href={`/gebaren/${gesture.id}`}>{children}</a>
        )}
      />
    );
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href"))
    ).toEqual(["/gebaren/1", "/gebaren/2", "/gebaren/3"]);
  });

  it("exposes the cards as a list", () => {
    render(<GestureGrid gestures={gestures} />);
    const grid = screen.getByRole("list", { name: "Gebaren" });
    expect(grid.querySelectorAll(":scope > li")).toHaveLength(3);
  });

  it("lets a caller name the list", () => {
    render(<GestureGrid gestures={gestures} label="Favorieten" />);
    expect(screen.getByRole("list", { name: "Favorieten" })).toBeDefined();
  });

  it("lays the cards out in a responsive grid", () => {
    render(<GestureGrid gestures={gestures} />);
    const classes = classesOf(screen.getByRole("list", { name: "Gebaren" }));
    expect(classes).toContain("grid");
    expect(classes).toContain("sm:grid-cols-2");
  });

  it("forwards its ref to the list element", () => {
    const ref = createRef<HTMLUListElement>();
    render(<GestureGrid gestures={gestures} ref={ref} />);
    expect(ref.current).toBe(screen.getByRole("list", { name: "Gebaren" }));
  });

  it("lets className override a base class", () => {
    render(<GestureGrid className="gap-12" gestures={gestures} />);
    const classes = classesOf(screen.getByRole("list", { name: "Gebaren" }));
    expect(classes).toContain("gap-12");
    expect(classes).not.toContain("gap-4");
  });
});
