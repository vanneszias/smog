import { describe, expect, it } from "bun:test";
import { addDays, DAY_MS } from "./time";

describe("time", () => {
  it("DAY_MS is one day in milliseconds", () => {
    expect(DAY_MS).toBe(86_400_000);
  });

  it("addDays adds whole days", () => {
    const start = Date.UTC(2026, 0, 1);
    expect(addDays(start, 365)).toBe(Date.UTC(2027, 0, 1));
    expect(addDays(start, -1)).toBe(Date.UTC(2025, 11, 31));
  });
});
