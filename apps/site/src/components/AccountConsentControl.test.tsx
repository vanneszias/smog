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

  const mount = async (
    props: Parameters<typeof AccountConsentControl>[0] = {
      initialConsent: null,
      locale: "nl",
    }
  ) => {
    await act(async () => {
      root.render(<AccountConsentControl {...props} />);
    });
  };

  const okResponse = () =>
    new Response(JSON.stringify({ analyticsConsent: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  const switchEl = () =>
    container.querySelector('[role="switch"]') as HTMLButtonElement;

  it("shows nothing for the switch until it has read the store", () => {
    // The server cannot read localStorage, so the first render has to match
    // what the server produced for that half — nothing — same rule as
    // `ConsentBanner`. The recorded-decision caption is unaffected: it is
    // server-known already, see the next tests.
    const html = renderToStaticMarkup(
      <AccountConsentControl initialConsent={null} locale="nl" />
    );
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

  it("writes the store and posts a new row when toggled on", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();
    await act(async () => {
      switchEl().click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/consent");
    expect(JSON.parse(String(init?.body))).toEqual({ analyticsConsent: true });
    expect(switchEl().getAttribute("aria-checked")).toBe("true");
  });

  it("withdraws consent — a second row, not an update", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();
    await act(async () => {
      switchEl().click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      analyticsConsent: false,
    });
  });

  /*
   * Ruling 11 (per the coordinator's decision on this task): the server
   * never writes the browser's consent flag, so the switch's state must
   * come from `localStorage` alone, never from the account's recorded row —
   * even when the two disagree. This is the assertion that pins it: the row
   * says `granted`, `localStorage` says `denied`, and the switch must still
   * show `denied`. A future edit that folded `initialConsent` into the
   * switch's initial `checked` value — even only as a fallback — makes this
   * fail by name.
   */
  it("the switch is unaffected by what the account's row says", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "denied");

    await mount({
      initialConsent: {
        analyticsConsent: true,
        recordedAt: "2026-01-05T00:00:00.000Z",
      },
      locale: "nl",
    });

    expect(switchEl()?.getAttribute("aria-checked")).toBe("false");
  });

  it("renders the recorded answer and its date when a row exists", async () => {
    await mount({
      initialConsent: {
        analyticsConsent: true,
        recordedAt: "2026-01-05T00:00:00.000Z",
      },
      locale: "nl",
    });

    const caption = container.querySelector(
      '[data-testid="account-consent-record"]'
    );
    expect(caption?.textContent).toContain("toegestaan");
    expect(caption?.textContent).toContain("5 januari 2026");
  });

  it("renders a refusal too, not only an acceptance", async () => {
    await mount({
      initialConsent: {
        analyticsConsent: false,
        recordedAt: "2026-02-11T00:00:00.000Z",
      },
      locale: "en",
    });

    const caption = container.querySelector(
      '[data-testid="account-consent-record"]'
    );
    expect(caption?.textContent).toContain("declined");
    expect(caption?.textContent).toContain("11 February 2026");
  });

  it("renders the no-answer state when there is no recorded row, not a default that reads as a refusal", async () => {
    await mount({ initialConsent: null, locale: "fr" });

    const caption = container.querySelector(
      '[data-testid="account-consent-record"]'
    );
    expect(caption?.textContent).toBe(
      "Aucune réponse n'est encore enregistrée pour votre compte."
    );
  });

  it("speaks each locale for the device-scoped label", async () => {
    const rendered = new Set<string>();

    for (const locale of ["nl", "en", "fr"] as const) {
      await act(async () => {
        root.unmount();
      });
      root = createRoot(container);
      await mount({ initialConsent: null, locale });
      rendered.add(container.textContent ?? "");
    }

    expect(rendered.size).toBe(3);
  });
});
