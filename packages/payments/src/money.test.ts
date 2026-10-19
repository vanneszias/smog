import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { centsToMollieValue, mollieValueToCents } from "./money";

const PARSE_FLOAT = /parseFloat\s*\(/;
const NUMBER_CALL = /\bNumber\s*\(/;

describe("centsToMollieValue", () => {
  it("writes integer cents as Mollie's two-decimal string", () => {
    expect(centsToMollieValue(5000)).toBe("50.00");
    expect(centsToMollieValue(6000)).toBe("60.00");
    expect(centsToMollieValue(1)).toBe("0.01");
    expect(centsToMollieValue(10)).toBe("0.10");
    expect(centsToMollieValue(0)).toBe("0.00");
    expect(centsToMollieValue(60_000)).toBe("600.00");
    expect(centsToMollieValue(123_456_789)).toBe("1234567.89");
  });

  it("refuses anything that is not a non-negative safe integer", () => {
    for (const bad of [
      -1,
      0.5,
      50.001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 53,
    ]) {
      expect(() => centsToMollieValue(bad)).toThrow("[payments]");
    }
  });
});

describe("mollieValueToCents", () => {
  it("reads Mollie's string into cents without a float", () => {
    expect(mollieValueToCents("50.00")).toBe(5000);
    expect(mollieValueToCents("0.01")).toBe(1);
    expect(mollieValueToCents("0.10")).toBe(10);
    expect(mollieValueToCents("600.00")).toBe(60_000);
    expect(mollieValueToCents("1234567.89")).toBe(123_456_789);
    // 0.1 + 0.2 style float traps do not apply.
    expect(mollieValueToCents("0.29")).toBe(29);
    expect(mollieValueToCents("1.15")).toBe(115);
  });

  it("refuses every other shape", () => {
    for (const bad of [
      "50",
      "50.0",
      "50.000",
      "-1.00",
      "1e3",
      "+1.00",
      " 50.00",
      "50.00 ",
      "50,00",
      ".50",
      "",
      "Infinity",
      "0x10.00",
      "99999999999999999.00",
    ]) {
      expect(() => mollieValueToCents(bad), bad).toThrow("[payments]");
    }
  });

  it("round-trips", () => {
    for (const cents of [0, 1, 99, 100, 5000, 6000, 59_990]) {
      expect(mollieValueToCents(centsToMollieValue(cents))).toBe(cents);
    }
  });
});

describe("the money path (global constraint)", () => {
  it("never parses an amount with parseFloat or Number(", () => {
    const { dir } = import.meta;
    const sources = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts")
      )
      .map((entry) => join(entry.parentPath, entry.name));
    expect(sources.length).toBeGreaterThan(3);
    for (const file of sources) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(PARSE_FLOAT);
      expect(source, file).not.toMatch(NUMBER_CALL);
    }
  });
});
