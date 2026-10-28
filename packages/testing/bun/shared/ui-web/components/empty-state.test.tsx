import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { Button } from "../../../../../ui-web/src/components/button";
import { EmptyState } from "../../../../../ui-web/src/components/empty-state";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("EmptyState", () => {
  test("defaults to the states.empty copy and shows the next action", () => {
    renderKit(<EmptyState action={<Button>Browse</Button>} />);
    const heading = screen.getByRole("heading", { name: "Nothing here yet" });
    expect(classesOf(heading)).toContain("text-title-3");
    expect(
      screen.getByText("As soon as there's something, you'll find it here.")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Browse" })).toBeDefined();
  });

  test("custom copy and a decorative illustration", () => {
    const { container } = renderKit(
      <EmptyState description="Add one" illustration title="No favorites" />
    );
    expect(screen.getByRole("heading", { name: "No favorites" })).toBeDefined();
    const art = container.querySelector("[data-slot=empty-illustration]");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
  });

  test("is the page's h1 at level 1, sized as a screen title", () => {
    renderKit(<EmptyState level={1} title="Paused" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Paused" });
    expect(classesOf(heading)).toContain("text-title-1");
  });
});
