/**
 * @fileoverview Tests for sponsorship date calculation utilities.
 */

import { describe, expect, it } from "vitest";
import {
  activateDates,
  calculateEndDate,
  calculateEndDateFromWeeks,
  formatDateRange,
  formatSponsorshipDate,
  weeksToYears,
} from "../sponsorshipDates";

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

describe("calculateEndDate", () => {
  it("calculates 1 year from now", () => {
    const before = Date.now();
    const end = calculateEndDate(1);
    const after = Date.now();

    expect(end).toBeGreaterThanOrEqual(before + MS_PER_YEAR);
    expect(end).toBeLessThanOrEqual(after + MS_PER_YEAR);
  });

  it("scales linearly with duration", () => {
    const end2 = calculateEndDate(2);
    const end1 = calculateEndDate(1);
    // 2 years should be roughly double
    expect(end2 - Date.now()).toBeCloseTo(2 * (end1 - Date.now()), -5);
  });
});

describe("activateDates", () => {
  it("returns startDate close to now", () => {
    const before = Date.now();
    const { startDate } = activateDates(1);
    const after = Date.now();

    expect(startDate).toBeGreaterThanOrEqual(before);
    expect(startDate).toBeLessThanOrEqual(after);
  });

  it("endDate is startDate + durationYears", () => {
    const { startDate, endDate } = activateDates(1);
    expect(endDate - startDate).toBeCloseTo(MS_PER_YEAR, -5);
  });
});

describe("weeksToYears", () => {
  it("converts 52 weeks to 1 year", () => {
    expect(weeksToYears(52)).toBe(1);
  });

  it("rounds up partial years", () => {
    expect(weeksToYears(53)).toBe(2);
    expect(weeksToYears(1)).toBe(1);
  });

  it("converts 104 weeks to 2 years", () => {
    expect(weeksToYears(104)).toBe(2);
  });
});

describe("calculateEndDateFromWeeks", () => {
  it("produces the correct end date", () => {
    const before = Date.now();
    const end = calculateEndDateFromWeeks(52);
    const after = Date.now();

    expect(end).toBeGreaterThanOrEqual(before + 52 * MS_PER_WEEK);
    expect(end).toBeLessThanOrEqual(after + 52 * MS_PER_WEEK);
  });
});

describe("formatSponsorshipDate", () => {
  it("formats a timestamp as a locale date string", () => {
    const ts = new Date("2026-03-18").getTime();
    const result = formatSponsorshipDate(ts, "en-US");
    // Exact format varies by runtime; just verify it contains the year
    expect(result).toContain("2026");
  });
});

describe("formatDateRange", () => {
  it("formats a date range with both dates", () => {
    const start = new Date("2026-03-18").getTime();
    const end = new Date("2027-03-18").getTime();
    const result = formatDateRange(start, end, "en-US");
    expect(result).toContain("2026");
    expect(result).toContain("2027");
    expect(result).toContain("–");
  });

  it("shows dash for pending start (startDate = 0)", () => {
    const end = new Date("2027-03-18").getTime();
    const result = formatDateRange(0, end, "en-US");
    expect(result).toMatch(/^–/);
  });
});
