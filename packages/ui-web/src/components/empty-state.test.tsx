import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

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
});
