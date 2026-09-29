import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Sheet, SheetContent } from "./sheet";

describe("Sheet", () => {
  test("auto: a bottom sheet on mobile, a side panel from md up", () => {
    renderKit(
      <Sheet open>
        <SheetContent title="Filters">Body</SheetContent>
      </Sheet>
    );
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    const classes = classesOf(sheet);
    expect(classes).toContain("bottom-0");
    expect(classes).toContain("md:right-0");
    expect(classes).toContain("motion-reduce:animate-none");
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  test("side variants", () => {
    renderKit(
      <Sheet open>
        <SheetContent side="left" title="Menu">
          Body
        </SheetContent>
      </Sheet>
    );
    expect(classesOf(screen.getByRole("dialog", { name: "Menu" }))).toContain(
      "left-0"
    );
  });
});
