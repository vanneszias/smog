import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeConsent } from "@/lib/consentStore";
import { trackEvent } from "./analytics";

/**
 * The gate, asserted against the network rather than a return value.
 *
 * `trackEvent` returns `undefined` on every path — the one that sends and
 * the one that does not — so a test that only checked the return value would
 * pass against a client that fired the request and *then* returned early.
 * Spying on `fetch` and asserting it was never called is the only version of
 * this test that would catch that bug, which is exactly what the task brief
 * calls out.
 */
describe("trackEvent", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("sends nothing for a visitor who has not answered yet", () => {
    // No `writeConsent` call at all: `readConsent()` is `null`.
    trackEvent("gesture_viewed", { gesture_id: "1", source: "direct" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends nothing for a visitor who refused", () => {
    writeConsent("denied");

    trackEvent("gesture_viewed", { gesture_id: "1", source: "direct" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the relay for a visitor who granted consent", () => {
    writeConsent("granted");

    trackEvent("gesture_viewed", { gesture_id: "42", source: "direct" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/analytics/track");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({
      payload: {
        name: "gesture_viewed",
        properties: {
          gesture_id: "42",
          platform: "web",
          source: "direct",
        },
      },
      type: "track",
    });
  });

  it("never throws when the relay request fails", () => {
    writeConsent("granted");
    fetchSpy.mockRejectedValue(new Error("network down"));

    expect(() =>
      trackEvent("gesture_viewed", { gesture_id: "1", source: "direct" })
    ).not.toThrow();
  });

  it("reads the live consent value, not a cached one", () => {
    writeConsent("granted");
    trackEvent("search_performed", {
      category_count: 0,
      has_results: true,
      query_length: 3,
      result_count: 5,
      source: "filter_change",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    writeConsent("denied");
    trackEvent("search_performed", {
      category_count: 0,
      has_results: true,
      query_length: 3,
      result_count: 5,
      source: "filter_change",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
