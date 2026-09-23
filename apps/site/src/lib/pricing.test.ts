import { MAX_GESTURES_PER_SPONSORSHIP } from "@smog/config/constants";
import { describe, expect, it } from "vitest";
import { sponsorshipAmountCents } from "./pricing";

describe("sponsorshipAmountCents", () => {
  it("charges EUR 50.00 for one gesture for one year", () => {
    expect(sponsorshipAmountCents(1, false)).toBe(5000);
  });

  it("adds EUR 10.00 per gesture when a logo is included", () => {
    expect(sponsorshipAmountCents(1, true)).toBe(6000);
  });

  it("multiplies both parts by the number of gestures", () => {
    expect(sponsorshipAmountCents(3, false)).toBe(15_000);
    expect(sponsorshipAmountCents(3, true)).toBe(18_000);
  });

  it("agrees with the established calculation across the whole legal range", () => {
    // A mistyped constant is the risk here, not arithmetic. The numbers on the
    // right are written out as literals on purpose: the implementation
    // imports them from `@smog/config/constants`, so if a constant is
    // mistyped — or if this app grows a second copy of it — these
    // expectations disagree and the suite says so. Reading the same
    // constant on both sides would make this test agree with itself.
    //
    // The calculation:
    //   subtotal  = PRICE_PER_YEAR_CENTS * gestureCount
    //   logoTotal = includeLogo ? LOGO_ADDON_CENTS * gestureCount : 0
    for (let n = 1; n <= MAX_GESTURES_PER_SPONSORSHIP; n += 1) {
      for (const logo of [false, true]) {
        expect(sponsorshipAmountCents(n, logo)).toBe(
          5000 * n + (logo ? 1000 * n : 0)
        );
      }
    }
  });

  it("returns whole cents across the whole legal range", () => {
    // Mollie takes a decimal string with exactly two places. A fractional
    // cent count becomes "49.000000000000004" and the API rejects the
    // payment — at the moment the sponsor presses pay.
    for (let n = 1; n <= MAX_GESTURES_PER_SPONSORSHIP; n += 1) {
      for (const logo of [false, true]) {
        expect(Number.isInteger(sponsorshipAmountCents(n, logo))).toBe(true);
      }
    }
  });

  it("refuses a fractional gesture count rather than pricing it", () => {
    // The positive half of the guard above. Integer constants multiplied by
    // an integer count are always whole, so the range test alone cannot
    // fail; what it cannot rule out is a *non-integer* count reaching the
    // multiplication, which is the only way this function can produce a
    // fraction. `2.5` would otherwise be priced at 12500 and quietly
    // charged.
    expect(() => sponsorshipAmountCents(2.5, false)).toThrow(
      /whole number of gestures/i
    );
    expect(() => sponsorshipAmountCents(Number.NaN, false)).toThrow(
      /whole number of gestures/i
    );
  });

  it("refuses a zero or negative gesture count", () => {
    // A zero-amount payment is a Mollie API error at press time, and a
    // negative one is a refund nobody asked for.
    expect(() => sponsorshipAmountCents(0, false)).toThrow();
    expect(() => sponsorshipAmountCents(-1, true)).toThrow();
  });

  it("refuses more gestures than one sponsorship may cover", () => {
    // The order form's own cap is on the selection endpoint. This
    // is the same cap on the money path, reading the same constant, because
    // a hand-built POST that skips the form must not be able to talk this
    // function into quoting a price nobody offers.
    expect(() =>
      sponsorshipAmountCents(MAX_GESTURES_PER_SPONSORSHIP + 1, false)
    ).toThrow();
    // Paired with the boundary that must still be priced, so a guard that
    // refuses everything cannot pass as a guard that refuses too much.
    expect(sponsorshipAmountCents(MAX_GESTURES_PER_SPONSORSHIP, false)).toBe(
      5000 * MAX_GESTURES_PER_SPONSORSHIP
    );
  });
});
