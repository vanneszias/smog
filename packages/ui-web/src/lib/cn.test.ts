import { describe, expect, test } from "bun:test";
import { cn } from "./cn";

describe("cn", () => {
  test("keeps a token font size next to a token colour", () => {
    expect(cn("text-body", "text-primary")).toBe("text-body text-primary");
  });

  test("the last class of a group wins", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
    expect(cn("bg-primary", "bg-destructive")).toBe("bg-destructive");
    expect(cn("shadow-1", "shadow-2")).toBe("shadow-2");
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow");
    expect(cn("min-h-touch", "min-h-12")).toBe("min-h-12");
    expect(cn("font-regular", "font-semibold")).toBe("font-semibold");
  });

  test("resolves conflicts between token and Tailwind default classes", () => {
    // Registry code writes the defaults, the kit writes the tokens.
    expect(cn("text-body", "text-sm")).toBe("text-sm");
    expect(cn("text-sm", "text-title-1")).toBe("text-title-1");
    expect(cn("shadow-1", "shadow-md")).toBe("shadow-md");
    expect(cn("shadow-md", "shadow-2")).toBe("shadow-2");
    expect(cn("rounded-md", "rounded-xl")).toBe("rounded-xl");
    expect(cn("size-9", "size-touch")).toBe("size-touch");
    expect(cn("font-bold", "font-regular")).toBe("font-regular");
    expect(cn("ease-in-out", "ease-standard")).toBe("ease-standard");
  });

  test("keeps a font size next to the shadcn colour roles", () => {
    expect(cn("text-sm", "text-muted-foreground")).toBe(
      "text-sm text-muted-foreground"
    );
    expect(cn("text-body-sm", "text-highlight-foreground")).toBe(
      "text-body-sm text-highlight-foreground"
    );
    expect(cn("bg-card", "bg-accent")).toBe("bg-accent");
    expect(cn("bg-sidebar", "text-sidebar-foreground")).toBe(
      "bg-sidebar text-sidebar-foreground"
    );
    expect(cn("border-input", "border-ring")).toBe("border-ring");
  });

  test("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});
