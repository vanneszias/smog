import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { IconButton } from "./icon-button";
import { Tooltip, TooltipProvider } from "./tooltip";

describe("Tooltip", () => {
  test("shows its content as a tooltip describing the trigger", () => {
    renderKit(
      <TooltipProvider>
        <Tooltip content="Copy link" defaultOpen>
          <IconButton icon={<svg />} label="Copy" />
        </Tooltip>
      </TooltipProvider>
    );
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("Copy link");
    const trigger = screen.getByRole("button", { name: "Copy" });
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
    // Radix puts the role on the bubble or on a hidden copy inside it.
    const bubble = tooltip.closest("[data-slot=tooltip]");
    expect(classesOf(bubble)).toContain("bg-foreground");
    expect(classesOf(bubble)).toContain("motion-reduce:animate-none");
  });
});
