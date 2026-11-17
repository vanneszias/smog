import { describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { Stepper } from "../../../../../ui-web/src/components/stepper";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("Stepper", () => {
  test("an ordered list in a labelled nav; the current step is marked", () => {
    renderKit(
      <Stepper
        current={1}
        steps={[
          { label: "Choose gestures" },
          { label: "Your details" },
          { label: "Preview and pay" },
        ]}
      />
    );
    const nav = screen.getByRole("navigation", { name: "Steps" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]?.getAttribute("aria-current")).toBe("step");
    expect(items[0]?.textContent).toContain("completed");
    expect(screen.getByText("Step 2 of 3")).toBeDefined();
    const marker = items[1]?.querySelector("[data-slot=step-marker]") ?? null;
    expect(classesOf(marker)).toContain("bg-primary");
  });

  test("the action tone makes the current step orange, done steps stay green", () => {
    renderKit(
      <Stepper
        current={1}
        steps={[{ label: "Choose" }, { label: "Pay" }]}
        tone="action"
      />
    );
    const markers = document.querySelectorAll("[data-slot=step-marker]");
    expect(classesOf(markers[0] ?? null)).toContain("bg-primary");
    expect(classesOf(markers[1] ?? null)).toContain("bg-highlight");
  });
});
