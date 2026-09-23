import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeConsent } from "@/lib/consentStore";
import { GestureViewTracker } from "./GestureViewTracker";

describe("GestureViewTracker", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    fetchSpy.mockRestore();
  });

  it("renders nothing", () => {
    writeConsent("granted");

    act(() => {
      root.render(<GestureViewTracker gestureId="1" />);
    });

    expect(container.innerHTML).toBe("");
  });

  it("reports the view, as a direct one, once consent is granted", () => {
    writeConsent("granted");

    act(() => {
      root.render(<GestureViewTracker gestureId="42" />);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
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

  it("reports nothing for an undecided or refusing visitor", () => {
    act(() => {
      root.render(<GestureViewTracker gestureId="1" />);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => root.unmount());
    root = createRoot(container);
    writeConsent("denied");

    act(() => {
      root.render(<GestureViewTracker gestureId="1" />);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not report again when re-rendered with the same gesture id", () => {
    writeConsent("granted");

    act(() => {
      root.render(<GestureViewTracker gestureId="1" />);
    });
    act(() => {
      root.render(<GestureViewTracker gestureId="1" />);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
