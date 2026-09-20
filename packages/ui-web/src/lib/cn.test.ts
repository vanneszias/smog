import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets a later conflicting utility win", () => {
    expect(cn("bg-primary", "bg-red-500")).toBe("bg-red-500");
  });

  it("lets a caller className override a variant class", () => {
    const variant = "px-4 py-2 bg-primary text-primary-foreground";
    expect(cn(variant, "bg-red-500")).toContain("bg-red-500");
    expect(cn(variant, "bg-red-500")).not.toContain("bg-primary");
  });

  it("keeps non-conflicting utilities from both sides", () => {
    expect(cn("bg-primary px-4", "bg-red-500")).toContain("px-4");
  });

  /*
   * The two below are the assertions that separate a real merge from a
   * concatenation that only looks like one. `toContain` on the joined string
   * passes for `clsx` alone, because both classes survive and the winner is
   * left to CSS source order — exactly the failure Review Focus item 3 names.
   */

  it("emits the losing utility nowhere in the result", () => {
    expect(cn("bg-primary px-4 py-2", "bg-red-500").split(" ")).toEqual([
      "px-4",
      "py-2",
      "bg-red-500",
    ]);
  });

  it("resolves a conflict within a modifier", () => {
    expect(cn("hover:bg-primary", "hover:bg-red-500")).toBe("hover:bg-red-500");
  });

  /*
   * A caller's unmodified `bg-red-500` does not touch the variant's
   * `hover:bg-primary/90`: different modifiers are different properties as far
   * as the cascade is concerned. Overriding the hover colour takes a
   * `hover:` class of its own. Locked down here so nobody "fixes" it by
   * stripping modifiers.
   */
  it("leaves a modified utility alone when the override is unmodified", () => {
    expect(cn("bg-primary hover:bg-primary/90", "bg-red-500")).toBe(
      "hover:bg-primary/90 bg-red-500"
    );
  });
});
