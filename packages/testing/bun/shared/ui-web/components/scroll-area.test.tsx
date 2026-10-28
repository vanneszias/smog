import { describe, expect, test } from "bun:test";
import { ScrollArea } from "../../../../../ui-web/src/components/scroll-area";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

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
