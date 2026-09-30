import { describe, expect, it } from "vitest";
import {
  formatCategories,
  parseCategories,
  validateGesturesSearch,
} from "../src/lib/gestures-search";

describe("parseCategories", () => {
  it("splits, trims, dedupes and drops empty parts", () => {
    expect(parseCategories(" dieren, ,familie,dieren,, ")).toEqual([
      "dieren",
      "familie",
    ]);
    expect(parseCategories(undefined)).toEqual([]);
    expect(parseCategories("")).toEqual([]);
  });

  it("bounds the slugs (length 120, at most 20)", () => {
    expect(parseCategories(`ok,${"x".repeat(121)}`)).toEqual(["ok"]);
    const many = Array.from({ length: 30 }, (_, index) => `c${index}`);
    expect(parseCategories(many.join(","))).toHaveLength(20);
  });

  it("formats back to ?category= (none for no slugs)", () => {
    expect(formatCategories(["a", "b"])).toBe("a,b");
    expect(formatCategories([])).toBeUndefined();
  });
});

describe("validateGesturesSearch", () => {
  it("keeps the known params, trimmed", () => {
    expect(
      validateGesturesSearch({
        category: "dieren,,familie",
        other: "x",
        q: "  hond ",
        selected: " kat ",
      })
    ).toEqual({ category: "dieren,familie", q: "hond", selected: "kat" });
  });

  it("drops empty and non-text values and bounds q to 100", () => {
    expect(
      validateGesturesSearch({ category: " , ", q: "   ", selected: {} })
    ).toEqual({});
    expect(validateGesturesSearch({ q: 42 })).toEqual({ q: "42" });
    expect(validateGesturesSearch({ q: "a".repeat(150) }).q).toHaveLength(100);
  });
});
