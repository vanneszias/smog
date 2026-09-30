import { describe, expect, test } from "bun:test";
import { dayRange, formatDate } from "./index";

describe("dayRange (Europe/Brussels calendar days)", () => {
  test("a summer day starts at 22:00 UTC the day before", () => {
    expect(dayRange("2026-09-30")).toEqual({
      end: Date.UTC(2026, 8, 30, 22) - 1,
      start: Date.UTC(2026, 8, 29, 22),
    });
  });

  test("a winter day starts at 23:00 UTC the day before", () => {
    expect(dayRange("2026-01-15")).toEqual({
      end: Date.UTC(2026, 0, 15, 23) - 1,
      start: Date.UTC(2026, 0, 14, 23),
    });
  });

  test("the spring-forward day has 23 hours", () => {
    const range = dayRange("2026-03-29");
    expect(range).toEqual({
      end: Date.UTC(2026, 2, 29, 22) - 1,
      start: Date.UTC(2026, 2, 28, 23),
    });
  });

  test("its bounds are the same day as formatDate shows", () => {
    const range = dayRange("2026-10-25");
    if (!range) {
      throw new Error("no range");
    }
    expect(formatDate(range.start, "nl")).toBe("25 oktober 2026");
    expect(formatDate(range.end, "nl")).toBe("25 oktober 2026");
    expect(formatDate(range.end + 1, "nl")).toBe("26 oktober 2026");
  });

  test("anything but a real YYYY-MM-DD is undefined", () => {
    expect(dayRange("2026-02-30")).toBeUndefined();
    expect(dayRange("30/09/2026")).toBeUndefined();
    expect(dayRange("")).toBeUndefined();
  });
});
