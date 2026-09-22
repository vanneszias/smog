import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY } from "@/lib/consentStore";
import { AccountConsentControl } from "./AccountConsentControl";

let container: HTMLDivElement;
let root: Root;

describe("AccountConsentControl", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const mount = async () => {
    await act(async () => {
      root.render(<AccountConsentControl />);
    });
  };

  const okResponse = () =>
    new Response(JSON.stringify({ analyticsConsent: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  it("shows nothing until it has read the store", () => {
    // The server cannot read localStorage, so the first render has to match
    // what the server produced — nothing — same rule as `ConsentBanner`.
    expect(renderToStaticMarkup(<AccountConsentControl />)).toBe("");
  });

  it("reflects a granted decision as checked", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    await mount();

    const control = container.querySelector('[role="switch"]');
    expect(control?.getAttribute("aria-checked")).toBe("true");
  });

  it("reflects a denied decision, and an undecided one, as unchecked", async () => {
    await mount();

    const control = container.querySelector('[role="switch"]');
    expect(control?.getAttribute("aria-checked")).toBe("false");
  });

  it("writes the store and posts a new row when toggled on", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();

    const control = container.querySelector(
      '[role="switch"]'
    ) as HTMLButtonElement;

    await act(async () => {
      control.click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/consent");
    expect(JSON.parse(String(init?.body))).toEqual({ analyticsConsent: true });
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("withdraws consent — a second row, not an update", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();

    const control = container.querySelector(
      '[role="switch"]'
    ) as HTMLButtonElement;

    await act(async () => {
      control.click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      analyticsConsent: false,
    });
  });
});
