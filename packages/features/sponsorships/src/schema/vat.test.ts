import { describe, expect, test } from "bun:test";
import { normalizeBelgianVat, vatNumberSchema } from "./vat";

describe("normalizeBelgianVat (ruling 3)", () => {
  test("accepts a valid number as 10 digits", () => {
    expect(normalizeBelgianVat("0123456749")).toBe("0123456749");
  });

  test("refuses 0000000000 (the check digits cannot be 97)", () => {
    expect(normalizeBelgianVat("0000000000")).toBeNull();
  });

  test.each([
    "BE 0123.456.749",
    "be0123456749",
    "Be 0123 456 749",
    " 0123.456.749 ",
  ])("normalises %p", (input) => {
    expect(normalizeBelgianVat(input)).toBe("0123456749");
  });

  test.each([
    ["a wrong check", "0123456748"],
    ["9 digits", "123456749"],
    ["11 digits", "01234567490"],
    ["letters", "0123A56749"],
    ["another country", "NL0123456749"],
    ["empty", ""],
    ["a dash", "0123-456-749"],
  ])("refuses %s", (_label, input) => {
    expect(normalizeBelgianVat(input)).toBeNull();
  });

  test("the schema stores the normalised number and refuses a wrong one", () => {
    expect(vatNumberSchema.parse("BE 0123.456.749")).toBe("0123456749");
    expect(vatNumberSchema.safeParse("0123456748").success).toBe(false);
  });
});
