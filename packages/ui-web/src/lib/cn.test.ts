import { describe, expect, test } from "bun:test";
import { cn } from "./cn";

describe("cn", () => {
  test("keeps a token font size next to a token colour", () => {
    expect(cn("text-body", "text-primary")).toBe("text-body text-primary");
  });

  test("the last class of a group wins", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
    expect(cn("bg-primary", "bg-danger")).toBe("bg-danger");
    expect(cn("shadow-1", "shadow-2")).toBe("shadow-2");
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow");
    expect(cn("min-h-touch", "min-h-12")).toBe("min-h-12");
    expect(cn("font-regular", "font-semibold")).toBe("font-semibold");
  });

  test("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});
