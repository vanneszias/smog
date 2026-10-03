import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON, cronName, pendingRenderStarter } from "../src";

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

describe("pendingRenderStarter (ruling 7)", () => {
  it("logs that the mode is not available before phase 7 and leaves the job", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await pendingRenderStarter("container").start({
      input: {
        displayName: "Acme",
        logoKey: null,
        sourcePlaybackId: "abc",
        v: 1,
      },
      renderJobId: "r-1",
    });
    expect(log).toHaveBeenCalledWith(
      "[render] RENDER_MODE=container is not available before phase 7"
    );
  });
});
