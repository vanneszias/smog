import { describe, expect, test } from "bun:test";
import { priceSponsorship, SponsorshipPricingError } from "./pricing";

describe("priceSponsorship (spec §5.6, ruling 3)", () => {
  for (let count = 1; count <= 10; count += 1) {
    test(`${count} gesture(s) without a logo: ${count} × 50.00`, () => {
      const price = priceSponsorship({ count, logo: false });
      expect(price.perGestureCents).toBe(5000);
      expect(price.totalCents).toBe(count * 5000);
      expect(price.items).toHaveLength(count);
      expect(
        price.items.every(
          (item) => item.amountCents === 5000 && !item.includesLogo
        )
      ).toBe(true);
    });

    test(`${count} gesture(s) with a logo: ${count} × 60.00`, () => {
      const price = priceSponsorship({ count, logo: true });
      expect(price.perGestureCents).toBe(6000);
      expect(price.totalCents).toBe(count * 6000);
      expect(
        price.items.every(
          (item) => item.amountCents === 6000 && item.includesLogo
        )
      ).toBe(true);
    });
  }

  test("the items add up to the total, in integer cents", () => {
    const price = priceSponsorship({ count: 7, logo: true });
    const sum = price.items.reduce(
      (total, item) => total + item.amountCents,
      0
    );
    expect(sum).toBe(price.totalCents);
    expect(Number.isSafeInteger(price.totalCents)).toBe(true);
  });

  test.each([0, 11, -1, 1.5, Number.NaN])("refuses %p gestures", (count) => {
    expect(() => priceSponsorship({ count, logo: false })).toThrow(
      SponsorshipPricingError
    );
  });
});
