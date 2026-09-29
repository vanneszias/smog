import { describe, expect, it } from "bun:test";
import { formatMoney } from "./money";

const EN_BE_TEN_FIFTY = /^€\s?10[.,]50$/;

/** Intl uses (narrow) no-break spaces; compare with plain spaces. */
function plain(value: string): string {
  return value.replace(/[  ]/g, " ");
}

describe("formatMoney", () => {
  it("formats euros for Dutch (Belgium)", () => {
    expect(plain(formatMoney(5000, "nl"))).toBe("€ 50,00");
  });

  it("formats euros for French (Belgium)", () => {
    expect(plain(formatMoney(6000, "fr"))).toBe("60,00 €");
  });

  it("formats euros for English (Belgium)", () => {
    expect(plain(formatMoney(1050, "en"))).toMatch(EN_BE_TEN_FIFTY);
  });

  it("formats thousands", () => {
    expect(plain(formatMoney(123_456, "nl"))).toBe("€ 1.234,56");
  });
});
