import { cn } from "./cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy entries", () => {
    expect(cn("a", false, undefined, "c")).toBe("a c");
  });

  it("lets the last conflicting class win", () => {
    expect(cn("bg-surface", "bg-primary")).toBe("bg-primary");
  });

  it("keeps classes that only look like they conflict", () => {
    expect(cn("p-md", "px-lg")).toBe("p-md px-lg");
  });
});
