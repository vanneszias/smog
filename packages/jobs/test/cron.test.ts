import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON, cronName } from "../src";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CRON (ruling 9, UTC)", () => {
  it("is the four schedules", () => {
    expect(CRON).toEqual({
      expiry: "0 0 * * *",
      reminders: "0 8 * * *",
      retention: "15 3 * * *",
      stale: "0 * * * *",
    });
  });

  it("names a schedule, and nothing for an unknown one", () => {
    expect(cronName("0 0 * * *")).toBe("expiry");
    expect(cronName("15 3 * * *")).toBe("retention");
    expect(cronName("0 3 1 * *")).toBeNull();
  });
});
