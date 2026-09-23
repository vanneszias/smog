import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY, writeConsent } from "@/lib/consentStore";
import { ConsentDeviceControl } from "./ConsentDeviceControl";

let container: HTMLDivElement;
let root: Root;

describe("ConsentDeviceControl", () => {
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

  const mount = async (locale: "en" | "fr" | "nl" = "nl") => {
    await act(async () => {
      root.render(<ConsentDeviceControl locale={locale} />);
    });
  };

  const switchEl = () =>
    container.querySelector('[role="switch"]') as HTMLButtonElement;

  it("shows nothing until it has read the store", () => {
    // The server cannot read localStorage, so the first render has to match
    // what the server produced — nothing. Same rule as `ConsentBanner`.
    const html = renderToStaticMarkup(<ConsentDeviceControl locale="nl" />);

    expect(html).not.toContain('role="switch"');
  });

  it("reflects a granted decision as checked", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    await mount();

    expect(switchEl()?.getAttribute("aria-checked")).toBe("true");
  });

  it("reflects a denied decision, and an undecided one, as unchecked", async () => {
    await mount();

    expect(switchEl()?.getAttribute("aria-checked")).toBe("false");
  });

  it("writes the decision to the store when toggled on", async () => {
    await mount();
    await act(async () => {
      switchEl().click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
    expect(switchEl().getAttribute("aria-checked")).toBe("true");
  });

  it("withdraws a decision that was already given", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    await mount();
    await act(async () => {
      switchEl().click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
  });

  /*
   * A guest has no account to attach a row to, and this control is on the
   * privacy page precisely so a guest can reach it. The POST is
   * `ConsentSync`'s job and `ConsentSync` is the only caller of it — two
   * writers for one toggle is two rows in an append-only table.
   */
  it("sends nothing itself, on any toggle", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await mount();
    await act(async () => {
      switchEl().click();
    });
    await act(async () => {
      switchEl().click();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /*
   * Two controls for one decision are on screen at once — this switch and
   * the banner — so a switch that only read the store on mount would show a
   * stale "off" next to a notice the visitor had just accepted.
   */
  it("follows a decision made elsewhere on the same page", async () => {
    await mount();
    expect(switchEl().getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      writeConsent("granted");
    });

    expect(switchEl().getAttribute("aria-checked")).toBe("true");
  });

  it("speaks each locale", async () => {
    const rendered = new Set<string>();

    for (const locale of ["nl", "en", "fr"] as const) {
      await act(async () => {
        root.unmount();
      });
      root = createRoot(container);
      await mount(locale);
      rendered.add(container.textContent ?? "");
    }

    expect(rendered.size).toBe(3);
  });
});
