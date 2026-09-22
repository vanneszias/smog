import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY } from "@/lib/consentStore";
import PrivacyPolicyPage from "./page";

/*
 * The page is an async Server Component, so it is awaited for its element
 * tree and that tree is then rendered into jsdom — `createRoot` and React's
 * own `act`, not `@testing-library/react`, for the reason every component
 * test in this app records: `apps/site` has no such dependency and adding
 * one would fail `knip`.
 *
 * Rendering the real page rather than `ConsentDeviceControl` on its own is
 * the entire point. The control's own suite proves the switch works; what
 * had to be proven here is that a reader who is *not signed in* can reach
 * one at all, on the page whose own text promises they can.
 */
let container: HTMLDivElement;
let root: Root;

describe("the privacy policy page", () => {
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

  const render = async (locale = "nl") => {
    const tree = await PrivacyPolicyPage({
      params: Promise.resolve({ locale }),
    });

    await act(async () => {
      root.render(tree);
    });
  };

  const switchEl = () =>
    container.querySelector('[role="switch"]') as HTMLButtonElement | null;

  it("puts a consent switch on the page itself, reachable without an account", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await render();

    expect(switchEl()).not.toBeNull();

    await act(async () => {
      switchEl()?.click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
    // A guest has no account for a row to be attached to, so nothing is sent
    // — the decision waits in the browser, exactly as the banner's does.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a visitor who already allowed analytics withdraw again", async () => {
    // `ConsentBanner` returns `null` once it has been answered, so before
    // this the answer was final for anyone without an account.
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");

    await render();
    expect(switchEl()?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      switchEl()?.click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
  });

  it("does not call the analytics anonymous, and says what is actually sent", async () => {
    /*
     * `forwardToOpenPanel` sends `x-client-ip` and `user-agent` with every
     * event. A policy that called that "anoniem" described a relay this app
     * does not have.
     */
    await render();

    const text = container.textContent ?? "";

    expect(text).not.toContain("anonieme");
    expect(text).toContain("niet anoniem");
    expect(text).toContain("IP-adres");
    expect(text).toContain("useragent");
  });
});
