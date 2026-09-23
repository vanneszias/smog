import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { CategoryFilter, type CategoryOption } from "./CategoryFilter";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

const categories: CategoryOption[] = [
  { id: "c1", name: "Begroetingen" },
  { id: "c2", name: "Familie" },
  { id: "c3", name: "Getallen" },
];

describe("CategoryFilter", () => {
  it("renders a toggle per category", () => {
    render(<CategoryFilter categories={categories} onChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("names each toggle after its category", () => {
    render(<CategoryFilter categories={categories} onChange={vi.fn()} />);
    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["Begroetingen", "Familie", "Getallen"]);
  });

  it("renders nothing to press for an empty category list", () => {
    render(<CategoryFilter categories={[]} onChange={vi.fn()} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("reports which categories are selected", () => {
    render(
      <CategoryFilter
        categories={categories}
        onChange={vi.fn()}
        selectedIds={["c2"]}
      />
    );
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-pressed"))
    ).toEqual(["false", "true", "false"]);
  });

  /*
   * The whole contract: the handler is given the next selection, not the
   * category that was pressed. A caller that has to work out the difference
   * is a caller that will get it wrong in one of its two call sites.
   */
  it("adds a pressed category to the selection it was given", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategoryFilter
        categories={categories}
        onChange={onChange}
        selectedIds={["c3"]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Begroetingen" }));
    expect(onChange).toHaveBeenCalledWith(["c1", "c3"]);
  });

  it("removes an already selected category from the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategoryFilter
        categories={categories}
        onChange={onChange}
        selectedIds={["c1", "c3"]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Getallen" }));
    expect(onChange).toHaveBeenCalledWith(["c1"]);
  });

  it("orders the next selection by category, not by when each was pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategoryFilter
        categories={categories}
        onChange={onChange}
        selectedIds={["c3"]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Familie" }));
    expect(onChange).toHaveBeenCalledWith(["c2", "c3"]);
  });

  /*
   * A component that sorts or splices the array it was handed corrupts the
   * caller's state before the caller ever sees the next selection.
   */
  it("leaves the selection it was given untouched", async () => {
    const user = userEvent.setup();
    const selectedIds = ["c3"];
    render(
      <CategoryFilter
        categories={categories}
        onChange={vi.fn()}
        selectedIds={selectedIds}
      />
    );
    await user.click(screen.getByRole("button", { name: "Begroetingen" }));
    expect(selectedIds).toEqual(["c3"]);
  });

  it("keeps a selected id it has no category for", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategoryFilter
        categories={categories}
        onChange={onChange}
        selectedIds={["onbekend"]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Familie" }));
    expect(onChange).toHaveBeenCalledWith(["onbekend", "c2"]);
  });

  it("shows how many categories are selected", () => {
    render(
      <CategoryFilter
        categories={categories}
        onChange={vi.fn()}
        selectedIds={["c1", "c3"]}
      />
    );
    expect(screen.getByText("2 geselecteerd")).toBeDefined();
  });

  it("shows no count when nothing is selected", () => {
    render(<CategoryFilter categories={categories} onChange={vi.fn()} />);
    expect(screen.queryByText(/geselecteerd/)).toBeNull();
  });

  it("lets a caller phrase the count", () => {
    render(
      <CategoryFilter
        categories={categories}
        formatCount={(count) => `${count} gekozen`}
        onChange={vi.fn()}
        selectedIds={["c1"]}
      />
    );
    expect(screen.getByText("1 gekozen")).toBeDefined();
  });

  it("groups the toggles under a name", () => {
    render(<CategoryFilter categories={categories} onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Categorieën" })).toBeDefined();
  });

  it("lets a caller name the group", () => {
    render(
      <CategoryFilter
        categories={categories}
        label="Filter op categorie"
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByRole("group", { name: "Filter op categorie" })
    ).toBeDefined();
  });

  /*
   * A toggle inside a form must not submit it. `Button` sets no default
   * `type`, and an HTML button with no type is a submit button.
   */
  it("makes every toggle a plain button", () => {
    render(<CategoryFilter categories={categories} onChange={vi.fn()} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  it("distinguishes a selected toggle visually, not only in aria", () => {
    render(
      <CategoryFilter
        categories={categories}
        onChange={vi.fn()}
        selectedIds={["c1"]}
      />
    );
    const selected = classesOf(
      screen.getByRole("button", { name: "Begroetingen" })
    );
    const unselected = classesOf(
      screen.getByRole("button", { name: "Familie" })
    );
    expect(selected).toContain("bg-primary");
    expect(unselected).not.toContain("bg-primary");
  });

  it("forwards its ref to the group", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <CategoryFilter categories={categories} onChange={vi.fn()} ref={ref} />
    );
    expect(ref.current).toBe(screen.getByRole("group"));
  });

  it("lets className override a base class", () => {
    render(
      <CategoryFilter
        categories={categories}
        className="gap-12"
        onChange={vi.fn()}
      />
    );
    const classes = classesOf(screen.getByRole("group"));
    expect(classes).toContain("gap-12");
    expect(classes).not.toContain("gap-2");
  });
});
