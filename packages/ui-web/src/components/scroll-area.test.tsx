import { describe, expect, test } from "bun:test";
import { classesOf, renderKit } from "../test/render";
import { ScrollArea } from "./scroll-area";

describe("ScrollArea", () => {
  test("wraps its content in a focusable viewport with the kit focus ring", () => {
    const { container } = renderKit(
      <ScrollArea className="h-24">
        <p>Long content</p>
      </ScrollArea>
    );
    expect(container.querySelector('[data-slot="scroll-area"]')).not.toBeNull();
    const viewport = container.querySelector(
      '[data-slot="scroll-area-viewport"]'
    );
    expect(viewport?.textContent).toBe("Long content");
    // A scrollable region is reachable by keyboard.
    expect(viewport?.getAttribute("tabindex")).toBe("0");
    expect(classesOf(viewport ?? null)).toContain("focus-visible:ring-ring");
  });
});
